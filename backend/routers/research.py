"""
Research router — web-scale secondary research via Serper + AI synthesis.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict
import json
import os

from services.web_search_service import (
    run_full_secondary_research,
    search_custom,
)
from services.groq_retry import groq_chat_with_retry
from services.document_processor import GROQ_API_KEY, GROQ_MODEL, estimate_tokens

from groq import Groq
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/research", tags=["Research"])


class FullResearchRequest(BaseModel):
    company_name: str
    sector: str = ""
    promoter_name: Optional[str] = None


class CustomSearchRequest(BaseModel):
    query: str
    num: int = 10
    search_type: str = "search"  # "search" or "news"


class SynthesizeRequest(BaseModel):
    company_name: str
    sector: str = ""
    research_results: Dict[str, List[Dict]]


@router.post("/full")
def full_research(req: FullResearchRequest):
    """
    Run comprehensive secondary research for a company across all dimensions:
    company news, financial intelligence, litigation, regulatory filings,
    promoter background, and sector trends.
    """
    try:
        results = run_full_secondary_research(
            req.company_name, req.sector, req.promoter_name
        )
        return {"company_name": req.company_name, "results": results}
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/custom")
def custom_search(req: CustomSearchRequest):
    """Run a free-form web search query."""
    try:
        results = search_custom(req.query, req.num, req.search_type)
        return {"query": req.query, "results": results}
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/synthesize")
def synthesize_research(req: SynthesizeRequest):
    """
    Use Groq LLM to synthesize web research results into structured
    risk insights with severity ratings and actionable summaries.
    """
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not set")

    # Flatten all research into a compact text block for the LLM
    # Token-aware: cap context at ~3500 tokens (leaves ~1000 for prompt + 2000 for response)
    CONTEXT_BUDGET = 3500
    context_parts = []
    budget_used = 0
    for category, items in req.research_results.items():
        for item in items[:6]:  # limit per category
            line = f"[{category}] {item.get('title', '')} — {item.get('snippet', '')}"
            line_tokens = estimate_tokens(line)
            if budget_used + line_tokens > CONTEXT_BUDGET:
                break
            context_parts.append(line)
            budget_used += line_tokens
        if budget_used >= CONTEXT_BUDGET:
            break

    context = "\n".join(context_parts)

    prompt = (
        f"You are a senior credit analyst performing secondary research on "
        f"'{req.company_name}' (sector: {req.sector}).\n\n"
        f"Below are web search results gathered from news, regulatory filings, "
        f"litigation databases, and sector reports:\n\n"
        f"{context}\n\n"
        f"Produce a JSON array of risk insights. Each insight must have:\n"
        f'- "category": one of "Company News", "Financial", "Litigation", "Regulatory", "Promoter", "Sector"\n'
        f'- "severity": "High", "Medium", or "Low"\n'
        f'- "title": concise headline (max 15 words)\n'
        f'- "summary": 2-3 sentence analysis of the finding and its credit implications\n'
        f'- "source": the most relevant source name from the results\n\n'
        f"Return 6-12 insights covering all categories where data exists. "
        f"Focus on credit-relevant findings: defaults, litigation, regulatory action, "
        f"sector headwinds, promoter issues, financial distress signals.\n\n"
        f"Return ONLY a valid JSON array. No markdown, no code fences."
    )

    client = Groq(api_key=GROQ_API_KEY)
    try:
        response = groq_chat_with_retry(
            client,
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=2000,
        )
        raw = response.choices[0].message.content.strip()
        # Strip code fences if present
        if raw.startswith("```"):
            import re
            raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw.strip())
        insights = json.loads(raw)
        return {"company_name": req.company_name, "insights": insights}
    except json.JSONDecodeError:
        return {"company_name": req.company_name, "insights": [], "error": "Failed to parse AI synthesis"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
