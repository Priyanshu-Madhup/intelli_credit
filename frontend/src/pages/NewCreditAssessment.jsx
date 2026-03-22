import React, { useState, useRef } from 'react';
import {
  Building2, MapPin, Briefcase, Upload, FileText,
  CheckCircle, X, Brain, ChevronRight, AlertCircle, Loader, ClipboardList, Plus, Trash2
} from 'lucide-react';
import { runAssessment } from '../api';

const sectors = ['Technology', 'Manufacturing', 'Agriculture', 'Pharma', 'Construction', 'Retail', 'Finance', 'Infrastructure', 'Textiles', 'Healthcare'];
const locations = ['Mumbai', 'Delhi', 'Bengaluru', 'Chennai', 'Hyderabad', 'Pune', 'Ahmedabad', 'Kolkata', 'Jaipur', 'Surat'];

const docTypes = [
  { id: 'alm',          label: 'ALM (Asset-Liability Management)',       icon: '⚖️', desc: 'Asset-liability management / liquidity statements', accept: '.pdf' },
  { id: 'shareholding', label: 'Shareholding Pattern',                   icon: '📋', desc: 'Shareholding structure and ownership details',        accept: '.pdf' },
  { id: 'borrowing',    label: 'Borrowing Profile',                      icon: '🏦', desc: 'Existing borrowings, lenders and repayment schedule', accept: '.pdf' },
  { id: 'annual',       label: 'Annual Reports (P&L, Cashflow, B/S)',    icon: '📑', desc: 'Audited P&L, cash flow and balance sheet (3 years)',  accept: '.pdf' },
  { id: 'portfolio',    label: 'Portfolio Cuts / Performance Data',      icon: '📊', desc: 'Loan portfolio cuts and performance metrics',          accept: '.pdf,.xlsx' },
];

