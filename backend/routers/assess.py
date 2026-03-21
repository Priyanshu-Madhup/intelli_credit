from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.credit_scorer import run_credit_assessment
from services.rag_service import retrieve_chunks
from services.groq_retry import groq_chat_with_retry
from services.document_processor import (
    GROQ_API_KEY, GROQ_MODEL, estimate_tokens, truncate_chunks_by_tokens,
)
from groq import Groq
import json, re

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


# ---------------------------------------------------------------------------
# Extract form fields from uploaded documents via RAG + LLM
# ---------------------------------------------------------------------------

_EXTRACT_QUERIES = [
    "company name organization entity borrower applicant",
    "industry sector business type manufacturing services",
    "registered office address city location headquarters",
    "loan amount credit facility requested sanctioned",
    "promoter director management board members",
    "contact email phone number correspondence",
    "annual revenue turnover sales income profit",
    "GST registration GSTIN number",
]

_FORM_SCHEMA = """{
  "company_name":     "<exact company name from documents or null>",
  "sector":           "<one of: Technology, Manufacturing, Agriculture, Pharma, Construction, Retail, Finance, Infrastructure, Textiles, Healthcare — or null>",
  "location":         "<one of: Mumbai, Delhi, Bengaluru, Chennai, Hyderabad, Pune, Ahmedabad, Kolkata, Jaipur, Surat — or null>",
  "email":            "<contact email found in documents or null>",
  "requested_loan_cr":"<loan amount in Crore as a number, e.g. 5.0 — or null>",
  "promoter_name":    "<lead promoter / director name or null>",
  "incorporation_year":"<year of incorporation or null>",
  "gstin":            "<GSTIN number or null>",
  "annual_revenue":   "<latest annual revenue string e.g. '48.2 Cr' or null>",
  "net_profit":       "<latest net profit string or null>",
  "total_debt":       "<total debt / borrowings string or null>",
  "employee_count":   "<number of employees or null>"
}"""


class ExtractFormResponse(BaseModel):
    company_name: Optional[str] = None
    sector: Optional[str] = None
    location: Optional[str] = None
    email: Optional[str] = None
    requested_loan_cr: Optional[float] = None
    promoter_name: Optional[str] = None
    incorporation_year: Optional[str] = None
    gstin: Optional[str] = None
    annual_revenue: Optional[str] = None
    net_profit: Optional[str] = None
    total_debt: Optional[str] = None
    employee_count: Optional[str] = None


@router.post("/extract-form", response_model=ExtractFormResponse)
def extract_form_fields():
    """
    Extract all credit-assessment form fields from the indexed documents.
    Single FAISS query (no LLM cost) + single LLM call.
    """
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not set")

    # One broad query covers all form fields — FAISS is free (no API cost)
    context_parts = retrieve_chunks(
        "company name sector location promoter director revenue profit debt "
        "GST GSTIN email phone loan amount employees incorporation year",
        top_k=10,
    )

    if not context_parts:
        raise HTTPException(
            status_code=404,
            detail="No documents indexed yet. Upload and process documents first.",
        )

    # Budget 800 tokens — FAISS already ranked the most relevant chunks first
    trimmed = truncate_chunks_by_tokens(context_parts, max_tokens=800)
    context = "\n\n".join(
        f"[{c.get('section', 'Doc')}]\n{c['content']}" for c in trimmed
    )

    prompt = (
        "You are a data extraction assistant for a credit appraisal system.\n"
        "Read the document excerpts below and extract the requested fields.\n"
        "Return ONLY valid JSON — no markdown, no code fences, no extra text.\n"
        "If a field is not found in the documents, set it to null.\n"
        "For sector and location, pick the CLOSEST match from the allowed list.\n\n"
        f"Document excerpts:\n{context}\n\n"
        f"Extract into this schema:\n{_FORM_SCHEMA}"
    )

    client = Groq(api_key=GROQ_API_KEY)
    try:
        response = groq_chat_with_retry(
            client,
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.05,
            max_tokens=600,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw.strip())
        data = json.loads(raw)
        # Coerce numeric values to strings for string-typed fields
        _str_fields = {'incorporation_year', 'gstin', 'annual_revenue', 'net_profit',
                        'total_debt', 'employee_count', 'company_name', 'sector',
                        'location', 'email', 'promoter_name'}
        for k in list(data.keys()):
            if k in _str_fields and data[k] is not None and not isinstance(data[k], str):
                data[k] = str(data[k])
        return ExtractFormResponse(**{k: v for k, v in data.items() if v is not None})
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI extraction returned invalid JSON")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
