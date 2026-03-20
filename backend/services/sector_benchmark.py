"""
Sector Benchmarking Service

Compares a company's key financial ratios against Indian sector medians.
Benchmarks are sourced from RBI reports, SEBI data, and industry publications.
"""
import json
import os
import re
from typing import Dict, List, Optional

from groq import Groq
from dotenv import load_dotenv
from services.document_processor import GROQ_API_KEY, GROQ_MODEL
from services.rag_service import get_all_chunks
from services.document_processor import FAISS_INDEX_PATH
import os

load_dotenv()


# ── Sector benchmark data ─────────────────────────────────────────────────────
# All values are Indian market medians (FY2023-24)
# Sources: RBI Annual Report, SEBI data, CMIE Prowess, industry reports
# de_ratio        = Debt / Equity (x)
# net_margin_pct  = Net Profit Margin (%)
# current_ratio   = Current Assets / Current Liabilities
# roe_pct         = Return on Equity (%)
# revenue_growth  = YoY Revenue Growth (%)
# interest_coverage = EBIT / Interest Expense (x)

SECTOR_BENCHMARKS: Dict[str, Dict] = {
    "nbfc": {
        "label": "NBFC (Non-Banking Financial Company)",
        "de_ratio":           {"median": 4.5,  "low_risk": 3.0,  "high_risk": 7.0,  "unit": "x",  "higher_is": "worse"},
        "net_margin_pct":     {"median": 18.0, "low_risk": 12.0, "high_risk": 8.0,  "unit": "%",  "higher_is": "better"},
        "current_ratio":      {"median": 1.4,  "low_risk": 1.2,  "high_risk": 1.0,  "unit": "x",  "higher_is": "better"},
        "roe_pct":            {"median": 14.0, "low_risk": 10.0, "high_risk": 6.0,  "unit": "%",  "higher_is": "better"},
        "revenue_growth":     {"median": 18.0, "low_risk": 8.0,  "high_risk": 0.0,  "unit": "%",  "higher_is": "better"},
        "interest_coverage":  {"median": 1.8,  "low_risk": 1.5,  "high_risk": 1.2,  "unit": "x",  "higher_is": "better"},
    },
    "manufacturing": {
        "label": "Manufacturing",
        "de_ratio":           {"median": 0.8,  "low_risk": 1.5,  "high_risk": 2.5,  "unit": "x",  "higher_is": "worse"},
        "net_margin_pct":     {"median": 8.0,  "low_risk": 5.0,  "high_risk": 2.0,  "unit": "%",  "higher_is": "better"},
        "current_ratio":      {"median": 1.6,  "low_risk": 1.2,  "high_risk": 1.0,  "unit": "x",  "higher_is": "better"},
        "roe_pct":            {"median": 12.0, "low_risk": 8.0,  "high_risk": 4.0,  "unit": "%",  "higher_is": "better"},
        "revenue_growth":     {"median": 10.0, "low_risk": 4.0,  "high_risk": -2.0, "unit": "%",  "higher_is": "better"},
        "interest_coverage":  {"median": 4.5,  "low_risk": 2.5,  "high_risk": 1.5,  "unit": "x",  "higher_is": "better"},
    },
    "technology": {
        "label": "Technology / IT Services",
        "de_ratio":           {"median": 0.2,  "low_risk": 0.5,  "high_risk": 1.0,  "unit": "x",  "higher_is": "worse"},
        "net_margin_pct":     {"median": 18.0, "low_risk": 12.0, "high_risk": 6.0,  "unit": "%",  "higher_is": "better"},
        "current_ratio":      {"median": 2.5,  "low_risk": 1.5,  "high_risk": 1.0,  "unit": "x",  "higher_is": "better"},
        "roe_pct":            {"median": 22.0, "low_risk": 14.0, "high_risk": 8.0,  "unit": "%",  "higher_is": "better"},
        "revenue_growth":     {"median": 15.0, "low_risk": 8.0,  "high_risk": 0.0,  "unit": "%",  "higher_is": "better"},
        "interest_coverage":  {"median": 25.0, "low_risk": 10.0, "high_risk": 5.0,  "unit": "x",  "higher_is": "better"},
    },
    "infrastructure": {
        "label": "Infrastructure",
        "de_ratio":           {"median": 2.5,  "low_risk": 3.5,  "high_risk": 5.0,  "unit": "x",  "higher_is": "worse"},
        "net_margin_pct":     {"median": 6.0,  "low_risk": 3.0,  "high_risk": 1.0,  "unit": "%",  "higher_is": "better"},
        "current_ratio":      {"median": 1.2,  "low_risk": 1.0,  "high_risk": 0.8,  "unit": "x",  "higher_is": "better"},
        "roe_pct":            {"median": 9.0,  "low_risk": 5.0,  "high_risk": 2.0,  "unit": "%",  "higher_is": "better"},
        "revenue_growth":     {"median": 12.0, "low_risk": 5.0,  "high_risk": -1.0, "unit": "%",  "higher_is": "better"},
        "interest_coverage":  {"median": 2.2,  "low_risk": 1.5,  "high_risk": 1.1,  "unit": "x",  "higher_is": "better"},
    },
    "retail": {
        "label": "Retail / FMCG",
        "de_ratio":           {"median": 0.5,  "low_risk": 1.0,  "high_risk": 2.0,  "unit": "x",  "higher_is": "worse"},
        "net_margin_pct":     {"median": 5.0,  "low_risk": 3.0,  "high_risk": 1.0,  "unit": "%",  "higher_is": "better"},
        "current_ratio":      {"median": 1.4,  "low_risk": 1.1,  "high_risk": 0.9,  "unit": "x",  "higher_is": "better"},
        "roe_pct":            {"median": 16.0, "low_risk": 10.0, "high_risk": 5.0,  "unit": "%",  "higher_is": "better"},
        "revenue_growth":     {"median": 12.0, "low_risk": 6.0,  "high_risk": 0.0,  "unit": "%",  "higher_is": "better"},
        "interest_coverage":  {"median": 6.0,  "low_risk": 3.0,  "high_risk": 1.5,  "unit": "x",  "higher_is": "better"},
    },
    "pharma": {
        "label": "Pharmaceuticals",
        "de_ratio":           {"median": 0.4,  "low_risk": 0.8,  "high_risk": 1.5,  "unit": "x",  "higher_is": "worse"},
        "net_margin_pct":     {"median": 12.0, "low_risk": 7.0,  "high_risk": 3.0,  "unit": "%",  "higher_is": "better"},
        "current_ratio":      {"median": 2.0,  "low_risk": 1.4,  "high_risk": 1.0,  "unit": "x",  "higher_is": "better"},
        "roe_pct":            {"median": 14.0, "low_risk": 8.0,  "high_risk": 4.0,  "unit": "%",  "higher_is": "better"},
        "revenue_growth":     {"median": 10.0, "low_risk": 5.0,  "high_risk": 0.0,  "unit": "%",  "higher_is": "better"},
        "interest_coverage":  {"median": 8.0,  "low_risk": 4.0,  "high_risk": 2.0,  "unit": "x",  "higher_is": "better"},
    },
    "construction": {
        "label": "Construction / Real Estate",
        "de_ratio":           {"median": 1.8,  "low_risk": 2.5,  "high_risk": 4.0,  "unit": "x",  "higher_is": "worse"},
        "net_margin_pct":     {"median": 7.0,  "low_risk": 4.0,  "high_risk": 1.0,  "unit": "%",  "higher_is": "better"},
        "current_ratio":      {"median": 1.3,  "low_risk": 1.0,  "high_risk": 0.8,  "unit": "x",  "higher_is": "better"},
        "roe_pct":            {"median": 10.0, "low_risk": 6.0,  "high_risk": 2.0,  "unit": "%",  "higher_is": "better"},
        "revenue_growth":     {"median": 14.0, "low_risk": 5.0,  "high_risk": -2.0, "unit": "%",  "higher_is": "better"},
        "interest_coverage":  {"median": 3.0,  "low_risk": 1.8,  "high_risk": 1.2,  "unit": "x",  "higher_is": "better"},
    },
    "healthcare": {
        "label": "Healthcare / Hospitals",
        "de_ratio":           {"median": 0.9,  "low_risk": 1.5,  "high_risk": 2.5,  "unit": "x",  "higher_is": "worse"},
        "net_margin_pct":     {"median": 9.0,  "low_risk": 5.0,  "high_risk": 2.0,  "unit": "%",  "higher_is": "better"},
        "current_ratio":      {"median": 1.5,  "low_risk": 1.2,  "high_risk": 0.9,  "unit": "x",  "higher_is": "better"},
        "roe_pct":            {"median": 13.0, "low_risk": 8.0,  "high_risk": 3.0,  "unit": "%",  "higher_is": "better"},
        "revenue_growth":     {"median": 14.0, "low_risk": 8.0,  "high_risk": 0.0,  "unit": "%",  "higher_is": "better"},
        "interest_coverage":  {"median": 5.0,  "low_risk": 2.5,  "high_risk": 1.5,  "unit": "x",  "higher_is": "better"},
    },
    "agriculture": {
        "label": "Agriculture / Agri-business",
        "de_ratio":           {"median": 0.7,  "low_risk": 1.2,  "high_risk": 2.0,  "unit": "x",  "higher_is": "worse"},
        "net_margin_pct":     {"median": 6.0,  "low_risk": 3.0,  "high_risk": 1.0,  "unit": "%",  "higher_is": "better"},
        "current_ratio":      {"median": 1.5,  "low_risk": 1.1,  "high_risk": 0.9,  "unit": "x",  "higher_is": "better"},
        "roe_pct":            {"median": 10.0, "low_risk": 6.0,  "high_risk": 2.0,  "unit": "%",  "higher_is": "better"},
        "revenue_growth":     {"median": 8.0,  "low_risk": 3.0,  "high_risk": -3.0, "unit": "%",  "higher_is": "better"},
        "interest_coverage":  {"median": 3.5,  "low_risk": 2.0,  "high_risk": 1.2,  "unit": "x",  "higher_is": "better"},
    },
    "textiles": {
        "label": "Textiles / Apparel",
        "de_ratio":           {"median": 1.2,  "low_risk": 2.0,  "high_risk": 3.5,  "unit": "x",  "higher_is": "worse"},
        "net_margin_pct":     {"median": 5.0,  "low_risk": 2.5,  "high_risk": 0.5,  "unit": "%",  "higher_is": "better"},
        "current_ratio":      {"median": 1.4,  "low_risk": 1.1,  "high_risk": 0.9,  "unit": "x",  "higher_is": "better"},
        "roe_pct":            {"median": 9.0,  "low_risk": 5.0,  "high_risk": 2.0,  "unit": "%",  "higher_is": "better"},
        "revenue_growth":     {"median": 8.0,  "low_risk": 3.0,  "high_risk": -2.0, "unit": "%",  "higher_is": "better"},
        "interest_coverage":  {"median": 3.0,  "low_risk": 1.8,  "high_risk": 1.1,  "unit": "x",  "higher_is": "better"},
    },
    "finance": {
        "label": "Finance / Banking",
        "de_ratio":           {"median": 8.0,  "low_risk": 6.0,  "high_risk": 12.0, "unit": "x",  "higher_is": "worse"},
        "net_margin_pct":     {"median": 15.0, "low_risk": 10.0, "high_risk": 5.0,  "unit": "%",  "higher_is": "better"},
        "current_ratio":      {"median": 1.2,  "low_risk": 1.0,  "high_risk": 0.9,  "unit": "x",  "higher_is": "better"},
        "roe_pct":            {"median": 13.0, "low_risk": 8.0,  "high_risk": 4.0,  "unit": "%",  "higher_is": "better"},
        "revenue_growth":     {"median": 14.0, "low_risk": 7.0,  "high_risk": 0.0,  "unit": "%",  "higher_is": "better"},
        "interest_coverage":  {"median": 1.5,  "low_risk": 1.3,  "high_risk": 1.1,  "unit": "x",  "higher_is": "better"},
    },
}

