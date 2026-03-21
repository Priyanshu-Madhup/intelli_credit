"""
Credit scoring service — run a structured credit assessment via RAG + Groq.

Produces a credit decision identical in shape to what the frontend expects:
risk score, decision, loan recommendation, score breakdown, conditions,
AI reasoning, and risk alerts.
"""
import json
import re
from typing import Dict
from groq import Groq
from dotenv import load_dotenv

from services.rag_service import retrieve_chunks
from services.document_processor import GROQ_API_KEY, GROQ_MODEL, truncate_chunks_by_tokens

load_dotenv()

# One targeted query per dimension, top_k=2 each → max 8 unique chunks total
_ASSESSMENT_QUERIES = [
    "revenue INR crore PAT profit after tax FY YoY",
    "debt borrowings liabilities INR crore equity ratio",
    "NPA default litigation court GST compliance",
    "collateral management promoter background directors",
]

_SCHEMA_DESCRIPTION = """
Return ONLY a valid JSON object — no markdown, no code fences, no extra text.

CRITICAL JSON RULES:
- Every numeric field MUST contain a number (integer or float). NEVER use dashes, em-dashes, "—", or any non-numeric placeholder.
- If a numeric value is unknown, use 0 for scores, 10.0 for interest_rate_pct, 36 for tenor_months.
- Every string field MUST contain a quoted string. Use "N/A" if data is unavailable — do NOT use bare dashes.
- Do NOT include comments or extra keys.
- CRITICAL: recommended_loan_cr MUST be in CRORE (Cr) units. Output a number like 5.0 or 25.0, NOT a raw rupee amount like 50000000.

Required structure:
{
  "risk_score": <integer 0-100>,
  "decision": <"approved" | "conditional" | "rejected">,
  "recommended_loan_cr": <float in Crore, e.g. 5.0, 25.0, 100.0>,
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


def run_credit_assessment(company_name: str, sector: str, requested_loan_cr: float) -> Dict:
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

    # 4 targeted queries × top_k=2 (exact, no boost) → max 8 unique chunks, all sent in 1 LLM call
    seen_sections: set = set()
    context_parts: list = []
    for q in _ASSESSMENT_QUERIES:
        for chunk in retrieve_chunks(q, top_k=2, exact=True):
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

    # Budget: 8 chunks × ~225 tokens avg = ~1800 tokens context + ~500 overhead + 3000 response
    trimmed_parts = truncate_chunks_by_tokens(
        [{"content": p, "section": ""} for p in context_parts],
        max_tokens=1800,
    )
    context = "\n\n".join(c["content"] for c in trimmed_parts)

    client = Groq(api_key=GROQ_API_KEY)
    prompt = (
        f"You are a senior credit analyst at a bank. You are assessing a loan application "
        f"from '{company_name}' (sector: {sector}) for ₹{requested_loan_cr} Cr.\n\n"
        f"CRITICAL INSTRUCTIONS:\n"
        f"1. Base your assessment STRICTLY on the document excerpts provided below.\n"
        f"2. Extract real figures, dates, names and facts exactly as they appear in the documents.\n"
        f"3. PAT (Profit After Tax) = net_profit. Map PAT values to the net_profit field.\n"
        f"4. Do NOT fabricate numbers or assume data not present in the documents.\n"
        f"5. If a metric cannot be found in the documents, use null for numbers and 'N/A' for strings. NEVER use '\u2014' or any dash as a JSON value.\n"
        f"6. The company name in your response should match what appears in the documents.\n\n"
        f"Document excerpts from uploaded financial documents:\n{context}\n\n"
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

    # Normalize recommended_loan_cr — LLM sometimes outputs raw rupees or lakhs
    rec = assessment.get("recommended_loan_cr")
    if rec is not None and isinstance(rec, (int, float)):
        req = requested_loan_cr or 5.0
        # Convert absurd numbers: LLM might return value in rupees, thousands, or lakhs
        if rec > 10_000_000:  # Likely in raw rupees
            rec = round(rec / 10_000_000, 2)
        elif rec > 100_000:  # Likely in thousands or lakhs
            rec = round(rec / 100, 2)
        elif rec > 10_000:  # Possibly in thousands
            rec = round(rec / 100, 2)
        # Hard cap: never more than 3x the requested amount or 5000 Cr
        max_cap = max(min(req * 3, 5000.0), 1.0)
        if rec > max_cap:
            rec = round(req * 0.8, 2)
        # Minimum floor: at least 10% of requested
        if rec < req * 0.1:
            rec = round(req * 0.5, 2)
        assessment["recommended_loan_cr"] = round(rec, 2)
    elif rec is None:
        assessment["recommended_loan_cr"] = round((requested_loan_cr or 5.0) * 0.8, 2)

    # Normalize interest_rate_pct — should be between 6% and 24%
    rate = assessment.get("interest_rate_pct")
    if rate is not None and isinstance(rate, (int, float)):
        if rate < 1:  # LLM returned as decimal, e.g. 0.12 for 12%
            rate = round(rate * 100, 1)
        rate = max(6.0, min(rate, 24.0))
        assessment["interest_rate_pct"] = rate

    # Normalize tenor_months — should be between 6 and 120
    tenor = assessment.get("tenor_months")
    if tenor is not None and isinstance(tenor, (int, float)):
        tenor = max(6, min(int(tenor), 120))
        assessment["tenor_months"] = tenor

    # Attach meta
    assessment["company_name"] = company_name
    assessment["sector"] = sector
    assessment["requested_loan_cr"] = requested_loan_cr
    return assessment
