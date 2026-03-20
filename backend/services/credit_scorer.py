"""
Credit scoring service — run a structured credit assessment via RAG + Groq.

Produces a credit decision identical in shape to what the frontend expects:
risk score, decision, loan recommendation, score breakdown, conditions,
AI reasoning, and risk alerts.
"""
import json
import os
import re
from typing import Dict
from groq import Groq
from dotenv import load_dotenv

from services.rag_service import retrieve_chunks
from services.document_processor import GROQ_API_KEY, GROQ_MODEL, FAISS_INDEX_PATH

load_dotenv()

RAW_TEXT_PATH = os.path.join(os.path.dirname(FAISS_INDEX_PATH) or '.', 'raw_document_text.txt')

# Queries that drive context retrieval for a full credit assessment
_ASSESSMENT_QUERIES = [
    "annual revenue net profit margin financial performance",
    "total debt equity ratio liabilities balance sheet",
    "GST turnover discrepancy mismatch tax compliance",
    "litigation legal disputes court notices",
    "loan repayment history NPA defaults",
    "collateral assets security",
    "management quality promoter background",
    "market position sector industry outlook",
]

_SCHEMA_DESCRIPTION = """
Return ONLY a valid JSON object — no markdown, no code fences, no extra text.

CRITICAL JSON RULES:
- Every numeric field MUST contain a number (integer or float). NEVER use dashes, em-dashes, "—", or any non-numeric placeholder.
- If a numeric value is unknown, use 0 for scores, 10.0 for interest_rate_pct, 36 for tenor_months.
- Every string field MUST contain a quoted string. Use "N/A" if data is unavailable — do NOT use bare dashes.
- Do NOT include comments or extra keys.

Required structure:
{
  "risk_score": <integer 0-100>,
  "decision": <"approved" | "conditional" | "rejected">,
  "recommended_loan_cr": <float>,
  "requested_loan_cr": <float or null>,
  "interest_rate_pct": <float, use 10.0 if unknown>,
  "tenor_months": <integer, use 36 if unknown>,
  "score_breakdown": {
    "financial_health":   {"score": <int 0-100>, "weight_pct": 30},
    "repayment_history":  {"score": <int 0-100>, "weight_pct": 25},
    "collateral_coverage":{"score": <int 0-100>, "weight_pct": 20},
    "management_quality": {"score": <int 0-100>, "weight_pct": 15},
    "market_position":    {"score": <int 0-100>, "weight_pct": 10}
  },
  "conditions": [<string>, ...],
  "risk_alerts": [
    {"severity": <"high"|"medium"|"low">, "title": <string>, "body": <string>}
  ],
  "financial_overview": {
    "annual_revenue": <string, e.g. "\u20b948.2 Cr" or "N/A">,
    "annual_revenue_delta": <string, e.g. "+11%" or "N/A">,
    "annual_revenue_trend": <"up"|"down">,
    "net_profit": <string or "N/A">,
    "net_profit_margin": <string or "N/A">,
    "net_profit_trend": <"up"|"down">,
    "total_debt": <string or "N/A">,
    "de_ratio": <string or "N/A">,
    "total_debt_trend": <"up"|"down">,
    "gst_turnover": <string or "N/A">,
    "gst_turnover_trend": <"up"|"down">
  },
  "yearly_trend": [
    {"year": <string>, "revenue": <number>, "profit": <number>, "debt": <number>}
  ],
  "reasoning": <string, 3-4 paragraph detailed AI reasoning>
}
"""


