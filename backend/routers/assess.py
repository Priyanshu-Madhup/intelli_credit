from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.credit_scorer import run_credit_assessment

router = APIRouter(prefix="/assess", tags=["Assessment"])


class AssessRequest(BaseModel):
    company_name: str
    sector: str
    requested_loan_cr: float = 5.0


@router.post("")
def assess_credit(req: AssessRequest):
    """
    Run a full AI credit assessment for a company.

    Retrieves relevant context from the indexed FAISS store and asks Groq
    to produce a structured credit decision including risk score, loan
    recommendation, score breakdown, conditions, and risk alerts.
    """
    try:
        return run_credit_assessment(req.company_name, req.sector, req.requested_loan_cr)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
