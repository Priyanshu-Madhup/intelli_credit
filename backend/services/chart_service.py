"""
Financial chart data extraction service.

One FAISS query (no LLM cost) → one LLM call.
FAISS was populated at upload time; this just retrieves the top-k chunks
covering all financial topics in a single broad semantic query.
"""
import json
import re
from typing import Dict

from groq import Groq
from dotenv import load_dotenv

from services.document_processor import GROQ_API_KEY, GROQ_MODEL, truncate_chunks_by_tokens

load_dotenv()

# Tokens of document context to send to the LLM
_CONTEXT_TOKEN_BUDGET = 1200

_SCHEMA = r"""{
  "yearly_trend": [
    {"year": "<FY label e.g. FY24>", "revenue": <float Cr|null>, "profit": <float Cr|null>, "debt": <float Cr|null>}
  ],
  "financial_overview": {
    "annual_revenue":       "<string e.g. 723 Cr, or N/A>",
    "annual_revenue_delta": "<YoY change e.g. +11.4% or N/A>",
    "annual_revenue_trend": "<up|down>",
    "net_profit":           "<string or N/A>",
    "net_profit_margin":    "<margin % string or N/A>",
    "net_profit_trend":     "<up|down>",
    "total_debt":           "<string or N/A>",
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


def _sanitize_llm_json(raw: str) -> str:
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw.strip())
    raw = re.sub(r':\s*[\u2014\u2013]\s*([,}\]])', r': null\1', raw)
    raw = re.sub(r':\s*"[\u2014\u2013]"\s*([,}\]])', r': null\1', raw)
    raw = re.sub(r':\s*[\u2014\u2013]\s*$', ': null', raw, flags=re.MULTILINE)
    raw = re.sub(r':\s*"null"\s*([,}\]])', r': null\1', raw)
    return raw


def fetch_chart_data(company_name: str = "") -> Dict:
    """
    Two focused FAISS queries (free, no LLM) — interleaved so all 4 topics
    (revenue, profit, debt, GST) get representation before the token budget cuts off.
    Then one LLM call to extract everything.
    """
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set.")

    from services.rag_service import retrieve_chunks

    # 2 targeted queries × top_k=2 (exact, no boost) → max 4 unique chunks, 1 LLM call
    chunks_rev = retrieve_chunks(
        "revenue INR crore PAT profit after tax FY YoY",
        top_k=2,
        exact=True,
    )
    # Query 2: debt + GST + ratios
    chunks_debt = retrieve_chunks(
        "debt borrowings INR crore GST equity ratio",
        top_k=2,
        exact=True,
    )

    # Interleave: take 1 from each alternately so all topics survive the token budget
    seen: set = set()
    chunks: list = []
    for pair in zip(chunks_rev or [], chunks_debt or []):
        for c in pair:
            key = c.get("content", "")[:100]
            if key not in seen:
                seen.add(key)
                chunks.append(c)
    # Append any leftovers from the longer list
    for c in (chunks_rev or []) + (chunks_debt or []):
        key = c.get("content", "")[:100]
        if key not in seen:
            seen.add(key)
            chunks.append(c)

    if not chunks:
        return _empty()

    trimmed = truncate_chunks_by_tokens(chunks, max_tokens=_CONTEXT_TOKEN_BUDGET)
    context = "\n\n".join(
        f"[{c.get('section', 'Doc')}]\n{c['content']}" for c in trimmed
    )

    client = Groq(api_key=GROQ_API_KEY)
    prompt = (
        "You are a financial data extractor for Indian company documents.\n"
        + (f"Company: {company_name}\n" if company_name else "")
        + "Extract ALL financial figures from the excerpts below. "
        "PAT (Profit After Tax) = net_profit — map it to the net_profit field.\n"
        "Convert every amount to Crore (Rs.). Divide Lakhs÷100, Millions÷10.\n"
        "Return ONLY valid JSON — no markdown, no code fences, no extra text.\n\n"
        f"Document excerpts:\n{context}\n\n"
        f"Required JSON schema:\n{_SCHEMA}"
    )

    try:
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.05,
            max_tokens=800,
        )
        raw = _sanitize_llm_json(response.choices[0].message.content.strip())
        data = json.loads(raw)

        # Coerce string values in profitability_metrics to None
        pm = data.get("profitability_metrics", {})
        for k in list(pm.keys()):
            if isinstance(pm[k], str):
                pm[k] = None

        # Drop all-zero/null yearly rows
        data["yearly_trend"] = [
            row for row in data.get("yearly_trend", [])
            if any(
                v is not None and v != 0
                for v in [row.get("revenue"), row.get("profit"), row.get("debt")]
            )
        ]
        return data
    except Exception:
        return _empty()


def _empty() -> Dict:
    return {
        "yearly_trend": [],
        "financial_overview": {},
        "profitability_metrics": {},
    }
