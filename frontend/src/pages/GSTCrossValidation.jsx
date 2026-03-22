import React, { useState, useRef, useCallback } from 'react';
import {
  ShieldAlert, X, CheckCircle, AlertTriangle,
  Loader, FileText, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronUp, Info
} from 'lucide-react';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const severityStyle = {
  high:   { badge: 'bg-red-100 text-red-700 border border-red-200',   dot: 'bg-red-500'   },
  medium: { badge: 'bg-amber-100 text-amber-700 border border-amber-200', dot: 'bg-amber-500' },
  low:    { badge: 'bg-blue-100 text-blue-700 border border-blue-200',  dot: 'bg-blue-500'  },
};

const verdictConfig = {
  clean:     { bg: 'bg-green-50 border-green-300',  text: 'text-green-800',  icon: CheckCircle,     label: 'Clean',      badge: 'bg-green-100 text-green-700' },
  suspicious:{ bg: 'bg-amber-50 border-amber-300',  text: 'text-amber-800',  icon: AlertTriangle,   label: 'Suspicious', badge: 'bg-amber-100 text-amber-700' },
  high_risk: { bg: 'bg-red-50 border-red-300',      text: 'text-red-800',    icon: ShieldAlert,     label: 'High Risk',  badge: 'bg-red-100 text-red-700'   },
};

const riskTypeLabel = {
  revenue_inflation: 'Revenue Inflation',
  circular_trading:  'Circular Trading',
  cash_suppression:  'Cash Suppression',
  gst_evasion:       'GST Evasion',
  benign_mismatch:   'Benign Mismatch',
  other:             'Other',
};

function DropZone({ label, icon, accept, file, onFile, onRemove, isLoading }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div
      className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer
        ${drag ? 'border-violet-400 bg-violet-50 scale-[1.01]'
          : file ? 'border-green-400 bg-green-50/40'
          : 'border-slate-200 bg-slate-50/50 hover:border-violet-300 hover:bg-violet-50/30'}`}
      onClick={() => !file && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />

      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center min-h-[160px]">
        {file ? (
          <>
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <CheckCircle size={22} className="text-green-600" />
            </div>
            <div>
              <p className="text-slate-800 font-semibold text-sm">{file.name}</p>
              <p className="text-slate-400 text-xs mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-all"
            ><X size={12} /> Remove</button>
          </>
        ) : (
          <>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center
              ${drag ? 'bg-violet-100' : 'bg-white border border-slate-200'}`}>
              {icon}
            </div>
            <div>
              <p className="text-slate-700 font-semibold text-sm">{label}</p>
              <p className="text-slate-400 text-xs mt-1">Drop PDF here or click to browse</p>
            </div>
            <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">PDF only</span>
          </>
        )}
      </div>
    </div>
  );
}

