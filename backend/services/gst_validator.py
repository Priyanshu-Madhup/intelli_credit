"""
GST vs Bank Statement Cross-Validation Service

Compares GST-reported turnover against actual bank credits to detect:
- Revenue inflation / circular trading
- Significant turnover discrepancies
- Suspicious transaction patterns
"""
import json
import os
import re
from typing import Dict, List

from groq import Groq
from dotenv import load_dotenv
from services.document_processor import GROQ_API_KEY, GROQ_MODEL
from services.rag_service import get_all_chunks

load_dotenv()


def _get_chunks_by_type(doc_type: str) -> List[Dict]:
    """
    Filter all FAISS chunks by their doc_type tag.
    Returns only chunks that came from a specific document type.
    """
    all_chunks = get_all_chunks()
    filtered = [c for c in all_chunks if c.get("doc_type", "").lower() == doc_type.lower()]
    return filtered


def _chunks_to_text(chunks: List[Dict], max_chars: int = 12000) -> str:
    """Flatten a list of chunks into one text block, up to max_chars."""
    parts = []
    total = 0
    for c in chunks:
        content = c.get("content", "")
        if total + len(content) > max_chars:
            break
        parts.append(f"[{c.get('section', 'Section')}]\n{content}")
        total += len(content)
    return "\n\n".join(parts)


def _run_cross_validation(gst_text: str, bank_text: str, company_name: str) -> Dict:
    """
    Ask Groq to compare GST and bank statement data and identify discrepancies.
    """
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set.")

    prompt = f"""You are a forensic credit analyst specializing in Indian corporate fraud detection.

Company: {company_name}

You have been given two sets of financial data:
1. GST RETURNS DATA — what the company reported to the government
2. BANK STATEMENT DATA — actual money flowing through the company's accounts

Your job is to cross-validate these two sources and identify any discrepancies that suggest:
- Revenue inflation (GST turnover >> bank credits)
- Circular trading (large round-trip transactions with no real business purpose)
- Suppression of income (bank credits >> GST turnover, suggesting unreported income)
- Suspicious patterns (large cash withdrawals, frequent inter-account transfers, etc.)

INDIAN CONTEXT RULES:
- GST 3B is the self-declared return. GSTR-2A is the auto-populated purchase register.
- If GST turnover is more than 15% higher than bank credits → flag as potential revenue inflation.
- If bank credits are more than 20% higher than GST turnover → flag as potential income suppression.
- Look for round numbers, frequent transfers to related parties, and sudden spikes.
- NBFC companies legitimately have high bank throughput — note sector context.

STRICT OUTPUT RULES:
- Return ONLY valid JSON. No markdown, no code fences, no explanation outside JSON.
- If a number cannot be determined from the data, use null — never use dashes.
- Be factual — only report what the data actually shows.

Required JSON structure:
{{
  "overall_risk": "<high | medium | low | insufficient_data>",
  "summary": "<2-3 sentence plain-English summary of what the cross-validation found>",
  "gst_turnover_reported": "<string, e.g. '₹48.2 Cr' or 'Not found'>",
  "bank_credits_total": "<string, e.g. '₹31.5 Cr' or 'Not found'>",
  "discrepancy_pct": <float or null>,
  "discrepancy_direction": "<gst_higher | bank_higher | aligned | unknown>",
  "flags": [
    {{
      "severity": "<high | medium | low>",
      "type": "<revenue_inflation | circular_trading | income_suppression | suspicious_pattern | data_gap>",
      "title": "<short flag title, max 8 words>",
      "detail": "<one concrete sentence with numbers from the data>",
      "recommendation": "<one sentence on what the credit officer should verify>"
    }}
  ],
  "positive_indicators": [
    "<one positive finding per item, e.g. 'GST filings are consistent across quarters'>"
  ],
  "data_quality": "<good | partial | poor>",
  "data_quality_note": "<one sentence on what data was missing or unclear>"
}}

GST RETURNS DATA:
{gst_text if gst_text.strip() else "No GST document uploaded or no GST chunks found in index."}

BANK STATEMENT DATA:
{bank_text if bank_text.strip() else "No bank statement uploaded or no bank chunks found in index."}
"""

    client = Groq(api_key=GROQ_API_KEY)
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.05,
        max_tokens=2000,
    )

    raw = response.choices[0].message.content.strip()

    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw.strip())

    # Sanitize dash placeholders
    raw = re.sub(r':\s*"—"\s*([,}\]])', r': null\1', raw)
    raw = re.sub(r':\s*—\s*([,}\]])',   r': null\1', raw)

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        # Safe fallback if JSON parse fails
        result = {
            "overall_risk": "insufficient_data",
            "summary": "Could not parse cross-validation result. Please check uploaded documents.",
            "gst_turnover_reported": "Not found",
            "bank_credits_total": "Not found",
            "discrepancy_pct": None,
            "discrepancy_direction": "unknown",
            "flags": [],
            "positive_indicators": [],
            "data_quality": "poor",
            "data_quality_note": raw[:300],
        }

    return result


def run_gst_validation(company_name: str = "") -> Dict:
    """
    Main entry point — called by the router.

    Retrieves GST and bank chunks from the FAISS index (tagged during upload),
    then runs cross-validation via Groq.

    Returns structured validation report with flags and risk assessment.
    """
    # Pull chunks by document type
    gst_chunks  = _get_chunks_by_type("gst")
    bank_chunks = _get_chunks_by_type("bank")

    gst_text  = _chunks_to_text(gst_chunks)
    bank_text = _chunks_to_text(bank_chunks)

    # Check if we have at least one source
    has_gst  = bool(gst_text.strip())
    has_bank = bool(bank_text.strip())

    if not has_gst and not has_bank:
        return {
            "overall_risk": "insufficient_data",
            "summary": "Neither GST returns nor bank statement found in the indexed documents. Please upload both document types and run analysis again.",
            "gst_turnover_reported": "Not found",
            "bank_credits_total": "Not found",
            "discrepancy_pct": None,
            "discrepancy_direction": "unknown",
            "flags": [{
                "severity": "low",
                "type": "data_gap",
                "title": "No documents indexed for validation",
                "detail": "Upload GST returns and bank statements to enable cross-validation.",
                "recommendation": "Upload both GST returns (label as 'GST Returns') and bank statements before running validation."
            }],
            "positive_indicators": [],
            "data_quality": "poor",
            "data_quality_note": "No GST or bank data found in current index.",
            "has_gst": False,
            "has_bank": False,
        }

    result = _run_cross_validation(gst_text, bank_text, company_name)

    # Attach metadata so the frontend knows what was available
    result["has_gst"]       = has_gst
    result["has_bank"]      = has_bank
    result["gst_chunks"]    = len(gst_chunks)
    result["bank_chunks"]   = len(bank_chunks)
    result["company_name"]  = company_name

    return result