# Friendly display names for metrics
METRIC_LABELS = {
    "de_ratio":          "Debt / Equity Ratio",
    "net_margin_pct":    "Net Profit Margin",
    "current_ratio":     "Current Ratio",
    "roe_pct":           "Return on Equity",
    "revenue_growth":    "Revenue Growth",
    "interest_coverage": "Interest Coverage",
}


def _resolve_sector_key(sector: str) -> Optional[str]:
    """
    Map a free-text sector name to the closest benchmark key.
    Case-insensitive, partial match.
    """
    s = sector.lower().strip()
    # Direct mappings
    direct = {
        "technology": "technology", "it": "technology", "it services": "technology",
        "software": "technology", "tech": "technology",
        "nbfc": "nbfc", "non banking": "nbfc", "non-banking": "nbfc",
        "manufacturing": "manufacturing", "auto": "manufacturing", "automobile": "manufacturing",
        "infrastructure": "infrastructure", "infra": "infrastructure",
        "retail": "retail", "fmcg": "retail", "consumer": "retail",
        "pharma": "pharma", "pharmaceutical": "pharma", "pharmaceuticals": "pharma",
        "construction": "construction", "real estate": "construction", "realty": "construction",
        "healthcare": "healthcare", "hospital": "healthcare", "health": "healthcare",
        "agriculture": "agriculture", "agri": "agriculture", "agribusiness": "agriculture",
        "textiles": "textiles", "textile": "textiles", "apparel": "textiles",
        "finance": "finance", "banking": "finance", "bank": "finance",
    }
    for key, val in direct.items():
        if key in s:
            return val
    # Fallback: try all benchmark keys
    for key in SECTOR_BENCHMARKS:
        if key in s:
            return key
    return None


