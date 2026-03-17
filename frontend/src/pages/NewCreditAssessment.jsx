import React, { useState, useRef } from 'react';
import {
  Building2, MapPin, Briefcase, Upload, FileText,
  CheckCircle, X, Brain, ChevronRight, AlertCircle, Loader
} from 'lucide-react';
import { uploadDocuments, runAssessment } from '../api';

const sectors = ['Technology', 'Manufacturing', 'Agriculture', 'Pharma', 'Construction', 'Retail', 'Finance', 'Infrastructure', 'Textiles', 'Healthcare'];
const locations = ['Mumbai', 'Delhi', 'Bengaluru', 'Chennai', 'Hyderabad', 'Pune', 'Ahmedabad', 'Kolkata', 'Jaipur', 'Surat'];

const docTypes = [
  { id: 'gst',    label: 'GST Returns',     icon: '📊', desc: 'GST returns for last 3 years',       accept: '.pdf,.xlsx' },
  { id: 'bank',   label: 'Bank Statements', icon: '🏦', desc: 'Bank statements for last 24 months',  accept: '.pdf' },
  { id: 'annual', label: 'Annual Reports',  icon: '📑', desc: 'Audited annual reports (3 years)',     accept: '.pdf' },
  { id: 'rating', label: 'Rating Reports',  icon: '⭐', desc: 'Credit rating agency reports',         accept: '.pdf' },
  { id: 'legal',  label: 'Legal Notices',   icon: '⚖️', desc: 'Any legal notices / court orders',    accept: '.pdf,.docx' },
];

function FileUploadCard({ doc, file, onUpload, onRemove, dragActive, onDragEnter, onDragLeave, onDrop }) {
  const inputRef = useRef(null);

  return (
    <div
      className={`relative border-2 border-dashed rounded-2xl p-5 transition-all duration-200 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 ${
        dragActive ? 'border-blue-500 bg-blue-50 scale-[1.01]' : file ? 'border-green-400 bg-green-50/40' : 'border-slate-200 bg-slate-50/50'
      }`}
      onClick={() => !file && inputRef.current?.click()}
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
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${file ? 'bg-green-100' : dragActive ? 'bg-blue-100' : 'bg-white border border-slate-200'}`}>
          {file ? '✅' : doc.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-slate-800 font-semibold text-sm">{doc.label}</p>
          {file ? (
            <p className="text-green-600 text-xs font-medium mt-0.5 truncate">{file.name}</p>
          ) : (
            <p className="text-slate-400 text-xs mt-0.5">{doc.desc}</p>
          )}
        </div>
        {file ? (
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
          >
            <X size={15} />
          </button>
        ) : (
          <div className="flex-shrink-0 flex items-center gap-1.5 text-xs text-slate-400">
            <Upload size={13} />
            <span>Upload</span>
          </div>
        )}
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
  const [form, setForm] = useState({ name: '', sector: '', location: '', email: '', loan: '' });
  const [files, setFiles] = useState({});
  const [dragActive, setDragActive] = useState(null);
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState({});
  const [runStep, setRunStep] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

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
      let companyName = form.name.trim();

      // Step 1: upload & process documents
      if (Object.keys(files).length > 0) {
        setRunStep('Uploading and processing documents…');
        const uploadResults = await uploadDocuments(files);

        // Auto-detect company name from documents if field is blank
        if (!companyName) {
          const detected = uploadResults.find(r => r.company_name)?.company_name || '';
          if (detected) {
            companyName = detected;
            handleChange('name', detected);
          }
        }
      }

      if (!companyName) {
        setErrors({ name: 'Company name is required — enter it or upload a document so it can be detected.' });
        return;
      }

      // Step 2: run credit assessment
      setRunStep('Running AI credit assessment…');
      const loanCr = parseFloat(form.loan) || 5.0;
      const assessment = await runAssessment(companyName, form.sector, loanCr);
      // Persist for downstream pages
      localStorage.setItem('ic_assessment', JSON.stringify(assessment));
      localStorage.setItem('ic_company', JSON.stringify({ name: companyName, sector: form.sector, location: form.location }));

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
              onUpload={f => setFiles(prev => ({ ...prev, [doc.id]: f }))}
              onRemove={() => setFiles(prev => { const n = { ...prev }; delete n[doc.id]; return n; })}
              dragActive={dragActive === doc.id}
              onDragEnter={() => setDragActive(doc.id)}
              onDragLeave={() => setDragActive(null)}
              onDrop={e => {
                e.preventDefault();
                setDragActive(null);
                const f = e.dataTransfer.files?.[0];
                if (f) setFiles(prev => ({ ...prev, [doc.id]: f }));
              }}
            />
          ))}
        </div>
        {uploadCount === 0 && (
          <div className="mx-6 mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-700">
            <AlertCircle size={14} className="flex-shrink-0" />
            Upload at least one document to run AI analysis. More documents = more accurate results.
          </div>
        )}
      </div>

      {/* Run button */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {uploadCount > 0 ? (
            <span className="flex items-center gap-1 text-green-600 font-medium"><CheckCircle size={13} />{uploadCount} document{uploadCount > 1 ? 's' : ''} ready</span>
          ) : (
            <span>No documents uploaded yet</span>
          )}
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-400 disabled:to-slate-500 text-white px-7 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5 disabled:translate-y-0 disabled:shadow-none"
        >
          {running ? (
            <>
              <Loader size={16} className="animate-spin" />
              Running AI Analysis…
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
