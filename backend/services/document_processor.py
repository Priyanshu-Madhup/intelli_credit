import os
import re
import json
import numpy as np
import pymupdf as fitz  # PyMuPDF >= 1.24
import faiss
import tiktoken
from groq import Groq
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Tuple, Optional
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
FAISS_INDEX_PATH: str = os.getenv("FAISS_INDEX_PATH", "faiss_index.bin")
FAISS_METADATA_PATH: str = os.getenv("FAISS_METADATA_PATH", "faiss_metadata.json")
TOKEN_THRESHOLD: int = int(os.getenv("TOKEN_THRESHOLD", "2000"))
EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# Groq context limits for llama-3.3-70b-versatile (128k context, 8k output)
GROQ_INPUT_TOKEN_LIMIT: int = 6000   # safe window size per LLM call
GROQ_RESPONSE_TOKEN_BUDGET: int = 2048  # max tokens allocated for LLM JSON output

_embedding_model: Optional[SentenceTransformer] = None

# ---------------------------------------------------------------------------
# In-memory FAISS cache (avoids disk I/O on every query)
# ---------------------------------------------------------------------------
_cached_index: Optional[faiss.Index] = None
_cached_metadata: Optional[List[Dict]] = None


def _get_embedding_model() -> SentenceTransformer:
    """Lazy-load and cache the SentenceTransformer embedding model."""
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = SentenceTransformer(EMBEDDING_MODEL)
    return _embedding_model


# ---------------------------------------------------------------------------
# 1. TOKEN COUNTING
# ---------------------------------------------------------------------------

def count_tokens(text: str) -> int:
    """
    Count tokens in a text string using a LLaMA-compatible tokenizer.

    Uses tiktoken's cl100k_base encoding as a close approximation for
    LLaMA token counts (within ~5% of the true LLaMA tokenizer).

    Args:
        text: Input text to tokenize.

    Returns:
        Total token count.
    """
    enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))


# ---------------------------------------------------------------------------
# 2. TEXT EXTRACTION
# ---------------------------------------------------------------------------

