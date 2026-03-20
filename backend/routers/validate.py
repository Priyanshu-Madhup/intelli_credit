from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.gst_validator import run_gst_validation

router = APIRouter(prefix="/validate", tags=["Validation"])


class ValidationRequest(BaseModel):
    company_name: str = ""


@router.post("/gst")
def validate_gst(req: ValidationRequest):
    """
    Cross-validate GST returns against bank statement data.

    Requires both 'gst' and 'bank' document types to have been uploaded
    and indexed via /documents/process before calling this endpoint.

    Returns:
        overall_risk, summary, discrepancy analysis, flags, positive indicators.
    """
    try:
        return run_gst_validation(req.company_name)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))