def _extract_company_metrics(company_name: str, sector: str) -> Dict:
    """
    Use Groq to extract key financial ratios from indexed document chunks.
    Returns a dict of metric_name → float value (or None if not found).
    """
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set.")
    
    raw_text_path = os.path.join(os.path.dirname(FAISS_INDEX_PATH) or '.', 'raw_document_text.txt')
    context = ""

    if os.path.exists(raw_text_path):
         with open(raw_text_path, 'r', encoding='utf-8') as f:
              context = f.read()[:18000]

    if not context.strip():
    # Fallback to FAISS chunks
       all_chunks = get_all_chunks()
       if not all_chunks:
         return {}
       context = "\n\n".join(
        f"[{c.get('section','Section')}]\n{c.get('content','')}"
        for c in all_chunks[:15]
    )[:16000]
       
    prompt = f"""You are a financial analyst. Extract the following key financial ratios for {company_name} from the document excerpts below.

STRICT RULES:
- Return ONLY a valid JSON object. No markdown, no explanation.
- If a value cannot be determined from the documents, use null — never guess.
- All percentages as plain floats (e.g. 12.5 for 12.5%, NOT 0.125).
- Debt/Equity and other ratios as plain floats (e.g. 1.8 for 1.8x).
- For revenue_growth: calculate YoY % change if multiple years present.

Required JSON:
{{
  "de_ratio":          <float or null>,
  "net_margin_pct":    <float or null>,
  "current_ratio":     <float or null>,
  "roe_pct":           <float or null>,
  "revenue_growth":    <float or null>,
  "interest_coverage": <float or null>,
  "extraction_notes":  "<one sentence about data quality or what was/wasn't found>"
}}

Document excerpts:
{context}
"""

    client = Groq(api_key=GROQ_API_KEY)
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
        max_tokens=600,
    )

    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw.strip())

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"extraction_notes": "Could not parse metrics from documents."}


