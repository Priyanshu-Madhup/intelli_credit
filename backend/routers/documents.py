import os
import shutil
import tempfile
import asyncio

from fastapi import APIRouter, HTTPException, UploadFile, File
from models.schemas import ProcessDocumentResponse
from services.document_processor import process_document

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post("/process", response_model=ProcessDocumentResponse)
async def upload_and_process(file: UploadFile = File(...)):
    """
    Upload a PDF document and run the full processing pipeline.

    - Extracts text
    - Counts tokens
    - Splits into semantic chunks (dynamic via Groq, or simple fallback)
    - Generates embeddings
    - Stores in FAISS index

    Returns chunk count, token count, chunking strategy, and status.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    # Write upload to a temporary file so PyMuPDF can read from a path
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        # Run CPU-heavy processing in a thread so the async event loop isn't blocked
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, process_document, tmp_path)
    finally:
        os.unlink(tmp_path)

    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])

    return result
