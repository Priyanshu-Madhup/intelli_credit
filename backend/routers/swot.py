from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from services.swot_service import run_swot_analysis

router = APIRouter(prefix="/swot", tags=["SWOT"])


class SWOTRequest(BaseModel):
    company_name: str
    sector: str
    web_research: Optional[Dict[str, Any]] = None  # pass result from /research if available


@router.post("/analyse")
def analyse_swot(req: SWOTRequest):
    """
    Generate a comprehensive SWOT analysis for a company.

    Optionally accepts web_research output from POST /research
    to enrich the analysis with secondary intelligence.

    Requires at least one document to be indexed via /documents/process.
    """
    if not req.company_name.strip():
        raise HTTPException(status_code=400, detail="company_name cannot be empty.")
    try:
        return run_swot_analysis(req.company_name, req.sector, req.web_research)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))