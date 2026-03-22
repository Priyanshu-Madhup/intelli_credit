import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from routers import documents, query, assess, charts, research, cam, gst_validate, swot

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-load the embedding model at startup so first request is fast
    from services.document_processor import _get_embedding_model
    _get_embedding_model()
    yield


app = FastAPI(
    title="IntelliCredit API",
    description="AI-powered credit appraisal backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(query.router)
app.include_router(assess.router)
app.include_router(charts.router)
app.include_router(research.router)
app.include_router(cam.router)
app.include_router(gst_validate.router)
app.include_router(swot.router)


@app.get("/health", tags=["Health"])
def health_check():
    """Liveness probe endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
