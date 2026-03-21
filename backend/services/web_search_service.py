"""
Web search service using Serper API for secondary research.

Provides company-level web intelligence: news, regulatory filings,
litigation, sector trends, and promoter background.
"""
import json
import os
import http.client
from typing import Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

SERPER_API_KEY = os.getenv("SERPER_API_KEY", "")
SERPER_HOST = "google.serper.dev"


def _serper_search(query: str, num: int = 10, search_type: str = "search") -> Dict:
    """
    Execute a single Serper API search request.

    Args:
        query: Search query string.
        num: Number of results to return (max 100).
        search_type: 'search' for web, 'news' for news results.

    Returns:
        Parsed JSON response from Serper.
    """
    if not SERPER_API_KEY:
        raise RuntimeError("SERPER_API_KEY is not set in .env")

    conn = http.client.HTTPSConnection(SERPER_HOST)
    payload = json.dumps({"q": query, "num": num})
    headers = {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
    }

    endpoint = "/search" if search_type == "search" else "/news"
    conn.request("POST", endpoint, payload, headers)
    res = conn.getresponse()
    data = res.read()
    conn.close()

    return json.loads(data.decode("utf-8"))


def _extract_organic(results: Dict) -> List[Dict]:
    """Extract organic/news results into a flat list."""
    items = []
    for entry in results.get("organic", []):
        items.append({
            "title": entry.get("title", ""),
            "snippet": entry.get("snippet", ""),
            "link": entry.get("link", ""),
            "source": entry.get("source", entry.get("link", "")),
            "date": entry.get("date", ""),
        })
    for entry in results.get("news", []):
        items.append({
            "title": entry.get("title", ""),
            "snippet": entry.get("snippet", ""),
            "link": entry.get("link", ""),
            "source": entry.get("source", ""),
            "date": entry.get("date", ""),
        })
    return items


def search_company_news(company_name: str, num: int = 8) -> List[Dict]:
    """Search for recent news about a company."""
    results = _serper_search(f"{company_name} India latest news", num, "news")
    return _extract_organic(results)


def search_promoter_background(company_name: str, promoter_name: Optional[str] = None, num: int = 6) -> List[Dict]:
    """Search for promoter/director background information."""
    query = f"{company_name} promoter director background India"
    if promoter_name:
        query = f"{promoter_name} {company_name} promoter director India"
    results = _serper_search(query, num)
    return _extract_organic(results)


def search_litigation(company_name: str, num: int = 6) -> List[Dict]:
    """Search for litigation, court cases, and legal disputes."""
    results = _serper_search(
        f"{company_name} litigation court case legal dispute India", num
    )
    return _extract_organic(results)


def search_regulatory_filings(company_name: str, num: int = 6) -> List[Dict]:
    """Search MCA filings, RBI notices, SEBI orders."""
    results = _serper_search(
        f"{company_name} MCA filing RBI SEBI regulatory India", num
    )
    return _extract_organic(results)


def search_sector_trends(sector: str, num: int = 6) -> List[Dict]:
    """Search for sector-specific trends and headwinds."""
    results = _serper_search(
        f"{sector} sector India outlook trends challenges 2024 2025", num, "news"
    )
    return _extract_organic(results)


def search_financial_news(company_name: str, num: int = 6) -> List[Dict]:
    """Search for financial performance news, credit ratings, defaults."""
    results = _serper_search(
        f"{company_name} financial performance credit rating NPA default India", num
    )
    return _extract_organic(results)


def run_full_secondary_research(
    company_name: str,
    sector: str = "",
    promoter_name: Optional[str] = None,
) -> Dict[str, List[Dict]]:
    """
    Run comprehensive secondary research across all dimensions.

    Returns a dict keyed by research category, each containing a list
    of search result items with title, snippet, link, source, date.
    """
    research = {}

    research["company_news"] = search_company_news(company_name)
    research["financial_intelligence"] = search_financial_news(company_name)
    research["litigation"] = search_litigation(company_name)
    research["regulatory_filings"] = search_regulatory_filings(company_name)
    research["promoter_background"] = search_promoter_background(
        company_name, promoter_name
    )

    if sector:
        research["sector_trends"] = search_sector_trends(sector)

    return research


def search_custom(query: str, num: int = 10, search_type: str = "search") -> List[Dict]:
    """
    Run a free-form custom web search.

    Args:
        query: Any search query.
        num: Number of results.
        search_type: 'search' or 'news'.

    Returns:
        List of result items.
    """
    results = _serper_search(query, num, search_type)
    return _extract_organic(results)
