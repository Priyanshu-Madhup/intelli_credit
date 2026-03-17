"""
Financial chart data extraction service.

Reads the raw extracted PDF text (saved during document processing) and asks Groq
to extract every financial number it can find, producing chart-ready JSON.
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

_SCHEMA = r"""Return ONLY a valid JSON object. No markdown, no code fences, no text outside the JSON.

YOUR TASK: Read the document text below and extract EVERY financial number you can find.

RULES:
1. Look for ANY numbers: revenue, sales, income, profit, loss, debt, equity, turnover, ratios, margins, fees, grants, expenditure, assets, liabilities, disbursements, AUM, loan book size, interest income, operating expenses.
2. For yearly_trend: find figures for multiple years/periods. Look for FY22, FY23, 2022-23, March 2022, year ended, Q1, Q2, etc.
3. All monetary values in yearly_trend MUST be floats in Crore. Divide Lakhs by 100. Divide thousands by 10000000. Divide millions by 10.
4. If a number is genuinely absent, use null — NEVER use dashes or N/A in numeric fields.
5. For string fields in financial_overview: write what you found (e.g. "48.2 Cr"); write "N/A" only if truly not in doc.
6. yearly_trend must have at least 1 entry if ANY year-wise number exists.
7. If the document mentions AUM, disbursement amounts, loan book size, or portfolio values — treat the LARGEST as "revenue". Treat operating profit or PAT as "profit". Treat total borrowings or debt on books as "debt".

{
  "yearly_trend": [
    {"year": "<FY label>", "revenue": <float|null>, "profit": <float|null>, "debt": <float|null>}
  ],
  "financial_overview": {
    "annual_revenue":       "<latest revenue/AUM/income string e.g. 48.2 Cr or N/A>",
    "annual_revenue_delta": "<YoY change e.g. +11.4% or N/A>",
    "annual_revenue_trend": "<up|down>",
    "net_profit":           "<latest profit/loss/PAT string or N/A>",
    "net_profit_margin":    "<margin % string or N/A>",
    "net_profit_trend":     "<up|down>",
    "total_debt":           "<total loans/liabilities/borrowings string or N/A>",
    "de_ratio":             "<Debt/Equity ratio e.g. 1.8x or N/A>",
    "total_debt_trend":     "<up|down>",
    "gst_turnover":         "<GST turnover string or N/A>",
    "gst_turnover_trend":   "<up|down>"
  },
  "profitability_metrics": {
    "gross_margin_pct":  <float|null>,
    "net_margin_pct":    <float|null>,
    "roe_pct":           <float|null>,
    "current_ratio":     <float|null>,
    "de_ratio_num":      <float|null>,
    "interest_coverage": <float|null>
  }
}"""


def _read_raw_text() -> str:
    """Read the raw document text saved during PDF processing."""
    if not os.path.exists(RAW_TEXT_PATH):
        return ""
    with open(RAW_TEXT_PATH, 'r', encoding='utf-8') as f:
        return f.read()


def fetch_chart_data(company_name: str = "") -> Dict:
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set.")

    raw_text = _read_raw_text()
    if not raw_text.strip():
        # Fallback: concatenate FAISS chunk content (may be summaries only)
        all_chunks = get_all_chunks()
        if not all_chunks:
            return _empty()
        raw_text = "\n\n".join(c.get('content', '') for c in all_chunks)

    # Send up to 28000 chars of raw PDF text — this preserves actual numbers
    context = raw_text[:28000]

    client = Groq(api_key=GROQ_API_KEY)
    prompt = (
        "You are a financial data extractor trained on Indian company documents.\n"
        + (f"Company: {company_name}\n" if company_name else "")
        + "\nThe text below is the COMPLETE content of the uploaded document. "
        "Extract EVERY financial number, ratio, and monetary figure you can find. "
        "Include figures from tables, narrative text, summaries, and footnotes. "
        "Convert all amounts to Crore (Rs.).\n\n"
        f"FULL DOCUMENT CONTENT:\n{context}\n\n"
        f"Extract all financial data following this schema:\n{_SCHEMA}"
    )

    try:
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.05,
            max_tokens=2000,
        )
        raw = response.choices[0].message.content.strip()
    except Exception:
        return _empty()

    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw.strip())

    raw = re.sub(r':\s*[\u2014\u2013]\s*([,}\]])', r': null\1', raw)
    raw = re.sub(r':\s*"[\u2014\u2013]"\s*([,}\]])', r': null\1', raw)
    raw = re.sub(r':\s*[\u2014\u2013]\s*$', ': null', raw, flags=re.MULTILINE)
    raw = re.sub(r':\s*"null"\s*([,}\]])', r': null\1', raw)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return _empty()

    data.setdefault("yearly_trend", [])
    data.setdefault("financial_overview", {})
    data.setdefault("profitability_metrics", {})

    pm = data.get("profitability_metrics", {})
    for k in list(pm.keys()):
        if isinstance(pm[k], str):
            pm[k] = None

    data["yearly_trend"] = [
        row for row in data["yearly_trend"]
        if any(
            v is not None and v != 0
            for v in [row.get("revenue"), row.get("profit"), row.get("debt")]
        )
    ]

    return data


def _empty() -> Dict:
    return {
        "yearly_trend": [],
        "financial_overview": {},
        "profitability_metrics": {},
    }
