import os
import shutil
import tempfile

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from models.schemas import ProcessDocumentResponse
from services.document_processor import process_document, extract_text_from_pdf, GROQ_API_KEY, GROQ_MODEL
from groq import Groq

router = APIRouter(prefix="/documents", tags=["Documents"])

DOC_TYPE_OPTIONS = ['annual', 'alm', 'shareholding', 'borrowing', 'portfolio', 'gst', 'bank', 'general']


def _auto_classify(text_sample: str) -> str:
    """
    Use Groq to auto-detect what type of financial document this is.
    Returns one of the DOC_TYPE_OPTIONS strings.
    """
    if not GROQ_API_KEY:
        return "general"

    prompt = (
        "You are a financial document classifier. Based on the document excerpt below, "
        "identify what type of financial document this is.\n\n"
        "Return ONLY one of these exact labels — nothing else:\n"
        "- annual        (Annual report, P&L, Balance Sheet, Cash Flow statement)\n"
        "- alm           (Asset-Liability Management report)\n"
        "- shareholding  (Shareholding pattern, equity structure)\n"
        "- borrowing     (Borrowing profile, loan schedule, debt summary)\n"
        "- portfolio     (Portfolio performance, portfolio cuts, AUM data)\n"
        "- gst           (GST returns, GSTR filings, tax returns)\n"
        "- bank          (Bank statement, account statement, transaction history)\n"
        "- general       (None of the above)\n\n"
        f"Document excerpt (first 1500 chars):\n{text_sample[:1500]}"
    )

    try:
        client = Groq(api_key=GROQ_API_KEY)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=20,
        )
        result = response.choices[0].message.content.strip().lower()
        # Validate — must be one of the known types
        return result if result in DOC_TYPE_OPTIONS else "general"
    except Exception:
        return "general"


@router.post("/classify")
async def classify_document(file: UploadFile = File(...)):
    """
    Step 1 of human-in-the-loop: upload a file, get back the auto-detected
    document type WITHOUT indexing it yet.

    The frontend shows this to the user for confirmation/correction,
    then calls /process with the confirmed type.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        text = extract_text_from_pdf(tmp_path)
        detected_type = _auto_classify(text)
    except Exception as e:
        detected_type = "general"
    finally:
        os.unlink(tmp_path)

    # Human-readable label for display
    labels = {
        'annual':       'Annual Report',
        'alm':          'ALM Report',
        'shareholding': 'Shareholding Pattern',
        'borrowing':    'Borrowing Profile',
        'portfolio':    'Portfolio Performance',
        'gst':          'GST Returns',
        'bank':         'Bank Statement',
        'general':      'General Document',
    }

    return {
        "filename":       file.filename,
        "detected_type":  detected_type,
        "detected_label": labels.get(detected_type, "General Document"),
        "all_types": [
            {"value": k, "label": v} for k, v in labels.items()
        ],
    }


@router.post("/process", response_model=ProcessDocumentResponse)
async def upload_and_process(
    file: UploadFile = File(...),
    doc_type: str = Form("general"),
    append: bool = Form(False),
):
    """
    Step 2 of human-in-the-loop: process and index the document
    with the user-confirmed doc_type.

    - doc_type: confirmed type from user (after classify step)
    - append: True = merge into existing FAISS index
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