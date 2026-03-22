import os
import shutil
import tempfile
import asyncio
import functools

import fitz  # PyMuPDF
from fastapi import APIRouter, Form, HTTPException, UploadFile, File
from groq import Groq

from models.schemas import ProcessDocumentResponse
from services.document_processor import process_document, GROQ_API_KEY, GROQ_MODEL

router = APIRouter(prefix="/documents", tags=["Documents"])

DOC_TYPE_OPTIONS = [
    {"value": "annual",        "label": "Annual Report"},
    {"value": "alm",           "label": "ALM / Liquidity Statement"},
    {"value": "shareholding",  "label": "Shareholding Pattern"},
    {"value": "borrowing",     "label": "Borrowing Profile"},
    {"value": "portfolio",     "label": "Loan Portfolio"},
    {"value": "gst",           "label": "GST Returns"},
    {"value": "bank",          "label": "Bank Statement"},
    {"value": "general",       "label": "General Document"},
]

_DOC_VALUES = [d["value"] for d in DOC_TYPE_OPTIONS]


def _auto_classify(text_sample: str) -> str:
    """Use Groq LLM to classify a document from a short text excerpt."""
    values_str = ", ".join(_DOC_VALUES)
    prompt = (
        f"You are a financial document classifier. Given the text excerpt below, "
        f"respond with exactly ONE word from this list: {values_str}.\n\n"
        f"Text excerpt:\n{text_sample[:1500]}\n\nDocument type:"
    )
    try:
        client = Groq(api_key=GROQ_API_KEY)
        resp = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=20,
            temperature=0,
        )
        raw = resp.choices[0].message.content.strip().lower().split()[0]
        return raw if raw in _DOC_VALUES else "general"
    except Exception:
        return "general"


@router.post("/classify")
async def classify_document(file: UploadFile = File(...)):
    """
    Extract text from the uploaded PDF and classify its document type using the
    LLM. Returns the detected type and all available options — does NOT index
    the document yet.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        doc = fitz.open(tmp_path)
        text_sample = ""
        for page in doc:
            text_sample += page.get_text()
            if len(text_sample) >= 1500:
                break
        doc.close()
    finally:
        os.unlink(tmp_path)

    loop = asyncio.get_running_loop()
    detected_type = await loop.run_in_executor(None, _auto_classify, text_sample)

    detected_label = next(
        (d["label"] for d in DOC_TYPE_OPTIONS if d["value"] == detected_type),
        "General Document",
    )

    return {
        "filename": file.filename,
        "detected_type": detected_type,
        "detected_label": detected_label,
        "all_types": DOC_TYPE_OPTIONS,
    }


@router.post("/process", response_model=ProcessDocumentResponse)
async def upload_and_process(
    file: UploadFile = File(...),
    doc_type: str = Form("general"),
    append: bool = Form(False),
):
    """
    Upload a PDF document and run the full processing pipeline.

    - Extracts text
    - Counts tokens
    - Splits into semantic chunks (dynamic via Groq, or simple fallback)
    - Generates embeddings
    - Stores in FAISS index (append or replace based on `append` flag)

    Returns chunk count, token count, chunking strategy, and status.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    if doc_type not in _DOC_VALUES:
        doc_type = "general"

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        loop = asyncio.get_running_loop()
        fn = functools.partial(process_document, tmp_path, doc_type=doc_type, append=append)
        result = await loop.run_in_executor(None, fn)
    finally:
        os.unlink(tmp_path)

    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])

    return result
