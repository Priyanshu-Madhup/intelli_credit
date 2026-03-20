from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.research_agent import run_web_research

router = APIRouter(prefix="/research", tags=["Research"])


class ResearchRequest(BaseModel):
    company_name: str
    sector: str


@router.post("")
def research_company(req: ResearchRequest):
    """
    Run web research on a company and return structured intelligence.

    Searches for: promoter news, litigation, financial performance,
    MCA filings, and sector-level regulatory headwinds.

    Returns: summary, risk_flags, positive_signals, sentiment, sources.
    """
    if not req.company_name.strip():
        raise HTTPException(status_code=400, detail="company_name cannot be empty.")
    try:
        return run_web_research(req.company_name, req.sector)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))