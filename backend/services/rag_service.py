"""
RAG query service — retrieve relevant chunks from FAISS and answer using Groq.
"""
import os
import numpy as np
from typing import List, Dict
from groq import Groq
from dotenv import load_dotenv

from services.document_processor import (
    load_index,
    _get_embedding_model,
    GROQ_API_KEY,
    GROQ_MODEL,
)

load_dotenv()

TOP_K: int = int(os.getenv("RAG_TOP_K", "5"))


def retrieve_chunks(query: str, top_k: int = TOP_K) -> List[Dict]:
    """
    Embed a query and retrieve the top-k most relevant chunks from the FAISS index.

    Args:
        query: Natural-language question about the document.
        top_k: Number of chunks to retrieve.

    Returns:
        List of metadata dicts for the closest matching chunks,
        each with keys: section, content, source, page, score.
        Returns an empty list if no FAISS index has been built yet.
    """
    try:
        index, metadata = load_index()
    except FileNotFoundError:
        return []

    model = _get_embedding_model()
    query_vec = model.encode([query], normalize_embeddings=True)
    query_vec = query_vec.astype(np.float32)

    actual_k = min(top_k, index.ntotal)
    if actual_k == 0:
        return []
    scores, indices = index.search(query_vec, actual_k)

    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx == -1:
            continue
        chunk = dict(metadata[idx])
        chunk["score"] = float(score)
        results.append(chunk)

    return results


def get_all_chunks() -> List[Dict]:
    """
    Return every chunk stored in the FAISS metadata — no query needed.

    This is used by the chart extraction service to give the LLM the full
    document content, bypassing semantic-search mismatch problems.

    Returns:
        All stored metadata dicts, each with section, content, source, page.
        Returns empty list when no index exists.
    """
    try:
        _, metadata = load_index()
    except FileNotFoundError:
        return []
    return [dict(m) for m in metadata]


def answer_query(query: str, top_k: int = TOP_K) -> Dict:
    """
    Full RAG pipeline: retrieve relevant chunks then ask Groq to answer.

    Args:
        query: Natural-language question about the uploaded financial document.
        top_k: Number of context chunks to retrieve.

    Returns:
        Dict with keys:
            - answer (str): Groq's response grounded in the retrieved context.
            - sources (List[Dict]): Retrieved chunks used as context.
    """
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set.")

    chunks = retrieve_chunks(query, top_k)
    if not chunks:
        return {"answer": "No indexed documents found. Please upload and process a document first.", "sources": []}

    context = "\n\n".join(
        f"[{c.get('section', 'Unknown')}]\n{c['content']}" for c in chunks
    )

    client = Groq(api_key=GROQ_API_KEY)
    prompt = (
        "You are a financial analyst AI assistant for a credit appraisal system. "
        "Answer the question below using ONLY the provided context excerpts from the document. "
        "Be precise, factual, and concise. If the context does not contain the answer, say so clearly.\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {query}"
    )

    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
    )

    return {
        "answer": response.choices[0].message.content.strip(),
        "sources": chunks,
    }
