const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

/**
 * Upload multiple PDF documents for processing.
 * Calls POST /documents/process for each file sequentially.
 * @param {Object} filesMap - { docId: File }
 * @returns {Promise<Array>} - array of process results
 */
export async function uploadDocuments(filesMap) {
  const results = [];
  for (const [, file] of Object.entries(filesMap)) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE_URL}/documents/process`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Upload failed');
    }
    results.push(await res.json());
  }
  return results;
}

/**
 * Run full AI credit assessment.
 * Calls POST /assess
 * @param {string} companyName
 * @param {string} sector
 * @param {number} requestedLoanCr
 * @returns {Promise<Object>} - credit assessment object
 */
export async function runAssessment(companyName, sector, requestedLoanCr, formData = {}) {
  const res = await fetch(`${BASE_URL}/assess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_name: companyName,
      sector,
      requested_loan_cr: requestedLoanCr,
      ...formData,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Assessment failed');
  }
  return res.json();
}

/**
 * Extract form fields from uploaded/indexed documents via RAG + LLM.
 * Calls POST /assess/extract-form
 * @returns {Promise<Object>} - extracted form field values
 */
export async function extractFormFields() {
  const res = await fetch(`${BASE_URL}/assess/extract-form`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Form extraction failed');
  }
  return res.json();
}

/**
 * Fetch financial chart data from indexed documents.
 * Calls POST /charts/financial
 * @param {string} companyName - optional company name for targeted queries
 * @returns {Promise<Object>} - { yearly_trend, financial_overview, profitability_metrics }
 */
export async function fetchChartData(companyName = '') {
  const res = await fetch(`${BASE_URL}/charts/financial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_name: companyName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Chart data fetch failed');
  }
  return res.json();
}

/**
 * Fetch all document insight categories in one shot.
 * Calls POST /query/doc-insights → single FAISS query + single LLM call.
 * @returns {Promise<Object>} - { insights: [{category, icon, summary, severity}] }
 */
export async function fetchDocInsights() {
  const res = await fetch(`${BASE_URL}/query/doc-insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Doc insights failed');
  }
  return res.json();
}

/**
 * Ask a question about the indexed documents.
 * Calls POST /query
 * @param {string} question
 * @returns {Promise<Object>} - { answer, sources }
 */
export async function queryDocuments(question) {
  const res = await fetch(`${BASE_URL}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, top_k: 5 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Query failed');
  }
  return res.json();
}

/**
 * Run full secondary web research for a company.
 * Calls POST /research/full
 */
export async function runFullResearch(companyName, sector = '', promoterName = '') {
  const res = await fetch(`${BASE_URL}/research/full`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_name: companyName,
      sector,
      promoter_name: promoterName || null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Research failed');
  }
  return res.json();
}

/**
 * Run a custom web search query.
 * Calls POST /research/custom
 */
export async function customWebSearch(query, num = 10, searchType = 'search') {
  const res = await fetch(`${BASE_URL}/research/custom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, num, search_type: searchType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Search failed');
  }
  return res.json();
}

/**
 * Synthesize web research into AI risk insights.
 * Calls POST /research/synthesize
 */
export async function synthesizeResearch(companyName, sector, researchResults) {
  const res = await fetch(`${BASE_URL}/research/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_name: companyName,
      sector,
      research_results: researchResults,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Synthesis failed');
  }
  return res.json();
}

/**
 * Cross-validate GST returns vs bank statement.
 * Calls POST /gst-validate/cross-validate
 * @param {File} gstFile  — GST returns PDF
 * @param {File} bankFile — Bank statement PDF
 * @returns {Promise<Object>} — structured cross-validation analysis
 */
export async function crossValidateGST(gstFile, bankFile) {
  const formData = new FormData();
  formData.append('gst_file', gstFile);
  formData.append('bank_file', bankFile);
  const res = await fetch(`${BASE_URL}/gst-validate/cross-validate`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

/**
 * Generate a Word (.docx) CAM document from the backend.
 * Sends the assessment + company data, receives a binary .docx file.
 * @param {Object} payload — full assessment + company data
 * @returns {Promise<Blob>} — the .docx file as a Blob
 */
export async function generateCAMDocx(payload) {
  const res = await fetch(`${BASE_URL}/cam/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'CAM generation failed');
  }
  return res.blob();
}
