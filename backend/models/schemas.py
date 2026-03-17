from pydantic import BaseModel
from typing import Optional


class ProcessDocumentResponse(BaseModel):
    """Response schema for the document processing endpoint."""

    num_chunks: int
    token_count: int
    chunking_strategy: Optional[str]
    status: str
    message: str
    company_name: Optional[str] = None
