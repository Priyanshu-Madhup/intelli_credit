"""
SWOT Analysis Service

Generates a comprehensive Strengths, Weaknesses, Opportunities, Threats
analysis by combining indexed document data with web research findings.
"""
import json
import os
import re
from typing import Dict

from groq import Groq
from dotenv import load_dotenv
from services.document_processor import GROQ_API_KEY, GROQ_MODEL, FAISS_INDEX_PATH
from services.rag_service import get_all_chunks

load_dotenv()

RAW_TEXT_PATH = os.path.join(os.path.dirname(FAISS_INDEX_PATH) or '.', 'raw_document_text.txt')


def _get_document_context() -> str:
    """Pull full document text, fall back to FAISS chunks."""
    if os.path.exists(RAW_TEXT_PATH):
        with open(RAW_TEXT_PATH, 'r', encoding='utf-8') as f:
            text = f.read()
        if text.strip():
            return text[:20000]

    chunks = get_all_chunks()
    if not chunks:
        return ""
    return "\n\n".join(
        f"[{c.get('section','Section')}]\n{c.get('content','')}"
        for c in chunks[:20]
    )[:16000]


def run_swot_analysis(company_name: str, sector: str, web_research: Dict = None) -> Dict:
    """
    Generate a full SWOT analysis for a company.

    Combines:
    - Indexed financial documents (P&L, balance sheet, etc.)
    - Web research findings (if available from /research endpoint)

    Returns structured SWOT with 4-6 points per quadrant,
    each with a title, detail, and impact level.
    """
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set.")

    doc_context = _get_document_context()

    # Build web research context if provided
    web_context = ""
    if web_research:
        summary   = web_research.get("summary", "")
        flags     = web_research.get("risk_flags", [])
        positives = web_research.get("positive_signals", [])
        sector_outlook = web_research.get("sector_outlook", "")

        parts = []
        if summary:
            parts.append(f"Web Research Summary: {summary}")
        if sector_outlook:
            parts.append(f"Sector Outlook: {sector_outlook}")
        if positives:
            parts.append("Positive signals from web: " + "; ".join(positives))
        if flags:
            flag_texts = [f"[{f.get('severity','').upper()}] {f.get('title','')} — {f.get('detail','')}" for f in flags]
            parts.append("Risk flags from web: " + "; ".join(flag_texts))
        web_context = "\n".join(parts)

    prompt = f"""You are a senior credit analyst preparing a SWOT analysis for a loan applicant.

Company: {company_name}
Sector: {sector}

INSTRUCTIONS:
- Base your analysis STRICTLY on the document excerpts and web research provided.
- Each quadrant must have 3-5 specific, factual points — not generic statements.
- Every point needs a concrete title (5-7 words) and a detail sentence with specific facts/numbers where available.
- Strengths and Opportunities should reflect genuine competitive advantages and market tailwinds.
- Weaknesses and Threats should reflect real risks visible in the data.
- Do NOT fabricate numbers. If a specific figure isn't in the data, describe the trend qualitatively.
- impact must be one of: "high", "medium", "low"

Return ONLY valid JSON — no markdown, no code fences, no text outside the JSON.

Required structure:
{{
  "strengths": [
    {{"title": "<5-7 word title>", "detail": "<one factual sentence>", "impact": "<high|medium|low>"}}
  ],
  "weaknesses": [
    {{"title": "<5-7 word title>", "detail": "<one factual sentence>", "impact": "<high|medium|low>"}}
  ],
  "opportunities": [
    {{"title": "<5-7 word title>", "detail": "<one factual sentence>", "impact": "<high|medium|low>"}}
  ],
  "threats": [
    {{"title": "<5-7 word title>", "detail": "<one factual sentence>", "impact": "<high|medium|low>"}}
  ],
  "overall_assessment": "<2-3 sentence summary of the SWOT findings and credit implications>",
  "credit_implication": "<approved|conditional|cautious|rejected>"
}}

FINANCIAL DOCUMENT DATA:
{doc_context if doc_context.strip() else "No financial documents uploaded yet."}

WEB RESEARCH DATA:
{web_context if web_context.strip() else "No web research data available."}
"""

    client = Groq(api_key=GROQ_API_KEY)
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.15,
        max_tokens=2500,
    )

    raw = response.choices[0].message.content.strip()

    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw.strip())

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        # Safe fallback
        result = {
            "strengths":    [{"title": "Analysis unavailable", "detail": "Could not parse SWOT response. Please retry.", "impact": "low"}],
            "weaknesses":   [],
            "opportunities":[],
            "threats":      [],
            "overall_assessment": "SWOT generation failed — please retry.",
            "credit_implication": "conditional",
        }

    # Attach metadata
    result["company_name"] = company_name
    result["sector"]       = sector
    result["has_documents"] = bool(doc_context.strip())
    result["has_web_data"]  = bool(web_context.strip())

    return result