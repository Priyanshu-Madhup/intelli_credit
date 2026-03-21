"""
RAG query service — retrieve relevant chunks from FAISS and answer using Groq.

Modeled after DocFox's pipeline: in-memory index, dynamic top_k,
generic query detection, 3x over-fetch with score filtering.
"""
import os
import numpy as np
from typing import List, Dict
from groq import Groq
from dotenv import load_dotenv

from services.document_processor import (
    load_index,
    get_document_store,
    _get_embedding_model,
    GROQ_API_KEY,
    GROQ_MODEL,
    estimate_tokens,
    truncate_chunks_by_tokens,
)
from services.groq_retry import groq_chat_with_retry

load_dotenv()

TOP_K: int = int(os.getenv("RAG_TOP_K", "5"))

# ---------------------------------------------------------------------------
# Token budget constants  (llama-3.3-70b context = 128k; we stay ≤ 8k total)
# ---------------------------------------------------------------------------
_SYSTEM_TOKENS   = 120   # tokens used by system/instruction preamble
_RESPONSE_TOKENS = 800   # headroom reserved for the LLM answer
_MAX_CONTEXT     = 3500  # tokens available for retrieved chunks
# Total per call ≈ _SYSTEM_TOKENS + query_tokens + context_tokens + _RESPONSE_TOKENS
# ≤ 120 + 300 + 3500 + 800 = 4720

_BOOST_TERMS = [
    'compare', 'comparison', 'versus', 'vs', 'difference',
    'financial', 'revenue', 'profit', 'debt', 'ratio',
    'history', 'trend', 'growth', 'performance', 'analysis',
    'risk', 'collateral', 'loan', 'credit', 'assessment',
    'summarize', 'summary', 'overview', 'describe', 'explain',
]


def _compute_dynamic_top_k(query: str, base_k: int) -> int:
    """
    Increase top_k for broad or complex questions so more chunks are
    considered before the token-budget truncation step trims the context.
    Returns at most 15 to stay within budget even before truncation.
    """
    q = query.lower()
    if any(term in q for term in _BOOST_TERMS):
        return min(base_k * 3, 15)
    return base_k


# ---------------------------------------------------------------------------
# Core retrieval
# ---------------------------------------------------------------------------

def retrieve_chunks(query: str, top_k: int = TOP_K, exact: bool = False) -> List[Dict]:
    """
    Embed the query and retrieve the most relevant chunks from FAISS.

    - In-memory cached index (no disk I/O per query)
    - Dynamic top_k: broader/complex queries pull more candidates (unless exact=True)
    - 3x over-fetch then trim to dynamic_k
    - Downstream truncate_chunks_by_tokens enforces the hard token budget
    """
    try:
        index, metadata = load_index()
    except FileNotFoundError:
        return []

    if index.ntotal == 0:
        return []

    # exact=True bypasses the boost so callers get exactly what they asked for
    dynamic_k = top_k if exact else _compute_dynamic_top_k(query, top_k)

    model = _get_embedding_model()
    query_vec = model.encode([query], normalize_embeddings=True).astype(np.float32)

    # 3x over-fetch so score filtering has a good candidate pool
    search_k = min(dynamic_k * 3, index.ntotal)
    scores, indices = index.search(query_vec, search_k)

    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx == -1:
            continue
        chunk = dict(metadata[idx])
        chunk["score"] = float(score)
        results.append(chunk)

    # Highest cosine-similarity first
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:dynamic_k]


def get_all_chunks() -> List[Dict]:
    """
    Return every chunk stored in the FAISS metadata — no query needed.
    Uses in-memory document store for instant access.
    """
    store = get_document_store()
    return [dict(m) for m in store] if store else []


def _build_rag_prompt(query: str, chunks: List[Dict]) -> tuple:
    """
    Build the RAG prompt with a strict per-call token budget so the total
    tokens sent to Groq never exceeds the safe limit.

    Budget breakdown (conservative, well under llama-3.3-70b 128k window):
      _SYSTEM_TOKENS   (~120)  — instruction preamble
      query_tokens     (≤300)  — the user's actual question
      context_tokens   (≤6000) — retrieved chunks (trimmed to fit)
      _RESPONSE_TOKENS (~800)  — headroom reserved for the answer
      ─────────────────────────────
      Total            ≤ 7220 tokens per call
    """
    query_tokens   = estimate_tokens(query)
    # Shrink context budget if the query itself is unusually long
    context_budget = max(1000, _MAX_CONTEXT - query_tokens)

    trimmed = truncate_chunks_by_tokens(chunks, max_tokens=context_budget)

    context = "\n\n".join(
        f"[{c.get('section', 'Segment')}]\n{c['content']}" for c in trimmed
    )

    prompt = (
        "You are a financial analyst AI for a credit appraisal system. "
        "Answer using ONLY the context below. Be precise and factual. "
        "Use bullet points or numbered lists where appropriate. "
        "If the answer is not in the context, say so clearly.\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {query}"
    )
    return prompt, trimmed


def answer_query(query: str, top_k: int = TOP_K) -> Dict:
    """
    Full RAG pipeline: retrieve relevant chunks then ask Groq to answer.
    """
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set.")

    chunks = retrieve_chunks(query, top_k)
    if not chunks:
        return {"answer": "No indexed documents found. Please upload and process a document first.", "sources": []}

    prompt, trimmed = _build_rag_prompt(query, chunks)
    client = Groq(api_key=GROQ_API_KEY)

    response = groq_chat_with_retry(
        client,
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=800,
    )

    return {
        "answer": response.choices[0].message.content.strip(),
        "sources": chunks,
    }


def answer_query_stream(query: str, top_k: int = TOP_K):
    """
    Streaming RAG pipeline — yields SSE-formatted lines.
    Protocol:
      data: {"type": "sources", "content": [...]}  (first event — metadata)
      data: {"type": "token",   "content": "..."}  (one per streamed token)
      data: {"type": "done"}                        (final event)
      data: {"type": "error",  "content": "..."}   (on failure)
    """
    import json

    if not GROQ_API_KEY:
        yield f'data: {json.dumps({"type": "error", "content": "GROQ_API_KEY is not set."})}\n\n'
        return

    chunks = retrieve_chunks(query, top_k)
    if not chunks:
        yield f'data: {json.dumps({"type": "error", "content": "No indexed documents found. Please upload and process a document first."})}\n\n'
        return

    # Send source references immediately so the UI can show them right away
    safe_sources = [
        {"section": c.get("section", ""), "score": round(float(c.get("score", 0)), 3),
         "text": c.get("content", "")[:300]}
        for c in chunks
    ]
    yield f'data: {json.dumps({"type": "sources", "content": safe_sources})}\n\n'

    prompt, _ = _build_rag_prompt(query, chunks)
    client = Groq(api_key=GROQ_API_KEY)

    try:
        stream = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=800,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield f'data: {json.dumps({"type": "token", "content": delta})}\n\n'
    except Exception as exc:
        yield f'data: {json.dumps({"type": "error", "content": str(exc)})}\n\n'
        return

    yield f'data: {json.dumps({"type": "done"})}\n\n'