function FileUploadCard({ doc, file, onUpload, onRemove, dragActive, onDragEnter, onDragLeave, onDrop, isUploading, isProcessed, uploadError }) {
  const inputRef = useRef(null);

  return (
    <div
      className={`relative border-2 border-dashed rounded-2xl p-5 transition-all duration-200 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 ${
        dragActive ? 'border-blue-500 bg-blue-50 scale-[1.01]' : isProcessed ? 'border-green-400 bg-green-50/40' : isUploading ? 'border-blue-300 bg-blue-50/30' : file ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 bg-slate-50/50'
      }`}
      onClick={() => !file && !isUploading && inputRef.current?.click()}
      onDragOver={e => e.preventDefault()}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={doc.accept}
        className="hidden"
        onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])}
      />
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${isProcessed ? 'bg-green-100' : isUploading ? 'bg-blue-100' : file ? 'bg-amber-100' : dragActive ? 'bg-blue-100' : 'bg-white border border-slate-200'}`}>
          {isProcessed ? '✅' : isUploading ? '⏳' : file ? '📄' : doc.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-slate-800 font-semibold text-sm">{doc.label}</p>
          {isUploading ? (
            <p className="text-blue-600 text-xs font-medium mt-0.5 flex items-center gap-1"><Loader size={10} className="animate-spin" /> Processing into vector DB…</p>
          ) : isProcessed ? (
            <p className="text-green-600 text-xs font-medium mt-0.5 truncate">✓ {file.name} — indexed</p>
          ) : file ? (
            <p className="text-amber-600 text-xs font-medium mt-0.5 truncate">{file.name}</p>
          ) : (
            <p className="text-slate-400 text-xs mt-0.5">{doc.desc}</p>
          )}
          {uploadError && <p className="text-red-500 text-xs mt-0.5">{uploadError}</p>}
        </div>
        {file && !isUploading ? (
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
          >
            <X size={15} />
          </button>
        ) : !file ? (
          <div className="flex-shrink-0 flex items-center gap-1.5 text-xs text-slate-400">
            <Upload size={13} />
            <span>Upload</span>
          </div>
        ) : null}
      </div>
      {dragActive && (
        <div className="absolute inset-0 rounded-2xl flex items-center justify-center bg-blue-500/10">
          <p className="text-blue-600 font-semibold text-sm">Drop file here</p>
        </div>
      )}
    </div>
  );
}

export default function NewCreditAssessment({ onNavigate }) {
  const [form, setForm] = useState({ name: '', sector: '', location: '', email: '', loan: '', promoter_name: '', incorporation_year: '', gstin: '', annual_revenue: '', net_profit: '', total_debt: '', employee_count: '' });
  const [files, setFiles] = useState({});
  const [processedFiles, setProcessedFiles] = useState({});  // track which files are processed in vector DB
  const [uploading, setUploading] = useState({});  // per-file upload status
  // pendingClass: { [docId]: { file, detected_type, detected_label, all_types, selectedType } }
  const [pendingClass, setPendingClass] = useState({});
  const [dragActive, setDragActive] = useState(null);
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState({});
  const [runStep, setRunStep] = useState('');
  const [primaryNotes, setPrimaryNotes] = useState([
    { id: 1, type: 'site_visit', text: '' },
  ]);

  const noteTypes = [
    { value: 'site_visit', label: 'Factory/Site Visit Observation' },
    { value: 'management_interview', label: 'Management Interview' },
    { value: 'market_feedback', label: 'Market/Supplier Feedback' },
    { value: 'operational', label: 'Operational Observation' },
    { value: 'other', label: 'Other Due Diligence Note' },
  ];

  const addNote = () => setPrimaryNotes(prev => [...prev, { id: Date.now(), type: 'site_visit', text: '' }]);
  const removeNote = (id) => setPrimaryNotes(prev => prev.filter(n => n.id !== id));
  const updateNote = (id, field, value) => setPrimaryNotes(prev => prev.map(n => n.id === id ? { ...n, [field]: value } : n));

  const handleChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
  };

  const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  // Step 1: classify the file; show confirmation banner before indexing
  const handleFileUpload = async (docId, file) => {
    setFiles(prev => ({ ...prev, [docId]: file }));
    setErrors(prev => { const n = { ...prev }; delete n[`upload_${docId}`]; return n; });
    setPendingClass(prev => { const n = { ...prev }; delete n[docId]; return n; });
    setUploading(prev => ({ ...prev, [docId]: true }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${BASE_URL}/documents/classify`, { method: 'POST', body: fd });
      if (res.ok) {
        const data = await res.json();
        setPendingClass(prev => ({
          ...prev,
          [docId]: { file, ...data, selectedType: data.detected_type },
        }));
      } else {
        // fallback: skip classify, go straight to indexing
        setPendingClass(prev => ({
          ...prev,
          [docId]: { file, detected_type: 'general', detected_label: 'General Document', all_types: [], selectedType: 'general' },
        }));
      }
    } catch (err) {
      setErrors(prev => ({ ...prev, [`upload_${docId}`]: `Classification error: ${err.message}` }));
    } finally {
      setUploading(prev => { const n = { ...prev }; delete n[docId]; return n; });
    }
  };

  // Step 2: user confirmed the doc type — index it
  const confirmAndIndex = async (docId) => {
    const pending = pendingClass[docId];
    if (!pending) return;
    setErrors(prev => { const n = { ...prev }; delete n[`upload_${docId}`]; return n; });
    setUploading(prev => ({ ...prev, [docId]: true }));
    try {
      const fd = new FormData();
      fd.append('file', pending.file);
      fd.append('doc_type', pending.selectedType);
      fd.append('append', 'false');
      const res = await fetch(`${BASE_URL}/documents/process`, { method: 'POST', body: fd });
      if (res.ok) {
        const result = await res.json();
        setProcessedFiles(prev => ({ ...prev, [docId]: result }));
        setPendingClass(prev => { const n = { ...prev }; delete n[docId]; return n; });
      } else {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        setErrors(prev => ({ ...prev, [`upload_${docId}`]: err.detail || 'Indexing failed' }));
      }
    } catch (err) {
      setErrors(prev => ({ ...prev, [`upload_${docId}`]: `Indexing error: ${err.message}` }));
    } finally {
      setUploading(prev => { const n = { ...prev }; delete n[docId]; return n; });
    }
  };

  const handleFileRemove = (docId) => {
    setFiles(prev => { const n = { ...prev }; delete n[docId]; return n; });
    setProcessedFiles(prev => { const n = { ...prev }; delete n[docId]; return n; });
    setPendingClass(prev => { const n = { ...prev }; delete n[docId]; return n; });
    setErrors(prev => { const n = { ...prev }; delete n[`upload_${docId}`]; return n; });
  };



  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Company name is required';
    if (!form.sector) e.sector = 'Please select a sector';
    if (!form.location) e.location = 'Please select a location';
    return e;
  };

  const handleRun = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setRunning(true);
    setErrors({});
    try {
      const companyName = form.name.trim();
      if (!companyName) {
        setErrors({ name: 'Company name is required.' });
        return;
      }

      // Step 2: run credit assessment
      setRunStep('Running AI credit assessment…');
      const loanCr = parseFloat(form.loan) || 5.0;
      // Send all filled form fields so backend can use them as context
      // even when no documents have been uploaded
      const extraFields = {};
      const fieldMap = {
        location: 'location', promoter_name: 'promoter_name',
        incorporation_year: 'incorporation_year', gstin: 'gstin',
        annual_revenue: 'annual_revenue', net_profit: 'net_profit',
        total_debt: 'total_debt', employee_count: 'employee_count',
        email: 'email',
      };
      Object.entries(fieldMap).forEach(([formKey, apiKey]) => {
        if (form[formKey]?.trim()) extraFields[apiKey] = form[formKey].trim();
      });
      const assessment = await runAssessment(companyName, form.sector, loanCr, extraFields);
      // Persist for downstream pages
      localStorage.setItem('ic_assessment', JSON.stringify(assessment));
      localStorage.setItem('ic_company', JSON.stringify({ name: companyName, sector: form.sector, location: form.location }));

      // Persist primary insights for downstream pages (CAM report, research)
      const filledNotes = primaryNotes.filter(n => n.text.trim());
      if (filledNotes.length > 0) {
        localStorage.setItem('ic_primary_notes', JSON.stringify(filledNotes));
      }

      // Append to history for Dashboard tracking
      try {
        const riskScore = assessment.risk_score ?? 0;
        const prev = JSON.parse(localStorage.getItem('ic_history') || '[]');
        prev.unshift({
          name:   companyName,
          sector: form.sector,
          score:  riskScore,
          amount: assessment.recommended_loan_cr != null ? `₹${assessment.recommended_loan_cr} Cr` : '—',
          status: riskScore >= 70 ? 'High Risk' : riskScore >= 40 ? 'Medium Risk' : 'Low Risk',
          date:   new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        });
        localStorage.setItem('ic_history', JSON.stringify(prev.slice(0, 20)));
      } catch (_) {}

      onNavigate('analysis');
    } catch (err) {
      setErrors({ api: err.message || 'Something went wrong. Please try again.' });
    } finally {
      setRunning(false);
      setRunStep('');
    }
  };

  const uploadCount = Object.keys(files).length;
  // eslint-disable-next-line no-unused-vars
  const processedCount = Object.keys(processedFiles).length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">

      {/* Steps indicator */}
      <div className="flex items-center gap-2">
        {['Company Info', 'Upload Docs', 'Run Analysis'].map((step, i) => (
          <React.Fragment key={step}>
            <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full ${i === 0 || (i === 1 && uploadCount > 0) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
              <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-white text-[10px] font-bold">{i + 1}</span>
              {step}
            </div>
            {i < 2 && <ChevronRight size={14} className="text-slate-300" />}
          </React.Fragment>
        ))}
      </div>

      {/* Company info card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <Building2 size={18} className="text-blue-600" />
          </div>
          <div>
            <h3 className="text-slate-900 font-semibold text-sm">Company Information</h3>
            <p className="text-slate-400 text-xs">Basic details about the applicant company</p>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Company Name */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Company Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={e => handleChange('name', e.target.value)}
              placeholder="e.g. Technovate Solutions Pvt Ltd"
              className={`w-full px-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all ${errors.name ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}`}
            />
            {errors.name && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} />{errors.name}</p>}
          </div>

          {/* Sector */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Industry Sector <span className="text-red-500">*</span></label>
            <div className="relative">
              <Briefcase size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={form.sector}
                onChange={e => handleChange('sector', e.target.value)}
                className={`w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none bg-no-repeat ${errors.sector ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}`}
              >
                <option value="">Select sector…</option>
                {sectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {errors.sector && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} />{errors.sector}</p>}
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Registered Location <span className="text-red-500">*</span></label>
            <div className="relative">
              <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={form.location}
                onChange={e => handleChange('location', e.target.value)}
                className={`w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none ${errors.location ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}`}
              >
                <option value="">Select city…</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            {errors.location && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} />{errors.location}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Contact Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => handleChange('email', e.target.value)}
              placeholder="finance@company.com"
              className="w-full px-4 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>

          {/* Loan Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Requested Loan Amount (₹ Cr)</label>
            <input
              type="number"
              value={form.loan}
              onChange={e => handleChange('loan', e.target.value)}
              placeholder="e.g. 5.0"
              className="w-full px-4 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Document upload card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
              <FileText size={18} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="text-slate-900 font-semibold text-sm">Document Upload</h3>
              <p className="text-slate-400 text-xs">Drag & drop or click to upload company documents</p>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${uploadCount > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {uploadCount}/{docTypes.length} uploaded
          </span>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          {docTypes.map(doc => (
            <FileUploadCard
              key={doc.id}
              doc={doc}
              file={files[doc.id]}
              onUpload={f => handleFileUpload(doc.id, f)}
              onRemove={() => handleFileRemove(doc.id)}
              dragActive={dragActive === doc.id}
              onDragEnter={() => setDragActive(doc.id)}
              onDragLeave={() => setDragActive(null)}
              onDrop={e => {
                e.preventDefault();
                setDragActive(null);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFileUpload(doc.id, f);
              }}
              isUploading={!!uploading[doc.id]}
              isProcessed={!!processedFiles[doc.id]}
              uploadError={errors[`upload_${doc.id}`]}
            />
          ))}
        </div>

        {/* Classification confirmation banners */}
        {Object.entries(pendingClass).length > 0 && (
          <div className="px-6 pb-4 space-y-3">
            {Object.entries(pendingClass).map(([docId, cls]) => (
              <div key={docId} className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm">🔍</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-indigo-900 font-semibold text-xs mb-0.5">
                      AI detected: <span className="text-indigo-700">{cls.detected_label}</span>
                    </p>
                    <p className="text-indigo-600 text-xs truncate mb-2">{cls.file.name}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-xs font-medium text-indigo-700 flex-shrink-0">Confirm type:</label>
                      <select
                        value={cls.selectedType}
                        onChange={e => setPendingClass(prev => ({
                          ...prev,
                          [docId]: { ...prev[docId], selectedType: e.target.value },
                        }))}
                        className="text-xs border border-indigo-300 bg-white rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
                      >
                        {(cls.all_types.length > 0 ? cls.all_types : [
                          { value: 'annual', label: 'Annual Report' },
                          { value: 'alm', label: 'ALM / Liquidity Statement' },
                          { value: 'shareholding', label: 'Shareholding Pattern' },
                          { value: 'borrowing', label: 'Borrowing Profile' },
                          { value: 'portfolio', label: 'Loan Portfolio' },
                          { value: 'gst', label: 'GST Returns' },
                          { value: 'bank', label: 'Bank Statement' },
                          { value: 'general', label: 'General Document' },
                        ]).map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => confirmAndIndex(docId)}
                        disabled={!!uploading[docId]}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg transition-all"
                      >
                        {uploading[docId] ? <Loader size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                        {uploading[docId] ? 'Indexing…' : 'Confirm & Index'}
                      </button>
                      <button
                        onClick={() => handleFileRemove(docId)}
                        className="text-xs text-indigo-500 hover:text-red-500 transition-colors px-1"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {uploadCount === 0 && (
          <div className="mx-6 mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-700">
            <AlertCircle size={14} className="flex-shrink-0" />
            Upload at least one document to run AI analysis. More documents = more accurate results.
          </div>
        )}


      </div>

      {/* Additional Details — optional fields */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center">
              <FileText size={18} className="text-slate-500" />
            </div>
            <div>
              <h3 className="text-slate-900 font-semibold text-sm">Additional Details <span className="text-slate-400 font-normal">(optional)</span></h3>
              <p className="text-slate-400 text-xs">Financial and operational details to supplement the AI assessment</p>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Promoter Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Promoter / Director Name</label>
              <input type="text" value={form.promoter_name} onChange={e => handleChange('promoter_name', e.target.value)} placeholder="e.g. Rajesh Kumar" className="w-full px-4 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all" />
            </div>
            {/* Incorporation Year */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Incorporation Year</label>
              <input type="text" value={form.incorporation_year} onChange={e => handleChange('incorporation_year', e.target.value)} placeholder="e.g. 2015" className="w-full px-4 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all" />
            </div>
            {/* GSTIN */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">GSTIN</label>
              <input type="text" value={form.gstin} onChange={e => handleChange('gstin', e.target.value)} placeholder="e.g. 27AABCU9603R1ZM" className="w-full px-4 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all" />
            </div>
            {/* Annual Revenue */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Annual Revenue (₹ Cr)</label>
              <input type="text" value={form.annual_revenue} onChange={e => handleChange('annual_revenue', e.target.value)} placeholder="e.g. 120" className="w-full px-4 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all" />
            </div>
            {/* Net Profit */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Net Profit (₹ Cr)</label>
              <input type="text" value={form.net_profit} onChange={e => handleChange('net_profit', e.target.value)} placeholder="e.g. 8.5" className="w-full px-4 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all" />
            </div>
            {/* Total Debt */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Total Debt (₹ Cr)</label>
              <input type="text" value={form.total_debt} onChange={e => handleChange('total_debt', e.target.value)} placeholder="e.g. 25" className="w-full px-4 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all" />
            </div>
            {/* Employee Count */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Employee Count</label>
              <input type="text" value={form.employee_count} onChange={e => handleChange('employee_count', e.target.value)} placeholder="e.g. 350" className="w-full px-4 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all" />
            </div>
          </div>
        </div>

      {/* Primary Insights — Due Diligence Notes */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <ClipboardList size={18} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="text-slate-900 font-semibold text-sm">Primary Due Diligence Notes</h3>
              <p className="text-slate-400 text-xs">Site visit observations, management interviews & qualitative insights</p>
            </div>
          </div>
          <button
            onClick={addNote}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all"
          >
            <Plus size={12} /> Add Note
          </button>
        </div>
        <div className="p-6 space-y-4">
          {primaryNotes.map((note, idx) => (
            <div key={note.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                  <select
                    value={note.type}
                    onChange={e => updateNote(note.id, 'type', e.target.value)}
                    className="text-xs font-semibold border border-slate-200 bg-white rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                  >
                    {noteTypes.map(nt => <option key={nt.value} value={nt.value}>{nt.label}</option>)}
                  </select>
                </div>
                {primaryNotes.length > 1 && (
                  <button onClick={() => removeNote(note.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <textarea
                value={note.text}
                onChange={e => updateNote(note.id, 'text', e.target.value)}
                placeholder='e.g. "Factory found operating at 40% capacity", "Promoter has diversified into unrelated sectors"'
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 resize-none transition-all"
              />
            </div>
          ))}
          <p className="text-xs text-slate-400">
            These qualitative notes will be factored into the AI risk assessment and included in the CAM report.
          </p>
        </div>
      </div>

      {/* Run button */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {Object.keys(uploading).length > 0 ? (
            <span className="flex items-center gap-1 text-blue-600 font-medium"><Loader size={13} className="animate-spin" />Indexing documents…</span>
          ) : Object.keys(pendingClass).length > 0 ? (
            <span className="flex items-center gap-1 text-indigo-600 font-medium"><AlertCircle size={13} />{Object.keys(pendingClass).length} document{Object.keys(pendingClass).length !== 1 ? 's' : ''} awaiting confirmation</span>
          ) : uploadCount > 0 ? (
            <span className="flex items-center gap-1 text-green-600 font-medium"><CheckCircle size={13} />{Object.keys(processedFiles).length}/{uploadCount} document{uploadCount !== 1 ? 's' : ''} indexed</span>
          ) : (
            <span>No documents uploaded yet</span>
          )}
        </div>
        <button
          onClick={handleRun}
          disabled={running || Object.keys(uploading).length > 0 || Object.keys(pendingClass).length > 0}
          className="flex items-center gap-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-400 disabled:to-slate-500 text-white px-7 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5 disabled:translate-y-0 disabled:shadow-none"
        >
          {running ? (
            <>
              <Loader size={16} className="animate-spin" />
              Running AI Analysis…
            </>
          ) : Object.keys(uploading).length > 0 ? (
            <>
              <Loader size={16} className="animate-spin" />
              Indexing Documents…
            </>
          ) : Object.keys(pendingClass).length > 0 ? (
            <>
              <AlertCircle size={16} />
              Confirm Documents First
            </>
          ) : (
            <>
              <Brain size={16} />
              Run AI Analysis
            </>
          )}
        </button>
      </div>

      {errors.api && (
        <div className="mx-0 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
          <AlertCircle size={14} className="flex-shrink-0" />
          {errors.api}
        </div>
      )}

      {/* Progress overlay */}
      {running && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-80 shadow-2xl text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
              <Brain size={32} className="text-blue-600 animate-pulse" />
            </div>
            <h3 className="text-slate-900 font-bold text-base mb-1">AI Analysis Running</h3>
            <p className="text-slate-500 text-xs mb-5">{runStep || 'Processing documents and extracting insights…'}</p>
            <div className="mt-5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full animate-pulse" style={{ width: '75%' }}></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
