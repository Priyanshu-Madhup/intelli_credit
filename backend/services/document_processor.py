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

_embedding_model: Optional[SentenceTransformer] = None


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
# 3. DYNAMIC CHUNKING VIA GROQ
# ---------------------------------------------------------------------------

def dynamic_chunking(text: str) -> List[Dict]:
    """
    Use Groq (LLaMA 3) to split a financial document into semantically
    meaningful sections.

    Falls back to simple word-count chunking if the LLM response cannot
    be parsed as valid JSON.

    Args:
        text: Raw document text.

    Returns:
        List of dicts with keys 'section' (str) and 'content' (str).
    """
    if not GROQ_API_KEY:
        return _simple_chunk(text)

    client = Groq(api_key=GROQ_API_KEY)

    # Limit input to ~8000 chars to keep the response well within token budget
    # and reduce the chance of JSON truncation or malformed escape sequences.
    sample = text[:8000]

    prompt = (
        "You are a financial document analyst. Split the following document excerpt "
        "into 5-10 meaningful semantic sections.\n\n"
        "STRICT OUTPUT RULES:\n"
        "- Return ONLY a valid JSON array. No markdown, no code fences, no explanation.\n"
        "- Each item: {\"section\": \"<title>\", \"content\": \"<text>\"}\n"
        "- PRESERVE ALL NUMBERS, AMOUNTS, PERCENTAGES, AND FINANCIAL FIGURES in the content — do NOT summarize away numerical data.\n"
        "- Content values should be 2-5 sentences each, keeping all key facts and figures.\n"
        "- Escape all special characters inside strings properly.\n"
        "- Do NOT use smart quotes or typographic apostrophes in the JSON.\n\n"
        "Example:\n"
        "[\n"
        "  {\"section\": \"Financial Performance\", \"content\": \"Revenue grew 15% YoY to INR 48 Cr. Net profit margin stood at 12.3%. Total debt was INR 22 Cr with D/E ratio of 1.8.\"},\n"
        "  {\"section\": \"Risk Factors\", \"content\": \"High debt-to-equity ratio of 2.1 noted. Interest coverage ratio is 2.3x.\"}\n"
        "]\n\n"
        f"Document excerpt:\n{sample}"
    )

    try:
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=1500,
        )

        raw: str = response.choices[0].message.content.strip()

        # Strip markdown code fences
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw.strip())

        # Replace typographic apostrophes / smart quotes with plain ASCII so
        # json.loads doesn't choke on them inside string values
        raw = raw.replace("\u2019", "'").replace("\u2018", "'")
        raw = raw.replace("\u201c", '"').replace("\u201d", '"')
        raw = raw.replace("\u02bc", "'")  # modifier letter apostrophe

        chunks = json.loads(raw)
        if not isinstance(chunks, list):
            raise ValueError("Expected a JSON array at the top level.")
        valid = [c for c in chunks if isinstance(c, dict) and "section" in c and "content" in c]
        if valid:
            return valid
        raise ValueError("No valid chunks found in response.")

    except Exception:
        # Any failure (network, parse error, etc.) → fall back to simple chunking
        return _simple_chunk(text)


def _simple_chunk(text: str, chunk_size: int = 500) -> List[Dict]:
    """
    Fallback chunker: split text into fixed-size word-count segments.

    Args:
        text: Input text to chunk.
        chunk_size: Target number of words per chunk.

    Returns:
        List of dicts with keys 'section' and 'content'.
    """
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size):
        segment = " ".join(words[i : i + chunk_size])
        chunks.append({
            "section": f"Segment {i // chunk_size + 1}",
            "content": segment,
        })
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
    Persist a FAISS index and its associated metadata to disk.

    Args:
        index: Trained FAISS index to save.
        metadata: List of metadata dicts (section, content, source, page).
        index_path: File path for the FAISS binary index file.
        metadata_path: File path for the JSON metadata file.
    """
    faiss.write_index(index, index_path)
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)


def load_index(
    index_path: str = FAISS_INDEX_PATH,
    metadata_path: str = FAISS_METADATA_PATH,
) -> Tuple[faiss.Index, List[Dict]]:
    """
    Load a previously saved FAISS index and its metadata from disk.

    Args:
        index_path: File path of the saved FAISS index binary.
        metadata_path: File path of the saved metadata JSON.

    Returns:
        Tuple of (faiss_index, metadata_list).

    Raises:
        FileNotFoundError: If either the index or metadata file is missing.
    """
    if not os.path.exists(index_path):
        raise FileNotFoundError(f"FAISS index not found: {index_path}")
    if not os.path.exists(metadata_path):
        raise FileNotFoundError(f"Metadata file not found: {metadata_path}")

    index = faiss.read_index(index_path)
    with open(metadata_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)
    return index, metadata


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

        # Step 1c: Detect company name from document text
        detected_company = extract_company_name(full_text)

        # Step 2: Token count
        token_count = count_tokens(full_text)

        # Step 3: Chunking strategy
        if token_count > TOKEN_THRESHOLD:
            chunks = dynamic_chunking(full_text)
            strategy = "dynamic"
        else:
            chunks = _simple_chunk(full_text)
            strategy = "simple"

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
            "status": "success",
            "message": f"Processed '{source_name}' into {len(chunks)} chunks.",
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