def _compare_metric(
    metric_key: str,
    company_value: Optional[float],
    benchmark: Dict,
) -> Dict:
    """
    Compare a single company metric against sector benchmark.
    Returns a comparison dict with rating and insight sentence.
    """
    label      = METRIC_LABELS.get(metric_key, metric_key)
    median     = benchmark["median"]
    unit       = benchmark["unit"]
    higher_is  = benchmark["higher_is"]
    low_thresh = benchmark["low_risk"]
    high_thresh= benchmark["high_risk"]

    if company_value is None:
        return {
            "metric":       metric_key,
            "label":        label,
            "company_value": None,
            "sector_median": median,
            "unit":         unit,
            "rating":       "unknown",
            "insight":      f"{label}: Not found in documents — cannot benchmark.",
            "vs_median_pct": None,
        }

    # Calculate % deviation from median
    if median != 0:
        vs_median_pct = ((company_value - median) / abs(median)) * 100
    else:
        vs_median_pct = 0.0

    # Determine rating based on thresholds
    if higher_is == "better":
        if company_value >= low_thresh:
            rating = "good"
        elif company_value >= high_thresh:
            rating = "average"
        else:
            rating = "poor"
    else:  # higher is worse (e.g. D/E ratio)
        if company_value <= low_thresh:
            rating = "good"
        elif company_value <= high_thresh:
            rating = "average"
        else:
            rating = "poor"

    # Build insight sentence
    direction_word = (
        "above" if company_value > median else
        "below" if company_value < median else
        "at"
    )
    magnitude = abs(vs_median_pct)
    if magnitude < 5:
        magnitude_word = "in line with"
        direction_word = ""
    elif magnitude < 20:
        magnitude_word = "slightly"
    elif magnitude < 50:
        magnitude_word = "moderately"
    else:
        magnitude_word = "significantly"

    if direction_word:
        position = f"{magnitude_word} {direction_word}"
    else:
        position = magnitude_word

    rating_context = {
        "good":    "— Positive signal",
        "average": "— Monitor closely",
        "poor":    "— Requires attention",
    }.get(rating, "")

    insight = (
        f"{label} of {company_value}{unit} is {position} the "
        f"{benchmark.get('sector_label','sector')} median of {median}{unit} {rating_context}"
    )

    return {
        "metric":        metric_key,
        "label":         label,
        "company_value": company_value,
        "sector_median": median,
        "unit":          unit,
        "rating":        rating,
        "insight":       insight,
        "vs_median_pct": round(vs_median_pct, 1),
    }


