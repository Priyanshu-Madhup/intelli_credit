import React, { useState } from 'react';
import {
  ShieldCheck, AlertTriangle, TrendingUp, TrendingDown,
  CheckCircle, XCircle, Loader, RefreshCw, FileText,
  ArrowRight, Info, Database
} from 'lucide-react';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

async function fetchGSTValidation(companyName) {
  const res = await fetch(`${BASE_URL}/validate/gst`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_name: companyName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Validation failed');
  }
  return res.json();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const riskConfig = {
  high:              { bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700',   badge: 'bg-red-100 text-red-700',   icon: XCircle,     label: 'High Risk'          },
  medium:            { bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', icon: AlertTriangle, label: 'Medium Risk'        },
  low:               { bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Low Risk'            },
  insufficient_data: { bg: 'bg-slate-50',  border: 'border-slate-200', text: 'text-slate-600', badge: 'bg-slate-100 text-slate-600', icon: Info,        label: 'Insufficient Data'  },
};

const severityConfig = {
  high:   { bg: 'bg-red-50',   border: 'border-red-200',   badge: 'bg-red-100 text-red-700',    dot: 'bg-red-500'   },
  medium: { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  low:    { bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
};

const typeLabels = {
  revenue_inflation:  'Revenue Inflation',
  circular_trading:   'Circular Trading',
  income_suppression: 'Income Suppression',
  suspicious_pattern: 'Suspicious Pattern',
  data_gap:           'Data Gap',
};

const qualityConfig = {
  good:    { color: 'text-green-600', bg: 'bg-green-100', label: 'Good' },
  partial: { color: 'text-amber-600', bg: 'bg-amber-100', label: 'Partial' },
  poor:    { color: 'text-red-600',   bg: 'bg-red-100',   label: 'Poor'    },
};

function fmt(val) {
  return val != null ? val : '—';
}

function fmtPct(val) {
  if (val == null) return '—';
  return `${(val * 100).toFixed(2)}%`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DocSourceBadge({ label, present, count }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${
      present ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-400'
    }`}>
      {present
        ? <CheckCircle size={13} className="flex-shrink-0" />
        : <XCircle size={13} className="flex-shrink-0" />}
      <span>{label}</span>
      {present && <span className="ml-auto font-normal opacity-70">{count} chunks</span>}
    </div>
  );
}

function DiscrepancyMeter({ gst, bank, pct, direction }) {
  // Visual bar showing GST vs bank proportionally
  const discrepancyPct = pct != null ? Math.abs(pct * 100) : null;
  const isAligned = discrepancyPct != null && discrepancyPct < 5;
  const isWarning = discrepancyPct != null && discrepancyPct >= 15;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
        Turnover Comparison
      </p>

      <div className="space-y-3">
        {/* GST bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <FileText size={11} /> GST Reported Turnover
            </span>
            <span className="text-xs font-bold text-slate-800">{fmt(gst)}</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-700"
              style={{ width: direction === 'gst_higher' ? '100%' : direction === 'bank_higher' ? `${Math.max(20, 100 - (discrepancyPct ?? 0))}%` : '50%' }}
            />
          </div>
        </div>

        {/* Bank bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Database size={11} /> Bank Credits Total
            </span>
            <span className="text-xs font-bold text-slate-800">{fmt(bank)}</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-400 transition-all duration-700"
              style={{ width: direction === 'bank_higher' ? '100%' : direction === 'gst_higher' ? `${Math.max(20, 100 - (discrepancyPct ?? 0))}%` : '50%' }}
            />
          </div>
        </div>
      </div>

      {/* Discrepancy callout */}
      <div className={`mt-4 flex items-center justify-between px-4 py-3 rounded-xl ${
        isWarning ? 'bg-red-50 border border-red-200' :
        isAligned ? 'bg-green-50 border border-green-200' :
        'bg-amber-50 border border-amber-200'
      }`}>
        <div className="flex items-center gap-2">
          {direction === 'gst_higher'
            ? <TrendingUp size={14} className={isWarning ? 'text-red-500' : 'text-amber-500'} />
            : direction === 'bank_higher'
            ? <TrendingDown size={14} className="text-amber-500" />
            : <CheckCircle size={14} className="text-green-500" />}
          <span className={`text-xs font-semibold ${
            isWarning ? 'text-red-700' : isAligned ? 'text-green-700' : 'text-amber-700'
          }`}>
            {direction === 'gst_higher' ? 'GST higher than bank credits' :
             direction === 'bank_higher' ? 'Bank credits higher than GST' :
             direction === 'aligned'     ? 'Values aligned' : 'Direction unknown'}
          </span>
        </div>
        <span className={`text-sm font-bold ${
          isWarning ? 'text-red-700' : isAligned ? 'text-green-700' : 'text-amber-700'
        }`}>
          {discrepancyPct != null ? `${discrepancyPct.toFixed(2)}% gap` : '—'}
        </span>
      </div>

      {/* Threshold legend */}
      <div className="mt-3 flex items-center gap-4 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block"/> &lt;5% — Aligned</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/> 5–15% — Monitor</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"/> &gt;15% — Red Flag</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GSTValidation() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Read company name from localStorage (set by NewCreditAssessment)
  let companyName = 'Company';
  try {
    companyName = JSON.parse(localStorage.getItem('ic_assessment') || '{}')?.company_name
      || JSON.parse(localStorage.getItem('ic_company') || '{}')?.name
      || 'Company';
  } catch (_) {}

  const runValidation = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchGSTValidation(companyName);
      setData(result);
    } catch (err) {
      setError(err.message || 'Validation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const risk    = data ? (riskConfig[data.overall_risk] || riskConfig.insufficient_data) : null;
  const RiskIcon = risk?.icon;
  const quality = data ? (qualityConfig[data.data_quality] || qualityConfig.poor) : null;

  return (
    <div className="p-6 space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={14} className="text-blue-500" />
            <span className="text-xs font-semibold text-slate-500">
              GST Cross-Validation • {companyName}
            </span>
          </div>
          <h3 className="text-slate-900 font-bold text-xl">GST vs Bank Statement Validator</h3>
          <p className="text-slate-500 text-sm mt-0.5">
            Detects revenue inflation, circular trading, and GST discrepancies
          </p>
        </div>
        <button
          onClick={runValidation}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl transition-all shadow-md shadow-blue-500/20 hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
        >
          {loading
            ? <><Loader size={14} className="animate-spin" /> Analysing…</>
            : <><ShieldCheck size={14} /> {data ? 'Re-run Validation' : 'Run Validation'}</>}
        </button>
      </div>

      {/* ── Pre-run state ── */}
      {!data && !loading && !error && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
            <ShieldCheck size={30} className="text-blue-400" />
          </div>
          <h4 className="text-slate-700 font-bold text-base mb-1">Ready to Validate</h4>
          <p className="text-slate-500 text-sm mb-2 max-w-sm mx-auto">
            Make sure you've uploaded both a <strong>GST Returns</strong> and a <strong>Bank Statement</strong> document before running.
          </p>
          <div className="flex items-center justify-center gap-3 mt-5 text-xs text-slate-500">
            <span className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-full">
              <FileText size={11} /> GST Returns (doc_type: gst)
            </span>
            <ArrowRight size={12} className="text-slate-300" />
            <span className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-full">
              <Database size={11} /> Bank Statement (doc_type: bank)
            </span>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-10 text-center">
          <Loader size={28} className="text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-blue-700 font-semibold text-sm">Running cross-validation…</p>
          <p className="text-blue-500 text-xs mt-1">
            Comparing GST turnover against bank credits for {companyName}
          </p>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center gap-3">
          <XCircle size={18} className="text-red-500 flex-shrink-0" />
          <div>
            <p className="text-red-700 font-semibold text-sm">Validation failed</p>
            <p className="text-red-600 text-xs mt-0.5">{error}</p>
          </div>
          <button onClick={runValidation} className="ml-auto flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800">
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* ── Results ── */}
      {data && !loading && (
        <>
          {/* Overall risk banner */}
          <div className={`rounded-2xl border p-5 ${risk.bg} ${risk.border}`}>
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${risk.badge}`}>
                <RiskIcon size={22} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  <h4 className={`font-bold text-base ${risk.text}`}>{risk.label}</h4>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${risk.badge}`}>
                    {data.overall_risk.replace('_', ' ').toUpperCase()}
                  </span>
                  {quality && (
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${quality.bg} ${quality.color}`}>
                      Data Quality: {quality.label}
                    </span>
                  )}
                </div>
                <p className={`text-sm leading-relaxed ${risk.text}`}>{data.summary}</p>
                {data.data_quality_note && data.data_quality !== 'good' && (
                  <p className="text-xs mt-1.5 opacity-70 italic">{data.data_quality_note}</p>
                )}
              </div>
            </div>
          </div>

          {/* Data sources + discrepancy meter */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Sources */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Documents Indexed
              </p>
              <DocSourceBadge label="GST Returns"     present={data.has_gst}  count={data.gst_chunks}  />
              <DocSourceBadge label="Bank Statement"  present={data.has_bank} count={data.bank_chunks} />
              {(!data.has_gst || !data.has_bank) && (
                <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
                  Upload missing documents and re-run for a complete analysis.
                </p>
              )}
            </div>

            {/* Discrepancy meter spans 2 cols */}
            <div className="lg:col-span-2">
              <DiscrepancyMeter
                gst={data.gst_turnover_reported}
                bank={data.bank_credits_total}
                pct={data.discrepancy_pct}
                direction={data.discrepancy_direction}
              />
            </div>
          </div>

          {/* Flags + positive indicators */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Flags */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={14} className="text-red-500" />
                <h4 className="text-sm font-bold text-slate-800">Risk Flags</h4>
                <span className="ml-auto text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                  {(data.flags || []).length} found
                </span>
              </div>

              {(data.flags || []).length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle size={24} className="text-green-400 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No risk flags detected</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.flags.map((flag, i) => {
                    const sc = severityConfig[flag.severity] || severityConfig.low;
                    return (
                      <div key={i} className={`rounded-xl border p-4 ${sc.bg} ${sc.border}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sc.badge}`}>
                            {typeLabels[flag.type] || flag.type}
                          </span>
                          <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border ${sc.border}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`}></span>
                            {(flag.severity || 'low').charAt(0).toUpperCase() + flag.severity.slice(1)}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-800 mb-1">{flag.title}</p>
                        <p className="text-xs text-slate-600 leading-relaxed mb-2">{flag.detail}</p>
                        {flag.recommendation && (
                          <div className="flex items-start gap-1.5 bg-white/70 rounded-lg px-3 py-2">
                            <ArrowRight size={11} className="text-slate-400 mt-0.5 flex-shrink-0" />
                            <p className="text-[11px] text-slate-500 leading-relaxed">{flag.recommendation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Positive indicators */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle size={14} className="text-green-500" />
                <h4 className="text-sm font-bold text-slate-800">Positive Indicators</h4>
                <span className="ml-auto text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                  {(data.positive_indicators || []).length} found
                </span>
              </div>

              {(data.positive_indicators || []).length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No positive signals found</p>
              ) : (
                <div className="space-y-2">
                  {data.positive_indicators.map((signal, i) => (
                    <div key={i} className="flex items-start gap-2 bg-green-50 border border-green-100 rounded-xl p-3">
                      <CheckCircle size={13} className="text-green-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-green-800 leading-relaxed">{signal}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Indian context note */}
              <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-[11px] text-blue-600 font-semibold mb-1">Indian GST Context</p>
                <p className="text-[11px] text-blue-500 leading-relaxed">
                  GSTR-3B is self-declared. Discrepancies between 3B and GSTR-2A (auto-populated)
                  can indicate input tax credit mismatches. Gaps &gt;15% warrant manual verification.
                </p>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
            <p className="text-slate-500 text-xs">
              This analysis is AI-generated from uploaded documents. Figures should be independently
              verified with the original GST portal (gst.gov.in) and bank records before any credit decision.
            </p>
          </div>
        </>
      )}
    </div>
  );
}