import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from routers import documents, query, assess, charts, research, cam
import uvicorn

load_dotenv()

app = FastAPI(
    title="IntelliCredit API",
    description="AI-powered credit appraisal backend",
    version="1.0.0",
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


@app.get("/health", tags=["Health"])
def health_check():
    """Liveness probe endpoint."""
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
