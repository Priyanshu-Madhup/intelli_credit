from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.sector_benchmark import run_sector_benchmark

router = APIRouter(prefix="/benchmark", tags=["Benchmark"])


class BenchmarkRequest(BaseModel):
    company_name: str
    sector: str


@router.post("/compare")
def compare_to_sector(req: BenchmarkRequest):
    """
    Compare a company's financial ratios against Indian sector benchmarks.

    Extracts metrics from indexed FAISS documents and compares against
    hardcoded sector medians for: D/E ratio, net margin, current ratio,
    ROE, revenue growth, and interest coverage.

    Requires documents to have been uploaded and indexed first.
    """
    if not req.company_name.strip():
        raise HTTPException(status_code=400, detail="company_name cannot be empty.")
    if not req.sector.strip():
        raise HTTPException(status_code=400, detail="sector cannot be empty.")
    try:
        return run_sector_benchmark(req.company_name, req.sector)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))