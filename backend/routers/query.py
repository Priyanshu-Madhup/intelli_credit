from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from services.rag_service import answer_query, answer_query_stream
from services.document_processor import GROQ_API_KEY, GROQ_MODEL, truncate_chunks_by_tokens
from services.groq_retry import groq_chat_with_retry
from groq import Groq
import json, re

router = APIRouter(prefix="/query", tags=["Query"])


class QueryRequest(BaseModel):
    question: str
    top_k: int = 5


@router.post("")
def query_documents(req: QueryRequest):
    """Ask a natural-language question about the indexed document."""
    try:
        return answer_query(req.question, req.top_k)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/stream")
def query_documents_stream(req: QueryRequest):
    """Streaming SSE version for progressive token rendering."""
    return StreamingResponse(
        answer_query_stream(req.question, req.top_k),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/doc-insights")
def doc_insights():
    """
    Return all document insight categories in one shot.
    Single FAISS query (free) + single LLM call → [{category, title, summary, icon}]
    """
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not set")

    from services.rag_service import retrieve_chunks

    chunks = retrieve_chunks(
        "revenue profit GST tax compliance litigation court NPA default "
        "loan repayment business risk collateral asset debt equity",
        top_k=12,
    )
    if not chunks:
        raise HTTPException(status_code=404, detail="No documents indexed yet.")

    trimmed = truncate_chunks_by_tokens(chunks, max_tokens=1200)
    context = "\n\n".join(
        f"[{c.get('section','Doc')}]\n{c['content']}" for c in trimmed
    )

    schema = """Return ONLY a valid JSON array — no markdown, no code fences.
Each object: {"category": "<name>", "icon": "<emoji>", "summary": "<2-3 sentence finding>", "severity": "<High|Medium|Low>"}
Categories to cover (one object each):
1. Financial — revenue, profit, margins
2. Regulatory — GST, tax compliance, violations
3. Legal — litigation, court notices, disputes
4. Credit History — NPA, defaults, loan repayment
5. Risk — business risks, market challenges
6. Collateral — assets, security offered"""

    prompt = (
        "You are a credit analyst extracting key insights from company documents.\n"
        "Read the excerpts below and produce one finding per category.\n"
        "If a category has no relevant data in the excerpts, set severity to Low and note it is not mentioned.\n\n"
        f"Document excerpts:\n{context}\n\n{schema}"
    )

    client = Groq(api_key=GROQ_API_KEY)
    try:
        response = groq_chat_with_retry(
            client,
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=800,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw.strip())
        insights = json.loads(raw)
        return {"insights": insights}
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned invalid JSON")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