def run_sector_benchmark(company_name: str, sector: str) -> Dict:
    """
    Main entry point — called by the router.

    Extracts company metrics from indexed documents, resolves sector benchmarks,
    and returns a full comparison report.
    """
    sector_key = _resolve_sector_key(sector)
    has_benchmark = sector_key is not None
    benchmarks = SECTOR_BENCHMARKS.get(sector_key, {}) if has_benchmark else {}
    sector_label = benchmarks.get("label", sector) if has_benchmark else sector

    # Extract company metrics from indexed docs
    raw_metrics = _extract_company_metrics(company_name, sector)
    extraction_notes = raw_metrics.pop("extraction_notes", "")

    # Run comparison for each metric
    comparisons = []
    ratings_found = []

    for metric_key in METRIC_LABELS:
        company_val = raw_metrics.get(metric_key)
        if company_val is not None:
            try:
                company_val = float(company_val)
            except (TypeError, ValueError):
                company_val = None

        if has_benchmark and metric_key in benchmarks:
            bench = {**benchmarks[metric_key], "sector_label": sector_label}
            result = _compare_metric(metric_key, company_val, bench)
        else:
            result = {
                "metric":        metric_key,
                "label":         METRIC_LABELS[metric_key],
                "company_value": company_val,
                "sector_median": None,
                "unit":          "",
                "rating":        "unknown",
                "insight":       f"No benchmark available for sector: {sector}",
                "vs_median_pct": None,
            }

        comparisons.append(result)
        if result["rating"] != "unknown":
            ratings_found.append(result["rating"])

    # Overall benchmark rating
    if not ratings_found:
        overall_rating = "insufficient_data"
    else:
        poor_count    = ratings_found.count("poor")
        good_count    = ratings_found.count("good")
        average_count = ratings_found.count("average")
        if poor_count >= 3:
            overall_rating = "below_average"
        elif poor_count >= 2:
            overall_rating = "mixed"
        elif good_count >= 4:
            overall_rating = "above_average"
        else:
            overall_rating = "average"

    # Top 3 standout insights (best and worst performers)
    rated = [c for c in comparisons if c["rating"] in ("good", "poor")]
    rated.sort(key=lambda x: (0 if x["rating"] == "poor" else 1))
    standout_insights = [c["insight"] for c in rated[:3]]

    return {
        "company_name":       company_name,
        "sector":             sector,
        "sector_key":         sector_key,
        "sector_label":       sector_label,
        "has_benchmark":      has_benchmark,
        "overall_rating":     overall_rating,
        "extraction_notes":   extraction_notes,
        "comparisons":        comparisons,
        "standout_insights":  standout_insights,
        "metrics_found":      sum(1 for c in comparisons if c["company_value"] is not None),
        "metrics_total":      len(comparisons),
    }