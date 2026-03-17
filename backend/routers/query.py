from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.rag_service import answer_query

router = APIRouter(prefix="/query", tags=["Query"])


class QueryRequest(BaseModel):
    question: str
    top_k: int = 5


@router.post("")
def query_documents(req: QueryRequest):
    """
    Ask a natural-language question about the indexed financial document.
    Returns a grounded answer and the source chunks used as context.
    """
    try:
        return answer_query(req.question, req.top_k)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