function DiscrepancyMeter({ pct, direction }) {
  const clamped = Math.min(Math.abs(pct || 0), 100);
  const color = clamped >= 30 ? 'bg-red-500' : clamped >= 15 ? 'bg-amber-500' : 'bg-green-500';
  const Icon = direction === 'gst_higher' ? TrendingUp : direction === 'bank_higher' ? TrendingDown : Minus;
  const dirLabel = direction === 'gst_higher' ? 'GST > Bank'
    : direction === 'bank_higher' ? 'Bank > GST' : 'Aligned';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500 font-medium flex items-center gap-1.5">
          <Icon size={14} /> Revenue Discrepancy
        </span>
        <span className={`font-bold ${clamped >= 30 ? 'text-red-600' : clamped >= 15 ? 'text-amber-600' : 'text-green-600'}`}>
          {clamped}% ({dirLabel})
        </span>
      </div>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${clamped}%` }} />
      </div>
      <p className="text-xs text-slate-400">
        {clamped < 5 ? 'Revenue figures are well-aligned.' : clamped < 20 ? 'Minor discrepancy — typical for timing differences.' : 'Significant gap — warrants further scrutiny.'}
      </p>
    </div>
  );
}

export default function GSTCrossValidation() {
  const [gstFile, setGstFile]   = useState(null);
  const [bankFile, setBankFile] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');
  const [openFlags, setOpenFlags] = useState({});

  const toggleFlag = (i) => setOpenFlags(prev => ({ ...prev, [i]: !prev[i] }));

  const canRun = gstFile && bankFile && !loading;

  const handleRun = async () => {
    if (!canRun) return;
    setLoading(true);
    setError('');
    setResult(null);
    setOpenFlags({});

    try {
      const fd = new FormData();
      fd.append('gst_file', gstFile);
      fd.append('bank_file', bankFile);
      const res = await fetch(`${BASE_URL}/gst-validate/cross-validate`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(e.detail || 'Validation failed');
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const vc = result ? (verdictConfig[result.verdict] ?? verdictConfig.suspicious) : null;

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-4xl">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full">GST Validation</span>
        </div>
        <h3 className="text-slate-900 font-bold text-xl">GST vs Bank Statement Cross-Validation</h3>
        <p className="text-slate-500 text-sm mt-1">
          Upload GST returns and a bank statement — the AI will cross-check turnover figures, flag revenue
          inflation, circular trading patterns, and cash-flow mismatches.
        </p>
      </div>

      {/* Upload cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">GST Returns</p>
          <DropZone
            label="Drop GST Returns PDF"
            accept=".pdf"
            icon={<FileText size={22} className="text-violet-500" />}
            file={gstFile}
            onFile={setGstFile}
            onRemove={() => setGstFile(null)}
          />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Bank Statement</p>
          <DropZone
            label="Drop Bank Statement PDF"
            accept=".pdf"
            icon={<FileText size={22} className="text-blue-500" />}
            file={bankFile}
            onFile={setBankFile}
            onRemove={() => setBankFile(null)}
          />
        </div>
      </div>

      {/* Run button */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {!gstFile || !bankFile ? 'Upload both documents to run cross-validation.' : 'Both documents ready — click to analyse.'}
        </p>
        <button
          onClick={handleRun}
          disabled={!canRun}
          className="flex items-center gap-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:from-slate-400 disabled:to-slate-500 text-white px-7 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 hover:-translate-y-0.5 disabled:translate-y-0 disabled:shadow-none"
        >
          {loading
            ? <><Loader size={16} className="animate-spin" /> Analysing…</>
            : <><ShieldAlert size={16} /> Run Cross-Validation</>}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center mx-auto">
            <Loader size={22} className="text-violet-500 animate-spin" />
          </div>
          <p className="text-slate-700 font-semibold">Analysing documents…</p>
          <p className="text-slate-400 text-sm">Extracting text from both PDFs and cross-referencing with AI</p>
        </div>
      )}

      {/* Results */}
      {result && vc && (
        <div className="space-y-4">

          {/* Verdict banner */}
          <div className={`rounded-2xl border-2 p-5 ${vc.bg}`}>
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${vc.badge}`}>
                <vc.icon size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1.5">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${vc.badge}`}>{vc.label}</span>
                  <span className="text-xs text-slate-500">{result.recommendation}</span>
                </div>
                <p className={`text-sm font-medium leading-relaxed ${vc.text}`}>{result.overall_summary}</p>
              </div>
            </div>
          </div>

          {/* Revenue comparison */}
          {result.revenue_comparison && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
              <h4 className="text-slate-900 font-semibold text-sm">Revenue Comparison</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: 'GST Reported Turnover', value: result.revenue_comparison.gst_reported_turnover },
                  { label: 'Bank Total Credits',    value: result.revenue_comparison.bank_total_credits },
                  { label: 'Discrepancy',           value: `${result.revenue_comparison.discrepancy_pct ?? 0}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-slate-800 font-bold text-base">{value ?? '—'}</p>
                  </div>
                ))}
              </div>
              <DiscrepancyMeter
                pct={result.revenue_comparison.discrepancy_pct}
                direction={result.revenue_comparison.direction}
              />
              {result.revenue_comparison.interpretation && (
                <div className="flex items-start gap-2 bg-blue-50 rounded-xl p-3">
                  <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-blue-700 text-xs leading-relaxed">{result.revenue_comparison.interpretation}</p>
                </div>
              )}
            </div>
          )}

          {/* Risk flags */}
          {result.flags && result.flags.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-50 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-500" />
                <h4 className="text-slate-900 font-semibold text-sm">Risk Flags ({result.flags.length})</h4>
              </div>
              <div className="divide-y divide-slate-50">
                {result.flags.map((flag, i) => {
                  const s = severityStyle[flag.severity] ?? severityStyle.medium;
                  const isOpen = !!openFlags[i];
                  return (
                    <div key={i}>
                      <button
                        onClick={() => toggleFlag(i)}
                        className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
                      >
                        <span className={`flex-shrink-0 w-2 h-2 rounded-full ${s.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.badge}`}>
                              {(flag.severity || '').toUpperCase()}
                            </span>
                            {flag.risk_type && (
                              <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                {riskTypeLabel[flag.risk_type] ?? flag.risk_type}
                              </span>
                            )}
                            <span className="text-slate-800 text-sm font-semibold">{flag.title}</span>
                          </div>
                        </div>
                        {isOpen ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0" />
                                : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />}
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-4">
                          <p className="text-slate-600 text-sm leading-relaxed bg-slate-50 rounded-xl p-3">{flag.detail}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Positive signals */}
          {result.positive_signals && result.positive_signals.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={16} className="text-green-500" />
                <h4 className="text-slate-900 font-semibold text-sm">Positive Signals</h4>
              </div>
              <ul className="space-y-2">
                {result.positive_signals.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                    <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendation */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-5 text-white">
            <p className="text-slate-400 text-xs uppercase tracking-widest font-semibold mb-2">Analyst Recommendation</p>
            <p className="text-white font-bold text-base">{result.recommendation}</p>
          </div>

        </div>
      )}
    </div>
  );
}
