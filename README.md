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
├── screenshots/            # UI screenshots for README
├── frontend/               # React application
│   ├── src/
│   │   ├── api.js          # API client (upload, assess, query, charts)
│   │   ├── pages/
│   │   │   ├── NewCreditAssessment.jsx   # Upload docs + trigger pipeline
│   │   │   ├── AIAnalysis.jsx            # Financial analysis + risk gauge
│   │   │   ├── CreditRecommendation.jsx  # Final credit decision + RadarChart
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
    │   ├── assess.py       # POST /assess
    │   └── charts.py       # POST /charts/financial
    └── services/
        ├── document_processor.py  # Extract → Chunk → Embed → FAISS
        ├── rag_service.py         # Retrieve → Answer via Groq + get_all_chunks
        ├── credit_scorer.py       # Full structured credit assessment
        └── chart_service.py       # Financial chart data extraction
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/documents/process` | Upload a PDF and run the full ingestion pipeline |
| `POST` | `/query` | Ask a natural-language question about the indexed document |
| `POST` | `/assess` | Run a full AI credit assessment for a company |
| `POST` | `/charts/financial` | Extract financial chart data (revenue, profit, debt trends) |
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

## Screenshots

> Add your screenshots to the `screenshots/` folder and they will render here.

### Dashboard
![Dashboard](screenshots/dashboard.png)
The main overview screen showing **Credit Score History** (bar chart of the last 8 assessments color-coded by risk level), **Risk Distribution** (pie chart dynamically computed from past assessments — Low / Medium / High), portfolio summary cards (Total Portfolio, Avg Risk Score, High Risk Count, Pending Reviews), and a live table of recently assessed companies.

---

### New Credit Assessment
![New Credit Assessment](screenshots/new_assessment.png)
The intake form where a credit analyst uploads financial documents (PDF / DOCX) for a company. Supports drag-and-drop upload, auto-detects the company name from the document, shows an upload progress bar, and triggers the full backend pipeline (text extraction → semantic chunking → FAISS indexing → AI credit scoring) on submission.

---

### AI Analysis
![AI Analysis](screenshots/ai_analysis.png)
Deep-dive financial intelligence screen with:
- **Financial Overview cards** — Annual Revenue, Net Profit, Total Debt, GST Turnover (pulled from the uploaded document via the `/charts/financial` endpoint)
- **Yearly Financial Trend** — grouped bar chart showing Revenue, Profit, and Debt (₹ Cr) across fiscal years
- **Risk Score Gauge** — custom semi-circle gauge showing the composite AI risk score (0–100) with Low / Medium / High bands
- **Risk Alerts** — auto-generated cards highlighting High Debt Ratio, Market Risk, payment history concerns, and sector headwinds
- **Profitability KPI cards** — Gross Margin, Net Margin, ROE, Current Ratio, Debt/Equity, Interest Coverage with health indicators
- **"Fetch from Docs"** button to re-query the vector database for the latest extracted financials

---

### Credit Recommendation
![Credit Recommendation](screenshots/credit_recommendation.png)
The final credit decision screen showing:
- **Recommendation badge** — Approve / Conditional Approval / Reject with recommended loan amount and interest rate
- **Score Breakdown RadarChart** — pentagon radar across Financial Health, Repayment History, Collateral, Management Quality, and Market Position
- **Weighted score bars** for each dimension with percentage contribution
- **AI Reasoning narrative** — plain-English explanation of why the decision was reached
- **Loan conditions** — specific covenants and monitoring requirements attached to the sanction

---

### CAM Report
![CAM Report](screenshots/cam_report.png)
The full **Comprehensive Credit Appraisal Memo** generated by the AI, broken into expandable accordion sections:
- Executive Summary (company profile, promoter background, loan purpose)
- Financial Analysis (trend analysis, ratio analysis, DER, DSCR)
- Risk Assessment (industry risk, management risk, financial risk, mitigation factors)
- Credit Decision (recommendation, loan structure, collateral, conditions precedent)
- Compliance & Due Diligence checklist

---

### Research Insights
![Research Insights](screenshots/research_insights.png)
The RAG-powered research panel where analysts can **ask natural-language questions** about the uploaded document (e.g. *"What is the company's current ratio?"* or *"Are there any pending litigation risks?"*). Returns grounded answers with evidence from the indexed document chunks. Also allows entry of **primary qualitative observations** (e.g. factory visit notes) that the AI factors into the risk score.

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
