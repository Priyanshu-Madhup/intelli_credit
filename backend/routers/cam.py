from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from services.credit_scorer import run_credit_assessment
from services.cam_generator import generate_cam_docx

router = APIRouter(prefix="/cam", tags=["CAM"])


class CAMRequest(BaseModel):
    company_name: str
    sector: str
    requested_loan_cr: float = 5.0


@router.post("/generate")
def generate_cam(req: CAMRequest):
    """
    Run a full credit assessment and return a downloadable .docx CAM file.

    Steps:
    1. Runs the same credit assessment as /assess
    2. Passes the result into the CAM Word doc generator
    3. Returns the .docx file as a binary download
    """
    if not req.company_name.strip():
        raise HTTPException(status_code=400, detail="company_name cannot be empty.")

    try:
        # Step 1: Get full assessment data (reuses existing credit scorer)
        assessment = run_credit_assessment(
            req.company_name,
            req.sector,
            req.requested_loan_cr,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    try:
        # Step 2: Generate the Word document bytes
        docx_bytes = generate_cam_docx(assessment)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"CAM generation failed: {exc}")

    # Step 3: Return as downloadable file
    filename = f"CAM_{req.company_name.replace(' ', '_')}.docx"
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )