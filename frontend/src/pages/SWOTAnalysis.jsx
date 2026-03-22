import React, { useState } from 'react';
import {
  Target, TrendingUp, AlertTriangle, Lightbulb, ShieldX,
  RefreshCw, Loader, AlertCircle, CheckCircle, FileText,
} from 'lucide-react';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const QUADRANTS = [
  {
    key: 'strengths',
    label: 'Strengths',
    icon: TrendingUp,
    headerBg: 'bg-green-600',
    cardBg: 'bg-green-50',
    border: 'border-green-200',
    dot: 'bg-green-500',
    badge: 'bg-green-100 text-green-700',
    description: 'Internal positive factors',
  },
  {
    key: 'weaknesses',
    label: 'Weaknesses',
    icon: AlertTriangle,
    headerBg: 'bg-red-600',
    cardBg: 'bg-red-50',
    border: 'border-red-200',
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-700',
    description: 'Internal negative factors',
  },
  {
    key: 'opportunities',
    label: 'Opportunities',
    icon: Lightbulb,
    headerBg: 'bg-blue-600',
    cardBg: 'bg-blue-50',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
    badge: 'bg-blue-100 text-blue-700',
    description: 'External positive factors',
  },
  {
    key: 'threats',
    label: 'Threats',
    icon: ShieldX,
    headerBg: 'bg-amber-500',
    cardBg: 'bg-amber-50',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700',
    description: 'External negative factors',
  },
];

export default function SWOTAnalysis() {
  const company = (() => {
    try { return JSON.parse(localStorage.getItem('ic_company') || '{}'); }
    catch { return {}; }
  })();
  const companyName = company.name || '';
  const sector = company.sector || '';

  const [swot, setSwot] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ic_swot') || 'null'); }
    catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const generate = async () => {
    if (!companyName) {
      setError('Run a credit assessment first to set the company context.');
      return;
    }
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch(`${BASE_URL}/swot/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: companyName, sector }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'Generation failed');
      }
      const data = await res.json();
      setSwot(data);
      localStorage.setItem('ic_swot', JSON.stringify(data));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20 flex-shrink-0">
              <Target size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-slate-900 font-bold text-lg leading-tight">SWOT Analysis</h2>
              <p className="text-slate-400 text-xs mt-0.5">
                {companyName ? (
                  <>
                    <span className="font-medium text-slate-600">{companyName}</span>
                    {sector && <span className="text-slate-400"> · {sector}</span>}
                    <span className="text-slate-300"> · generated from indexed documents</span>
                  </>
                ) : (
                  'No company context — run an assessment first'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {swot && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border ${saved ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                {saved ? <CheckCircle size={12} /> : <FileText size={12} />}
                {saved ? 'Saved to CAM' : `${swot.generated_at} · ${swot.chunks_retrieved ?? '?'} chunks`}
              </div>
            )}
            <button
              onClick={generate}
              disabled={loading || !companyName}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-slate-400 disabled:to-slate-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-violet-500/25 disabled:shadow-none"
            >
              {loading
                ? <Loader size={14} className="animate-spin" />
                : <RefreshCw size={14} />}
              {loading ? 'Generating…' : swot ? 'Regenerate' : 'Generate SWOT'}
            </button>
          </div>
        </div>

        {swot && (
          <p className="text-slate-400 text-[11px] mt-3 pt-3 border-t border-slate-50">
            Analysis saved automatically — available in the CAM Report download.
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
          <AlertCircle size={14} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden animate-pulse">
              <div className="h-12 bg-slate-200" />
              <div className="p-5 space-y-4">
                {[0, 1, 2, 3].map(j => (
                  <div key={j} className="space-y-1.5">
                    <div className="h-3 bg-slate-100 rounded w-1/2" />
                    <div className="h-2.5 bg-slate-100 rounded w-full" />
                    <div className="h-2.5 bg-slate-100 rounded w-4/5" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2×2 SWOT grid */}
      {swot && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {QUADRANTS.map(q => {
            const Icon = q.icon;
            const items = swot[q.key] || [];
            return (
              <div key={q.key} className={`rounded-2xl border ${q.border} ${q.cardBg} overflow-hidden shadow-sm`}>
                {/* Coloured header */}
                <div className={`${q.headerBg} px-5 py-3 flex items-center gap-3`}>
                  <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Icon size={15} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-bold text-sm leading-none">{q.label}</p>
                    <p className="text-white/70 text-[10px] mt-0.5">{q.description}</p>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">
                    {items.length}
                  </span>
                </div>

                {/* Item list */}
                <div className="p-5 space-y-3.5">
                  {items.length === 0 ? (
                    <p className="text-slate-400 text-xs italic">No items identified.</p>
                  ) : (
                    items.map((item, idx) => (
                      <div key={idx} className="flex gap-2.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${q.dot} mt-1.5 flex-shrink-0`} />
                        <div>
                          <p className="text-slate-900 font-semibold text-xs leading-snug">{item.title}</p>
                          <p className="text-slate-600 text-[11px] mt-0.5 leading-relaxed">{item.detail}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!swot && !loading && !error && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-50 flex items-center justify-center">
            <Target size={32} className="text-violet-300" />
          </div>
          <h3 className="text-slate-700 font-semibold text-base mb-2">No SWOT generated yet</h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            {companyName
              ? `Click "Generate SWOT" to produce a Strengths, Weaknesses, Opportunities and Threats analysis for ${companyName} from your indexed documents.`
              : 'Run a credit assessment first, then return here to generate a full SWOT analysis.'}
          </p>
        </div>
      )}
    </div>
  );
}
