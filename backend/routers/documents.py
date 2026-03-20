import os
import shutil
import tempfile

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from models.schemas import ProcessDocumentResponse
from services.document_processor import process_document

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post("/process", response_model=ProcessDocumentResponse)
async def upload_and_process(
    file: UploadFile = File(...),
    doc_type: str = Form("general"),   # e.g. "bank", "gst", "annual", "rating", "legal"
    append: bool = Form(False),        # True = merge into existing index
):
    """
    Upload a PDF document and run the full processing pipeline.

    - doc_type: Type of document being uploaded (bank, gst, annual, rating, legal, general)
    - append: If True, merges new document into existing FAISS index instead of replacing it.
              Set to True for the 2nd, 3rd, etc. document in a multi-doc upload session.

    Returns chunk count, token count, chunking strategy, and status.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        result = process_document(tmp_path, doc_type=doc_type, append=append)
    finally:
        os.unlink(tmp_path)

    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])

    return result