def extract_text_from_pdf(file_path: str) -> str:
    """
    Extract raw text from a PDF file using PyMuPDF.

    Args:
        file_path: Absolute or relative path to the PDF file.

    Returns:
        Extracted text as a single concatenated string.

    Raises:
        FileNotFoundError: If the PDF does not exist at the given path.
        ValueError: If no text could be extracted from the document.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"PDF not found: {file_path}")

    doc = fitz.open(file_path)
    pages: List[str] = []

    for page in doc:
        text = page.get_text("text")
        if text.strip():
            pages.append(text)
    doc.close()

    if not pages:
        raise ValueError(f"No extractable text found in: {file_path}")

    return "\n".join(pages)


def extract_company_name(text: str) -> str:
    """
    Use Groq to identify the primary company/entity whose financial data
    is reported in a document.

    Takes the first ~2000 tokens of text as a representative sample.

    Args:
        text: Full extracted document text.

    Returns:
        Detected company name, or empty string if not found / API unavailable.
    """
    if not GROQ_API_KEY:
        return ""
    try:
        enc = tiktoken.get_encoding("cl100k_base")
        tokens = enc.encode(text)
        sample = enc.decode(tokens[:2000]) if len(tokens) > 2000 else text

        client = Groq(api_key=GROQ_API_KEY)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{
                "role": "user",
                "content": (
                    "From the document excerpt below, identify the primary company or "
                    "organization whose financial data is being reported. "
                    "Return ONLY the company name, exactly as it appears — nothing else. "
                    "If you cannot determine it with confidence, return 'Unknown'.\n\n"
                    f"Document excerpt:\n{sample}"
                ),
            }],
            temperature=0.0,
            max_tokens=60,
        )
        name = response.choices[0].message.content.strip()
        return "" if name.lower() in ("unknown", "") else name
    except Exception:
        return ""


def _extract_company_name_local(text: str) -> str:
    """
    Fast regex-based company name detection — NO LLM call.
    Used during upload to avoid slow Groq roundtrips.
    """
    # Try common patterns on the first 3000 chars
    sample = text[:3000]

    # Pattern: "XYZ Limited", "XYZ Ltd", "XYZ Pvt Ltd", "XYZ Private Limited", "XYZ LLP"
    patterns = [
        r'([A-Z][A-Za-z0-9 &\-]+(?:Private Limited|Pvt\.?\s*Ltd\.?|Limited|Ltd\.?|LLP|LLC|Inc\.?|Corp\.?))',
        r'(?:Company|Entity|Borrower|Client|Applicant)\s*[:\-]\s*([A-Z][A-Za-z0-9 &\-]+)',
        r'^([A-Z][A-Z A-Za-z0-9&\-]{5,50})\n',  # First bold-looking line
    ]
    for pat in patterns:
        m = re.search(pat, sample)
        if m:
            name = m.group(1).strip().strip('.')
            if 5 < len(name) < 80:
                return name
    return ""


def _extract_pages_text(file_path: str) -> List[Dict]:
    """
    Internal helper: extract text per page with page-number metadata.

    Args:
        file_path: Path to the PDF file.

    Returns:
        List of dicts with keys 'page' (1-indexed int) and 'text' (str).
    """
    doc = fitz.open(file_path)
    pages = []
    for page_num, page in enumerate(doc, start=1):
        text = page.get_text("text")
        if text.strip():
            pages.append({"page": page_num, "text": text})
    doc.close()
    return pages


# ---------------------------------------------------------------------------
# 3. CHUNKING  —  one tiny planning call + pure-Python token splitter
# ---------------------------------------------------------------------------
#
# Design:
#   Step A) Count tokens (tiktoken, zero API calls).
#   Step B) ONE tiny LLM call (≤ 40 output tokens) asking for chunk_size
#           and overlap.  Falls back to a heuristic if the API is unavailable.
#   Step C) chunk_by_tokens() splits the token stream deterministically —
#           NO further LLM calls, no re-writing of content.
# ---------------------------------------------------------------------------


def _heuristic_chunking_plan(token_count: int) -> Dict:
    """Deterministic fallback: derive chunk_size/overlap from token_count."""
    if token_count < 1_000:
        return {"chunk_size": 200, "overlap": 30}
    elif token_count < 5_000:
        return {"chunk_size": 350, "overlap": 50}
    elif token_count < 20_000:
        return {"chunk_size": 450, "overlap": 65}
    elif token_count < 60_000:
        return {"chunk_size": 500, "overlap": 75}
    else:
        return {"chunk_size": 600, "overlap": 90}


def _plan_chunking(token_count: int) -> Dict:
    """
    Decide chunk_size and overlap with ONE tiny LLM call (≤ 40 output tokens).

    Prompt is ~30 input tokens.  Response is a JSON object like
    {"chunk_size": 450, "overlap": 65} — usually ~15 tokens.
    Falls back to _heuristic_chunking_plan if unavailable.
    """
    if not GROQ_API_KEY:
        return _heuristic_chunking_plan(token_count)

    try:
        client = Groq(api_key=GROQ_API_KEY)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{
                "role": "user",
                "content": (
                    f"Financial PDF: {token_count} tokens. "
                    "Target 20-60 RAG chunks, overlap ~15% of chunk_size. "
                    "Reply with ONLY valid JSON, no explanation: "
                    '{"chunk_size": <int 200-600>, "overlap": <int 20-100>}'
                ),
            }],
            temperature=0.0,
            max_tokens=40,   # The entire response is a tiny JSON object
        )
        raw = response.choices[0].message.content.strip()
        raw = re.sub(r"```[a-zA-Z]*\n?", "", raw).strip("`\n ")
        plan = json.loads(raw)
        chunk_size = max(200, min(600, int(plan.get("chunk_size", 400))))
        overlap    = max(20,  min(100, int(plan.get("overlap",     60))))
        return {"chunk_size": chunk_size, "overlap": overlap}
    except Exception:
        return _heuristic_chunking_plan(token_count)


def chunk_by_tokens(text: str, chunk_size: int, overlap: int) -> List[Dict]:
    """
    Token-aware chunking — split the raw token stream with tiktoken.
    Produces chunks of exactly chunk_size tokens (last chunk may be shorter)
    with `overlap` tokens carried over between consecutive chunks.

    No LLM calls.  Preserves every number, percentage, and financial figure
    exactly as-is because we are splitting at token boundaries, not sentences.
    """
    enc = tiktoken.get_encoding("cl100k_base")
    all_tokens = enc.encode(text)
    total = len(all_tokens)
    if total == 0:
        return []

    step   = max(chunk_size - overlap, 1)
    chunks = []
    start  = 0
    idx    = 1

    while start < total:
        end         = min(start + chunk_size, total)
        chunk_text  = enc.decode(all_tokens[start:end])
        if chunk_text.strip():
            # Derive a readable section name from the first few words
            preview = " ".join(chunk_text.split()[:8])[:60]
            section = f"Segment {idx}: {preview}" if preview else f"Segment {idx}"
            chunks.append({"section": section, "content": chunk_text})
            idx += 1
        if end >= total:
            break
        start += step

    return chunks


# kept as emergency fallback (called only if chunk_by_tokens returns [])
def _compute_chunking_plan(token_count: int) -> Dict:
    """
    Given total document token count, compute an optimal chunking plan.

    Returns dict with:
        - target_chunks: ideal number of chunks
        - tokens_per_chunk: target tokens per chunk (for simple fallback)
        - sections_per_window: how many sections the LLM should produce per call
        - window_token_size: how many tokens of text to send per LLM call
        - max_windows: max number of LLM calls to make
    """
    if token_count <= 500:
        # Very small doc: 2-4 chunks of ~100-150 tokens
        return {
            "target_chunks": max(2, token_count // 150),
            "tokens_per_chunk": 150,
            "sections_per_window": max(2, token_count // 150),
            "window_token_size": token_count,
            "max_windows": 1,
        }
    elif token_count <= 2000:
        # Small doc: 5-10 chunks of ~200 tokens
        target = max(5, token_count // 200)
        return {
            "target_chunks": target,
            "tokens_per_chunk": 200,
            "sections_per_window": min(target, 6),
            "window_token_size": min(token_count, GROQ_INPUT_TOKEN_LIMIT),
            "max_windows": 1,
        }
    elif token_count <= 8000:
        # Medium doc: 10-25 chunks of ~250-350 tokens
        target = max(10, token_count // 300)
        windows_needed = max(1, (token_count + GROQ_INPUT_TOKEN_LIMIT - 1) // GROQ_INPUT_TOKEN_LIMIT)
        sections_per = max(3, target // windows_needed)
        return {
            "target_chunks": target,
            "tokens_per_chunk": 300,
            "sections_per_window": min(sections_per, 8),
            "window_token_size": GROQ_INPUT_TOKEN_LIMIT,
            "max_windows": min(windows_needed, 3),
        }
    elif token_count <= 30000:
        # Large doc: 20-50 chunks of ~400-600 tokens
        target = max(20, token_count // 500)
        windows_needed = max(2, (token_count + GROQ_INPUT_TOKEN_LIMIT - 1) // GROQ_INPUT_TOKEN_LIMIT)
        sections_per = max(3, target // windows_needed)
        return {
            "target_chunks": target,
            "tokens_per_chunk": 500,
            "sections_per_window": min(sections_per, 8),
            "window_token_size": GROQ_INPUT_TOKEN_LIMIT,
            "max_windows": min(windows_needed, 6),
        }
    else:
        # Very large doc: LLM processes key portions, rest is simple-chunked
        target = max(40, token_count // 600)
        return {
            "target_chunks": target,
            "tokens_per_chunk": 600,
            "sections_per_window": 6,
            "window_token_size": GROQ_INPUT_TOKEN_LIMIT,
            "max_windows": 8,
        }


def dynamic_chunking(text: str) -> List[Dict]:
    """
    Token-aware dynamic chunking: measures document tokens, computes an
    optimal plan, then uses Groq to semantically split each window.

    Falls back to simple word-count chunking if the LLM response cannot
    be parsed as valid JSON.

    Args:
        text: Raw document text.

    Returns:
        List of dicts with keys 'section' (str) and 'content' (str).
    """
    if not GROQ_API_KEY:
        return _simple_chunk(text)

    enc = tiktoken.get_encoding("cl100k_base")
    token_count = len(enc.encode(text))
    plan = _compute_chunking_plan(token_count)

    client = Groq(api_key=GROQ_API_KEY)

    # Build token-aligned windows using the tokenizer for precision
    all_tokens = enc.encode(text)
    win_size = plan["window_token_size"]
    # Overlap 10% of window to avoid cutting mid-sentence
    overlap = max(100, win_size // 10)
    max_win = plan["max_windows"]

    windows = []
    start = 0
    while start < len(all_tokens) and len(windows) < max_win:
        end = min(start + win_size, len(all_tokens))
        window_text = enc.decode(all_tokens[start:end])
        windows.append(window_text)
        if end >= len(all_tokens):
            break
        start += win_size - overlap

    all_chunks = []
    sects_per_win = plan["sections_per_window"]
    tpc = plan["tokens_per_chunk"]

    # Scale max_tokens for response based on sections requested
    # ~80 tokens overhead per section (JSON keys, quotes, etc.) + content
    response_budget = min(GROQ_RESPONSE_TOKEN_BUDGET, sects_per_win * (tpc + 80))

    for i, window in enumerate(windows):
        prompt = (
            "You are a financial document analyst. Split the following document excerpt "
            f"into {sects_per_win}-{sects_per_win + 2} meaningful semantic sections.\n\n"
            "CHUNKING GUIDELINES:\n"
            f"- Target approximately {tpc} tokens (~{tpc * 3 // 4} words) per section content.\n"
            "- Keep financial figures, numbers, percentages, and dates EXACTLY as they appear.\n"
            "- Each section should be self-contained and cover one topic/aspect.\n\n"
            "STRICT OUTPUT RULES:\n"
            "- Return ONLY a valid JSON array. No markdown, no code fences, no explanation.\n"
            "- Each item: {\"section\": \"<title>\", \"content\": \"<text>\"}\n"
            "- PRESERVE ALL NUMBERS, AMOUNTS, PERCENTAGES, AND FINANCIAL FIGURES.\n"
            "- Do NOT use smart quotes or typographic apostrophes in the JSON.\n\n"
            f"Document excerpt (part {i+1} of {len(windows)}, "
            f"total document ~{token_count} tokens):\n{window}"
        )

        try:
            response = client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=response_budget,
            )

            raw: str = response.choices[0].message.content.strip()

            if raw.startswith("```"):
                raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
                raw = re.sub(r"\n?```$", "", raw.strip())

            raw = raw.replace("\u2019", "'").replace("\u2018", "'")
            raw = raw.replace("\u201c", '"').replace("\u201d", '"')
            raw = raw.replace("\u02bc", "'")

            chunks = json.loads(raw)
            if isinstance(chunks, list):
                valid = [c for c in chunks if isinstance(c, dict) and "section" in c and "content" in c]
                all_chunks.extend(valid)
        except Exception:
            # If this window fails, simple-chunk it with plan's token target
            fallback_word_size = max(80, tpc * 3 // 4)  # ~0.75 words per token
            words = window.split()
            for j in range(0, len(words), fallback_word_size):
                segment = " ".join(words[j:j + fallback_word_size])
                if segment.strip():
                    all_chunks.append({
                        "section": f"Segment {len(all_chunks) + 1}",
                        "content": segment,
                    })

    # Simple-chunk any remaining text beyond the LLM-processed windows
    if windows and len(all_tokens) > 0:
        llm_covered_tokens = min(
            (len(windows) - 1) * (win_size - overlap) + win_size,
            len(all_tokens)
        )
        if llm_covered_tokens < len(all_tokens):
            remaining_text = enc.decode(all_tokens[llm_covered_tokens:])
            fallback_word_size = max(80, tpc * 3 // 4)
            remaining_chunks = _simple_chunk(remaining_text, chunk_size=fallback_word_size)
            for rc in remaining_chunks:
                rc["section"] = f"Segment {len(all_chunks) + 1}"
                all_chunks.append(rc)

    return all_chunks if all_chunks else _simple_chunk(text)


def _simple_chunk(text: str, chunk_size: int = 200, overlap: int = 50) -> List[Dict]:
    """
    Fallback chunker: split text into fixed-size word-count segments with overlap.

    Args:
        text: Input text to chunk.
        chunk_size: Target number of words per chunk.
        overlap: Number of overlapping words between consecutive chunks.

    Returns:
        List of dicts with keys 'section' and 'content'.
    """
    words = text.split()
    chunks = []
    start = 0
    idx = 1
    step = max(chunk_size - overlap, 1)
    while start < len(words):
        segment = " ".join(words[start:start + chunk_size])
        if segment.strip():
            chunks.append({
                "section": f"Segment {idx}",
                "content": segment,
            })
            idx += 1
        start += step
    return chunks


# ---------------------------------------------------------------------------
# 4. EMBEDDING
# ---------------------------------------------------------------------------

def embed_chunks(chunks: List[Dict]) -> List[np.ndarray]:
    """
    Generate normalized embedding vectors for a list of chunks.

    Uses SentenceTransformers 'all-MiniLM-L6-v2' (configurable via
    EMBEDDING_MODEL env var) to encode each chunk's content field.

    Args:
        chunks: List of dicts that must contain a 'content' key.

    Returns:
        List of 1-D float32 numpy arrays (L2-normalized embeddings).
    """
    model = _get_embedding_model()
    contents = [chunk["content"] for chunk in chunks]
    embeddings = model.encode(
        contents,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return [emb.astype(np.float32) for emb in embeddings]


# ---------------------------------------------------------------------------
# 5. FAISS VECTOR STORE
# ---------------------------------------------------------------------------

def create_faiss_index(
    embeddings: List[np.ndarray],
) -> Tuple[faiss.Index, List[int]]:
    """
    Build a FAISS IndexFlatIP (inner product) index from embedding vectors.

    IndexFlatIP on L2-normalized vectors is equivalent to cosine similarity
    search, making it ideal for semantic retrieval.

    Args:
        embeddings: List of normalized float32 embedding vectors. All vectors
                    must share the same dimensionality.

    Returns:
        Tuple of (faiss_index, id_list) where id_list maps index positions
        to their original position in the embeddings list.
    """
    dim = embeddings[0].shape[0]
    index = faiss.IndexFlatIP(dim)
    matrix = np.vstack(embeddings)
    index.add(matrix)
    return index, list(range(len(embeddings)))


def save_index(
    index: faiss.Index,
    metadata: List[Dict],
    index_path: str = FAISS_INDEX_PATH,
    metadata_path: str = FAISS_METADATA_PATH,
) -> None:
    """
    Persist a FAISS index and its associated metadata to disk
    and update the in-memory cache immediately.
    """
    global _cached_index, _cached_metadata
    faiss.write_index(index, index_path)
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    _cached_index = index
    _cached_metadata = list(metadata)


def load_index(
    index_path: str = FAISS_INDEX_PATH,
    metadata_path: str = FAISS_METADATA_PATH,
) -> Tuple[faiss.Index, List[Dict]]:
    """
    Return the in-memory cached index if available, otherwise load from disk
    and populate the cache.
    """
    global _cached_index, _cached_metadata
    if _cached_index is not None and _cached_metadata is not None:
        return _cached_index, _cached_metadata

    if not os.path.exists(index_path):
        raise FileNotFoundError(f"FAISS index not found: {index_path}")
    if not os.path.exists(metadata_path):
        raise FileNotFoundError(f"Metadata file not found: {metadata_path}")

    index = faiss.read_index(index_path)
    with open(metadata_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)

    _cached_index = index
    _cached_metadata = list(metadata)
    return _cached_index, _cached_metadata


def get_document_store() -> List[Dict]:
    """Return a flat list of all indexed chunks from the in-memory cache."""
    global _cached_metadata
    if _cached_metadata is not None:
        return list(_cached_metadata)
    # Fall back to loading from disk if cache is cold
    try:
        _, metadata = load_index()
        return list(metadata)
    except FileNotFoundError:
        return []


def estimate_tokens(text: str) -> int:
    """Estimate token count for a string (cl100k_base approximation)."""
    return count_tokens(text)


def truncate_chunks_by_tokens(chunks: List[Dict], max_tokens: int = 4000) -> List[Dict]:
    """
    Return as many chunks as fit within max_tokens (measured by content length).
    Chunks are kept in their original order (highest-relevance first).
    """
    result: List[Dict] = []
    total = 0
    for chunk in chunks:
        t = estimate_tokens(chunk.get("content", ""))
        if total + t > max_tokens:
            break
        result.append(chunk)
        total += t
    return result or chunks[:1]  # always return at least one chunk


# ---------------------------------------------------------------------------
# 6. FULL PIPELINE
# ---------------------------------------------------------------------------

def process_document(file_path: str) -> Dict:
    """
    Run the complete document processing pipeline on a PDF file.

    Steps:
        1. Extract text from PDF (PyMuPDF).
        2. Count tokens to decide chunking strategy.
        3. Dynamic LLM chunking (Groq) if tokens > TOKEN_THRESHOLD,
           otherwise simple word-count chunking fallback.
        4. Attach source and page metadata to each chunk.
        5. Generate normalized embeddings (SentenceTransformers).
        6. Build and persist a FAISS index.

    Args:
        file_path: Path to the input PDF document.

    Returns:
        Dict with keys:
            - num_chunks (int): Number of chunks produced.
            - token_count (int): Total tokens in the extracted text.
            - chunking_strategy (str | None): 'dynamic' or 'simple'.
            - status (str): 'success' or 'error'.
            - message (str): Human-readable result or error description.
    """
    try:
        # Step 1: Extract text
        full_text = extract_text_from_pdf(file_path)

        # Step 1b: Save raw text so chart_service & credit_scorer can use it
        raw_text_path = os.path.join(os.path.dirname(FAISS_INDEX_PATH) or '.', 'raw_document_text.txt')
        with open(raw_text_path, 'w', encoding='utf-8') as _f:
            _f.write(full_text)

        # Step 1c: Detect company name locally (no LLM — fast path for upload)
        detected_company = _extract_company_name_local(full_text)

        # Step 2: Count tokens — no API call
        token_count = count_tokens(full_text)

        # Step 3: ONE tiny LLM call (≤ 40 output tokens) to decide chunk_size
        plan = _plan_chunking(token_count)

        # Step 4: Token-aware chunking — pure Python, zero LLM calls
        chunks = chunk_by_tokens(full_text, plan["chunk_size"], plan["overlap"])
        if not chunks:                          # emergency fallback
            chunks = _simple_chunk(full_text)
        strategy = "token_aware"

        # Step 4: Attach metadata
        source_name = os.path.basename(file_path)
        for chunk in chunks:
            chunk["source"] = source_name
            chunk.setdefault("page", None)

        # Step 5: Embed
        embeddings = embed_chunks(chunks)

        # Step 6: Index and persist
        index, _ = create_faiss_index(embeddings)
        save_index(index, chunks)

        return {
            "num_chunks": len(chunks),
            "token_count": token_count,
            "chunking_strategy": strategy,
            "chunk_size": plan.get("chunk_size"),
            "overlap": plan.get("overlap"),
            "status": "success",
            "message": (
                f"Processed '{source_name}' into {len(chunks)} chunks "
                f"({plan.get('chunk_size')} tok/chunk, {plan.get('overlap')} overlap)."
            ),
            "company_name": detected_company,
        }

    except Exception as exc:
        return {
            "num_chunks": 0,
            "token_count": 0,
            "chunking_strategy": None,
            "status": "error",
            "message": str(exc),
        }
