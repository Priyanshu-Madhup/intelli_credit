# IntelliCredit — AI-Powered Corporate Credit Appraisal Engine

> Built for the **"Intelli-Credit" Hackathon Challenge**
> Theme: *Next-Gen Corporate Credit Appraisal: Bridging the Intelligence Gap*

---

## Problem Statement

Indian corporate lending faces a **Data Paradox** — more information than ever, yet credit managers take weeks to process a single loan application. Assessing the creditworthiness of a mid-sized Indian corporate means stitching together:

| Data Type | Examples |
|---|---|
| **Structured** | GST filings, ITRs, Bank Statements |
| **Unstructured** | Annual Reports, Board minutes, Rating agency reports, Shareholding patterns |
| **External Intelligence** | Sector news, MCA filings, e-Courts litigation data |
| **Primary Insights** | Factory site visits, Management interviews (Due Diligence) |

The current manual process is **slow, prone to human bias, and misses early warning signals** buried in unstructured text.

---

## Solution: IntelliCredit

An end-to-end AI Credit Decisioning Engine that automates the preparation of a **Comprehensive Credit Appraisal Memo (CAM)** across three pillars:

### 1. Data Ingestor — Multi-Format Document Pipeline
- **Unstructured Parsing**: Extracts key financial commitments and risks from PDF annual reports, legal notices, and sanction letters using PyMuPDF + LLaMA 3.3 (Groq)
- **Dynamic Semantic Chunking**: LLM-driven section identification (not fixed-size splits) for meaningful financial context
- **Embedding & Vector Storage**: SentenceTransformers (`all-MiniLM-L6-v2`) + FAISS for fast semantic retrieval
- **Structured Cross-Validation**: GST returns vs. bank statements reconciliation to flag circular trading or revenue inflation

### 2. Research Agent — The Digital Credit Manager
- **RAG Pipeline**: Retrieves relevant document context and grounds Groq LLM answers in actual uploaded financials
- **Primary Insight Portal**: Credit officers can input qualitative observations (e.g., *"Factory found operating at 40% capacity"*) — the AI adjusts risk scores accordingly
- **Risk Alert Generation**: Automatically surfaces litigation risk, GST mismatches, sector headwinds, and delayed filings

### 3. Recommendation Engine — CAM Generator
- **Structured Credit Decision**: Produces risk score (0–100), loan recommendation, interest rate, tenor, and loan conditions
- **Score Breakdown**: Transparent scoring across five dimensions — Financial Health, Repayment History, Collateral Coverage, Management Quality, Market Position
- **Explainable AI**: Full reasoning narrative explaining *why* a specific limit or rejection was recommended
- **Indian Context Sensitivity**: Understands GSTR-2A vs 3B, CIBIL Commercial reports, RBI norms, and MCA filings

---

## Tech Stack

### Frontend
- **React 19** + Tailwind CSS
- Recharts for financial visualizations
- Lucide React icons

### Backend
- **FastAPI** (Python)
- **Groq API** — LLaMA 3.3-70b-Versatile for dynamic chunking, RAG answering, and credit scoring
- **PyMuPDF** — PDF text extraction
- **SentenceTransformers** — `all-MiniLM-L6-v2` embeddings
- **FAISS** — Vector similarity search
- **tiktoken** — Token counting (LLaMA-compatible)

---

## Project Structure

```
intelli_credit/
├── frontend/               # React application
│   ├── src/
│   │   ├── api.js          # API client (upload, assess, query)
│   │   ├── pages/
│   │   │   ├── NewCreditAssessment.jsx   # Upload docs + trigger pipeline
│   │   │   ├── AIAnalysis.jsx            # Financial analysis + risk gauge
│   │   │   ├── CreditRecommendation.jsx  # Final credit decision
│   │   │   ├── CAMReport.jsx             # Credit Appraisal Memo
│   │   │   ├── ResearchInsights.jsx      # Secondary research panel
│   │   │   └── Dashboard.jsx             # Overview dashboard
│   │   └── components/
│   │       ├── Sidebar.jsx
│   │       └── TopNav.jsx
│   └── package.json
│
└── backend/                # FastAPI application
    ├── main.py             # App entry point + CORS
    ├── requirements.txt
    ├── .env                # API keys & config (not committed)
    ├── routers/
    │   ├── documents.py    # POST /documents/process
    │   ├── query.py        # POST /query
    │   └── assess.py       # POST /assess
    └── services/
        ├── document_processor.py  # Extract → Chunk → Embed → FAISS
        ├── rag_service.py         # Retrieve → Answer via Groq
        └── credit_scorer.py      # Full structured credit assessment
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/documents/process` | Upload a PDF and run the full ingestion pipeline |
| `POST` | `/query` | Ask a natural-language question about the indexed document |
| `POST` | `/assess` | Run a full AI credit assessment for a company |
| `GET`  | `/health` | Liveness probe |

---

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- A [Groq API key](https://console.groq.com)

### Backend

```bash
cd backend
pip install -r requirements.txt
# Set your GROQ_API_KEY in .env
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm start
```

The app runs at `http://localhost:3000` and connects to the backend at `http://localhost:8000`.

---

## Evaluation Alignment

| Criterion | How IntelliCredit addresses it |
|---|---|
| **Extraction Accuracy** | PyMuPDF + LLM-driven semantic chunking preserves financial context from messy Indian PDFs |
| **Research Depth** | RAG pipeline retrieves grounded evidence; alerts surface litigation, GST mismatches, and sector trends |
| **Explainability** | Every decision includes a full reasoning narrative and weighted score breakdown — no black box |
| **Indian Context Sensitivity** | Prompts explicitly reference GSTR-2A/3B, CIBIL, MCA filings, RBI norms, and Indian rupee denominators |

---

## Built for

**IIT Hyderabad Hackathon — Intelli-Credit Challenge**
