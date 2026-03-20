"""
Web Research Agent — searches the web for company/promoter intelligence
and returns structured risk findings for credit assessment.
"""
import os
from typing import Dict, List
from tavily import TavilyClient
from groq import Groq
from dotenv import load_dotenv
from services.document_processor import GROQ_MODEL

load_dotenv()

TAVILY_API_KEY: str = os.getenv("TAVILY_API_KEY", "")
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")


def _build_queries(company_name: str, sector: str) -> List[str]:
    """
    Build a list of targeted search queries for a given company.
    We run 4 searches covering the most important credit risk dimensions.
    """
    return [
        f"{company_name} promoter fraud litigation court case news",
        f"{company_name} financial performance revenue profit loss 2024",
        f"{company_name} MCA filing NCLT insolvency default",
        f"{sector} sector RBI regulation headwinds India 2024",
    ]


def _run_searches(queries: List[str]) -> List[Dict]:
    """
    Run each query using Tavily and collect raw results.
    Returns a list of result dicts, one per query.
    Each result has: query, results (list of {title, url, content}).
    """
    if not TAVILY_API_KEY:
        raise RuntimeError("TAVILY_API_KEY is not set in your .env file.")

    client = TavilyClient(api_key=TAVILY_API_KEY)
    all_results = []

    for query in queries:
        try:
            response = client.search(
                query=query,
                search_depth="basic",   # "basic" uses fewer credits than "advanced"
                max_results=3,          # top 3 results per query is enough
                include_answer=False,
            )
            # Each result has: title, url, content (snippet), score
            all_results.append({
                "query": query,
                "results": response.get("results", []),
            })
        except Exception as e:
            # If one query fails, don't crash — just record empty results
            all_results.append({
                "query": query,
                "results": [],
                "error": str(e),
            })

    return all_results


def _summarize_with_groq(
    company_name: str,
    sector: str,
    raw_results: List[Dict],
) -> Dict:
    """
    Take all raw search results and ask Groq to:
    1. Summarize the key findings
    2. Identify specific risk flags
    3. Give an overall sentiment (positive / neutral / negative)

    Returns a structured dict the frontend can directly render.
    """
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set in your .env file.")

    # Flatten all search results into one readable block of text for the prompt
    context_parts = []
    sources = []

    for item in raw_results:
        query_label = item["query"]
        context_parts.append(f"\n--- Search: '{query_label}' ---")
        for r in item.get("results", []):
            title = r.get("title", "")
            url = r.get("url", "")
            content = r.get("content", "")
            context_parts.append(f"Title: {title}\nURL: {url}\nSnippet: {content}\n")
            if url:
                sources.append({"title": title, "url": url})

    context_text = "\n".join(context_parts)

    # If we got zero results from all searches, return early
    if not sources:
        return {
            "company_name": company_name,
            "sector": sector,
            "summary": "No web results found for this company.",
            "risk_flags": [],
            "positive_signals": [],
            "sentiment": "neutral",
            "sources": [],
        }

    prompt = f"""You are a senior credit analyst doing secondary research on a loan applicant.

Company: {company_name}
Sector: {sector}

Below are web search results about this company. Analyze them and return a JSON object.

STRICT RULES:
- Return ONLY valid JSON. No markdown, no code fences, no explanation outside the JSON.
- Be factual. Only report what is actually in the search results.
- Do NOT fabricate findings.

Required JSON structure:
{{
  "summary": "<2-3 sentence overview of what the web research found about this company>",
  "risk_flags": [
    {{
      "severity": "<high | medium | low>",
      "title": "<short flag title>",
      "detail": "<one sentence explaining the risk found in search results>"
    }}
  ],
  "positive_signals": [
    "<one positive finding per item, e.g. strong revenue growth, clean compliance record>"
  ],
  "sentiment": "<positive | neutral | negative>",
  "sector_outlook": "<one sentence on sector-level risks or tailwinds found in research>"
}}

Web search results:
{context_text}
"""

    client = Groq(api_key=GROQ_API_KEY)
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=1500,
    )

    raw = response.choices[0].message.content.strip()

    # Strip markdown fences if Groq wraps response in ```json ... ```
    if raw.startswith("```"):
        import re
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw.strip())

    import json
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # If JSON parse fails, return a safe fallback with the raw text
        parsed = {
            "summary": raw[:500],
            "risk_flags": [],
            "positive_signals": [],
            "sentiment": "neutral",
            "sector_outlook": "N/A",
        }

    # Attach metadata
    parsed["company_name"] = company_name
    parsed["sector"] = sector
    parsed["sources"] = sources

    return parsed


def run_web_research(company_name: str, sector: str) -> Dict:
    """
    Main entry point — called by the router.
    Runs all searches and returns the summarized intelligence report.

    Args:
        company_name: Name of the company being assessed.
        sector: Industry sector (e.g. NBFC, Manufacturing, IT Services).

    Returns:
        Dict with summary, risk_flags, positive_signals, sentiment, sources.
    """
    queries = _build_queries(company_name, sector)
    raw_results = _run_searches(queries)
    report = _summarize_with_groq(company_name, sector, raw_results)
    return report