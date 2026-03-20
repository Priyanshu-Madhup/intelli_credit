const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

/**
 * Upload multiple PDF documents for processing.
 * Calls POST /documents/process for each file sequentially.
 * @param {Object} filesMap - { docId: File }
 * @returns {Promise<Array>} - array of process results
 */
export async function uploadDocuments(filesMap) {
  const results = [];
  const entries = Object.entries(filesMap);  // [ ['bank', File], ['annual', File], ... ]

  for (let i = 0; i < entries.length; i++) {
    const [docType, file] = entries[i];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('doc_type', docType);          // e.g. "bank", "gst", "annual"
    formData.append('append', i > 0 ? 'true' : 'false');  // first doc = fresh, rest = append

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
export async function runAssessment(companyName, sector, requestedLoanCr, qualitativeNotes = "") {
  const res = await fetch(`${BASE_URL}/assess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_name: companyName,
      sector,
      requested_loan_cr: requestedLoanCr,
      qualitative_notes: qualitativeNotes,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Assessment failed');
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

// Add this to your api.js file
export const fetchWebResearch = async (companyName, sector) => {
  const response = await fetch('http://localhost:8000/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_name: companyName, sector: sector }),
  });
  if (!response.ok) throw new Error('Web research failed');
  return await response.json();
};

export async function downloadCAM(companyName, sector, requestedLoanCr) {
  const res = await fetch(`${BASE_URL}/cam/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_name: companyName,
      sector: sector,
      requested_loan_cr: requestedLoanCr,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'CAM generation failed');
  }
  // Trigger browser download
  const blob = await res.blob();
  const url  = window.URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `CAM_${companyName.replace(/\s+/g, '_')}.docx`;
  a.click();
  window.URL.revokeObjectURL(url);
}