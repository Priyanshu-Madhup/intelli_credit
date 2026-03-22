"""
GST vs Bank Statement cross-validation endpoint.
Extracts full text from both PDFs and passes directly to the LLM — no FAISS.
"""

from __future__ import annotations

import io
import os
import json
import shutil
import tempfile

import fitz  # PyMuPDF
from fastapi import APIRouter, HTTPException, UploadFile, File
from groq import Groq

from services.groq_retry import groq_chat_with_retry
from services.document_processor import GROQ_API_KEY, GROQ_MODEL

router = APIRouter(prefix="/gst-validate", tags=["GST Validation"])


def _extract_text(upload: UploadFile) -> str:
    """Write upload to a temp file and extract all text with PyMuPDF."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(upload.file, tmp)
        tmp_path = tmp.name
    try:
        doc = fitz.open(tmp_path)
        pages = [page.get_text() for page in doc]
        doc.close()
        return "\n\n".join(pages).strip()
    finally:
        os.unlink(tmp_path)


SYSTEM_PROMPT = """You are a senior credit risk analyst at an Indian commercial bank with deep expertise in 
forensic accounting and GST compliance. You specialize in identifying revenue manipulation, circular trading, 
and cash-flow mismatches in SME loan applications.

Your task: cross-validate GST returns against bank statements to detect revenue inflation, circular trading, 
or other financial irregularities. Be precise, cite specific numbers where possible, and give actionable 
risk flags.

Respond ONLY with a valid JSON object. No markdown, no code fences, no prose outside the JSON."""

ANALYSIS_PROMPT = """Carefully analyse the following two documents and produce a cross-validation report.

=== GST RETURNS ===
{gst_text}

=== BANK STATEMENT ===
{bank_text}

Produce a JSON object with EXACTLY this structure:
{{
  "verdict": "clean | suspicious | high_risk",
  "overall_summary": "2-3 sentence executive summary of the cross-validation finding",
  "revenue_comparison": {{
    "gst_reported_turnover": "e.g. ₹4.2 Cr",
    "bank_total_credits": "e.g. ₹3.1 Cr",
    "discrepancy_pct": 35,
    "direction": "gst_higher | bank_higher | aligned",
    "interpretation": "plain-English explanation of what the gap means"
  }},
  "flags": [
    {{
      "severity": "high | medium | low",
      "title": "short flag title",
      "detail": "specific finding with numbers/dates from the documents",
      "risk_type": "revenue_inflation | circular_trading | cash_suppression | gst_evasion | benign_mismatch | other"
    }}
  ],
  "positive_signals": ["list of reassuring findings, if any"],
  "recommendation": "Approve with caution | Reject | Request additional documents | Further investigation needed"
}}

Rules:
- If you cannot extract a specific number, use "N/A" for that field.
- discrepancy_pct must be a number (percentage gap between GST turnover and bank credits). Use 0 if aligned.
- flags array: include ALL anomalies found (can be empty [] if none).
- positive_signals: include genuine positives only (can be empty []).
- Be conservative — if evidence is unclear, flag it as medium rather than ignoring it.
"""


@router.post("/cross-validate")
async def cross_validate(
    gst_file: UploadFile = File(..., description="GST returns PDF"),
    bank_file: UploadFile = File(..., description="Bank statement PDF"),
):
    """
    Cross-validate GST returns against bank statement.
    Extracts full text from both PDFs and passes directly to LLM for analysis.
    Returns structured JSON with verdict, flags, revenue comparison, and recommendation.
    """
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")

    # Validate file types
    for f, label in [(gst_file, "GST"), (bank_file, "Bank")]:
        if not (f.filename or "").lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"{label} file must be a PDF.")

    # Extract text from both PDFs
    try:
        gst_text = _extract_text(gst_file)
        bank_text = _extract_text(bank_file)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"PDF extraction failed: {e}")

    if not gst_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract text from GST PDF. Is it a scanned image?")
    if not bank_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract text from Bank Statement PDF. Is it a scanned image?")

    # Truncate to avoid hitting context limits (~30k chars each = ~8k tokens each)
    MAX_CHARS = 30_000
    gst_text_trunc = gst_text[:MAX_CHARS]
    bank_text_trunc = bank_text[:MAX_CHARS]

    client = Groq(api_key=GROQ_API_KEY)
    user_msg = ANALYSIS_PROMPT.format(gst_text=gst_text_trunc, bank_text=bank_text_trunc)

    try:
        response = groq_chat_with_retry(
            client,
            max_retries=2,
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_msg},
            ],
            temperature=0.1,
            max_tokens=2048,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM call failed: {e}")

    raw = response.choices[0].message.content.strip()

    # Strip markdown fences if the model added them
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail=f"LLM returned invalid JSON: {raw[:300]}")

    return result
