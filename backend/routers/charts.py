from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.chart_service import fetch_chart_data

router = APIRouter(prefix="/charts", tags=["Charts"])


class ChartRequest(BaseModel):
    company_name: str = ""


@router.post("/financial")
def get_financial_charts(req: ChartRequest):
    """
    Extract financial chart data from indexed documents.

    Queries the FAISS vector index for financial time-series content and returns
    chart-ready structures: yearly_trend, financial_overview, profitability_metrics.
    Returns empty structures when no documents are indexed.
    """
    try:
        return fetch_chart_data(req.company_name)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
