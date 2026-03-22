"""
SWOT Analysis endpoint.

Retrieves relevant context from the FAISS vector store using multiple
targeted queries, then calls Groq to produce a structured
Strengths / Weaknesses / Opportunities / Threats analysis.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from typing import List

from fastapi import APIRouter, HTTPException
from groq import Groq
from pydantic import BaseModel

from services.document_processor import (
    GROQ_API_KEY,
    GROQ_MODEL,
    truncate_chunks_by_tokens,
)
from services.rag_service import retrieve_chunks
from services.groq_retry import groq_chat_with_retry

router = APIRouter(prefix="/swot", tags=["SWOT"])

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SWOTRequest(BaseModel):
    company_name: str
    sector: str = ""


class SWOTItem(BaseModel):
    title: str
    detail: str


class SWOTResponse(BaseModel):
    company_name: str
    sector: str
    generated_at: str
    chunks_retrieved: int = 0
    strengths: List[SWOTItem]
    weaknesses: List[SWOTItem]
    opportunities: List[SWOTItem]
    threats: List[SWOTItem]


# ---------------------------------------------------------------------------
# Retrieval queries — one per strategic perspective so each quadrant is
# well-represented in the combined context window.
# ---------------------------------------------------------------------------

_SWOT_QUERIES = [
    "financial performance revenue profit growth competitive advantage market leadership",
    "weaknesses challenges liabilities high debt declining profitability operational risk",
    "market opportunities expansion new products sector trends emerging demand",
    "threats competition regulatory risk economic pressure macro environment",
    "borrowing profile debt equity ratio capital structure liquidity asset liability",
    "annual report balance sheet cash flow income statement financial summary",
]

_CONTEXT_BUDGET = 4500   # tokens of document context passed to the LLM


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/debug")
def debug_swot_retrieval():
    """
    Returns how many chunks are in the FAISS index and a sample of what
    would be retrieved for each SWOT query. Use this to verify the vector
    store is populated before calling /generate.
    """
    from services.rag_service import get_all_chunks
    all_chunks = get_all_chunks()
    index_size = len(all_chunks)

    samples = {}
    for q in _SWOT_QUERIES:
        chunks = retrieve_chunks(q, top_k=3)
        samples[q[:40]] = [
            {"score": round(c.get("score", 0), 4), "preview": (c.get("text") or "")[:120]}
            for c in chunks
        ]
    return {"index_size": index_size, "query_samples": samples}


@router.post("/generate", response_model=SWOTResponse)
def generate_swot(req: SWOTRequest):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured.")

    # ── Retrieve chunks from FAISS ────────────────────────────────────────
    seen: set[str] = set()
    combined_chunks: list[dict] = []
    for q in _SWOT_QUERIES:
        for chunk in retrieve_chunks(q, top_k=6):
            key = (chunk.get("text") or "")[:80]
            if key not in seen:
                seen.add(key)
                combined_chunks.append(chunk)

    if not combined_chunks:
        raise HTTPException(
            status_code=404,
            detail=(
                "No documents are indexed yet. "
                "Upload company documents on the New Assessment page first."
            ),
        )

    # ── Build context string (token-budget aware) ─────────────────────────
    context_chunks = truncate_chunks_by_tokens(combined_chunks, max_tokens=_CONTEXT_BUDGET)
    context = "\n\n---\n\n".join(
        c.get("text", "") for c in context_chunks if c.get("text")
    )

    # ── LLM call ──────────────────────────────────────────────────────────
    company = req.company_name or "the company"
    sector  = req.sector or "the sector"

    prompt = f"""You are a senior credit analyst writing a SWOT analysis for a credit appraisal memo.

Company: {company}
Sector: {sector}

Below are excerpts from the company's financial documents (annual reports, borrowing \
profile, ALM statements, portfolio data, etc.). Read them carefully and produce a \
thorough SWOT analysis.

IMPORTANT INSTRUCTIONS:
- Derive SWOT insights by interpreting the financial data — revenue trends, profitability \
  margins, debt levels, asset-liability gaps, portfolio quality, liquidity ratios, etc.
- You do NOT need explicit "strength"/"weakness" labels in the text. Infer them: \
  growing AUM is a strength; rising finance costs eating into margins is a weakness; \
  underserved MSME segment is an opportunity; rising interest rates are a threat.
- Each quadrant must have 3–5 distinct, specific items.
- Each item: "title" (≤ 8 words) + "detail" (1–2 sentences with specific numbers \
  or facts from the excerpts where available).
- If a quadrant has limited direct evidence, use reasonable sector-level inference \
  from the context to fill it — do NOT leave it empty.
- Respond with ONLY valid JSON. No markdown fences, no prose outside the JSON.

JSON schema (strict):
{{
  "strengths":     [{{"title": "...", "detail": "..."}}],
  "weaknesses":    [{{"title": "...", "detail": "..."}}],
  "opportunities": [{{"title": "...", "detail": "..."}}],
  "threats":       [{{"title": "...", "detail": "..."}}]
}}

DOCUMENT EXCERPTS ({len(context_chunks)} chunks):
{context}"""

    client = Groq(api_key=GROQ_API_KEY)
    resp = groq_chat_with_retry(
        client,
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
        temperature=0.3,
    )
    raw = resp.choices[0].message.content.strip()

    # Extract the JSON object even if the model wraps it in prose/fences
    m = re.search(r'\{[\s\S]*\}', raw)
    if not m:
        raise HTTPException(status_code=500, detail=f"LLM did not return valid JSON. Raw: {raw[:300]}")

    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"JSON parse error: {exc}. Raw: {raw[:300]}")

    def _items(lst) -> list[SWOTItem]:
        return [
            SWOTItem(title=i.get("title", ""), detail=i.get("detail", ""))
            for i in (lst or [])
            if i.get("title") or i.get("detail")
        ]

    return SWOTResponse(
        company_name=company,
        sector=sector,
        generated_at=datetime.now().strftime("%d %b %Y %H:%M"),
        chunks_retrieved=len(combined_chunks),
        strengths=_items(data.get("strengths", [])),
        weaknesses=_items(data.get("weaknesses", [])),
        opportunities=_items(data.get("opportunities", [])),
        threats=_items(data.get("threats", [])),
    )