def run_credit_assessment(company_name: str, sector: str, requested_loan_cr: float, qualitative_notes: str = "") -> Dict:
    """
    Generate a full AI credit assessment by retrieving context from FAISS
    and asking Groq to produce a structured JSON decision.

    Args:
        company_name: Name of the applicant company.
        sector: Industry sector of the company.
        requested_loan_cr: Loan amount requested (in Crore INR).

    Returns:
        Parsed credit assessment dict matching the frontend data schema.

    Raises:
        RuntimeError: If GROQ_API_KEY is missing or response cannot be parsed.
    """
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set.")

    # Collect context: company-specific query first, then generic risk dimensions
    seen_sections = set()
    context_parts = []
    all_queries = [
        f"{company_name} company organization borrower applicant financial documents",
    ] + _ASSESSMENT_QUERIES
    for q in all_queries:
        for chunk in retrieve_chunks(q, top_k=3):
            key = chunk.get("section", "") + chunk.get("content", "")[:80]
            if key not in seen_sections:
                seen_sections.add(key)
                context_parts.append(
                    f"[{chunk.get('section', 'Document')}]\n{chunk['content']}"
                )

    if not context_parts:
        raise RuntimeError(
            "No documents have been indexed yet. "
            "Please upload and process financial documents before running the credit assessment."
        )

    # Also read the raw document text (actual PDF content with numbers)
    raw_text = ""
    if os.path.exists(RAW_TEXT_PATH):
        with open(RAW_TEXT_PATH, 'r', encoding='utf-8') as _f:
            raw_text = _f.read()

    # Combine FAISS chunk summaries with raw text for richer context
    chunk_context = "\n\n".join(context_parts[:12])
    if raw_text.strip():
        # Prefer raw text (has actual numbers), append chunk summaries
        context = raw_text[:20000] + "\n\n--- Additional context ---\n\n" + chunk_context[:6000]
    else:
        context = "\n\n".join(context_parts[:24])

    client = Groq(api_key=GROQ_API_KEY)
    prompt = (
        f"You are a senior credit analyst at a bank. You are assessing a loan application "
        f"from '{company_name}' (sector: {sector}) for ₹{requested_loan_cr} Cr.\n\n"
        f"CRITICAL INSTRUCTIONS:\n"
        f"1. Base your assessment STRICTLY on the document excerpts provided below.\n"
        f"2. Extract real figures, dates, names and facts exactly as they appear in the documents.\n"
        f"3. Do NOT fabricate numbers or assume data not present in the documents.\n"
        f"4. If a metric cannot be found in the documents, use null for numbers and 'N/A' for strings. NEVER use '—' or any dash as a JSON value.\n"
        f"5. The company name in your response should match what appears in the documents.\n\n"
        + (
    f"PRIMARY DUE DILIGENCE NOTES (from credit officer site visit / management interview):\n"
    f"{qualitative_notes}\n\n"
    f"IMPORTANT: These officer notes are first-hand observations. You MUST factor them into your "
    f"risk score and reasoning. If notes mention capacity issues, evasive management, or operational "
    f"problems — reduce relevant scores significantly. If notes are positive — reflect that too.\n\n"
    if qualitative_notes.strip() else ""
)
       + f"Document excerpts from uploaded financial documents:\n{context}\n\n"
        f"Produce a complete credit assessment as structured JSON:\n"
        f"{_SCHEMA_DESCRIPTION}"
    )

    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.15,
        max_tokens=3000,
    )

    raw = response.choices[0].message.content.strip()

    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw.strip())

    # Sanitize: replace bare em-dash / en-dash placeholders the model sometimes emits
    # e.g.  "interest_rate_pct": —   or   "score": —
    # Replace unquoted dashes used as values with null so json.loads can proceed
    raw = re.sub(r':\s*\u2014\s*([,}\]])', r': null\1', raw)   # bare —
    raw = re.sub(r':\s*\u2013\s*([,}\]])', r': null\1', raw)   # bare –
    raw = re.sub(r':\s*"\u2014"\s*([,}\]])', r': null\1', raw) # quoted "—"
    raw = re.sub(r':\s*"\u2013"\s*([,}\]])', r': null\1', raw) # quoted "–"
    # Also handle trailing dash at end of object/array without following char
    raw = re.sub(r':\s*\u2014\s*$', ': null', raw, flags=re.MULTILINE)
    raw = re.sub(r':\s*\u2013\s*$', ': null', raw, flags=re.MULTILINE)

    try:
        assessment = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Failed to parse Groq credit assessment as JSON: {exc}\n"
            f"Raw (first 800 chars): {raw[:800]}"
        ) from exc

    # Post-process: replace None values in numeric fields with sensible defaults
    if assessment.get("interest_rate_pct") is None:
        assessment["interest_rate_pct"] = 10.0
    if assessment.get("tenor_months") is None:
        assessment["tenor_months"] = 36
    sb = assessment.get("score_breakdown", {})
    for dim in sb.values():
        if isinstance(dim, dict) and dim.get("score") is None:
            dim["score"] = 0

    # Attach meta
    assessment["company_name"] = company_name
    assessment["sector"] = sector
    assessment["requested_loan_cr"] = requested_loan_cr
    return assessment
