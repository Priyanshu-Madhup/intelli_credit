import React, { useState } from 'react';
import {
  BarChart2, TrendingUp, TrendingDown, Minus,
  CheckCircle, AlertTriangle, XCircle, Loader,
  Info, RefreshCw, Target
} from 'lucide-react';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

async function fetchBenchmark(companyName, sector) {
  const res = await fetch(`${BASE_URL}/benchmark/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_name: companyName, sector }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Benchmark failed');
  }
  return res.json();
}

// ── Config ────────────────────────────────────────────────────────────────────

const ratingConfig = {
  good:             { color: 'text-green-600', bg: 'bg-green-50',  border: 'border-green-200', bar: '#22c55e', icon: TrendingUp,   label: 'Above Median' },
  average:          { color: 'text-amber-600', bg: 'bg-amber-50',  border: 'border-amber-200', bar: '#f59e0b', icon: Minus,        label: 'Near Median'  },
  poor:             { color: 'text-red-600',   bg: 'bg-red-50',    border: 'border-red-200',   bar: '#ef4444', icon: TrendingDown, label: 'Below Median' },
  unknown:          { color: 'text-slate-400', bg: 'bg-slate-50',  border: 'border-slate-200', bar: '#cbd5e1', icon: Info,         label: 'No Data'      },
};

const overallConfig = {
  above_average:    { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  label: 'Above Average',     icon: CheckCircle  },
  average:          { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   label: 'Average',           icon: Minus        },
  mixed:            { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  label: 'Mixed Performance', icon: AlertTriangle },
  below_average:    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    label: 'Below Average',     icon: XCircle      },
  insufficient_data:{ bg: 'bg-slate-50',  border: 'border-slate-200',  text: 'text-slate-600',  label: 'Insufficient Data', icon: Info         },
};

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ comparison }) {
  const cfg      = ratingConfig[comparison.rating] || ratingConfig.unknown;
  const Icon     = cfg.icon;
  const hasData  = comparison.company_value != null;
  const median   = comparison.sector_median;

  // Bar widths — company vs median, scaled so the larger = 100%
  const maxVal   = hasData ? Math.max(Math.abs(comparison.company_value), Math.abs(median || 0)) : 0;
  const compBar  = maxVal > 0 ? (Math.abs(comparison.company_value) / maxVal) * 100 : 0;
  const medBar   = maxVal > 0 ? (Math.abs(median) / maxVal) * 100 : 60;

  return (
    <div className={`rounded-2xl border p-5 ${cfg.bg} ${cfg.border}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">
            {comparison.label}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {hasData ? (
              <span className={`text-xl font-bold ${cfg.color}`}>
                {comparison.company_value}{comparison.unit}
              </span>
            ) : (
              <span className="text-sm font-semibold text-slate-400">No data</span>
            )}
            {hasData && comparison.vs_median_pct != null && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-white border ${cfg.border} ${cfg.color}`}>
                {comparison.vs_median_pct > 0 ? '+' : ''}{comparison.vs_median_pct}% vs median
              </span>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-white border ${cfg.border} ${cfg.color} flex-shrink-0`}>
          <Icon size={11} />
          {cfg.label}
        </div>
      </div>

      {/* Bar comparison */}
      <div className="space-y-2 mb-3">
        {/* Company bar */}
        <div>
          <div className="flex justify-between text-[10px] font-semibold mb-1">
            <span className="text-slate-500">Company</span>
            <span className={cfg.color}>{hasData ? `${comparison.company_value}${comparison.unit}` : '—'}</span>
          </div>
          <div className="h-2.5 bg-white/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${hasData ? compBar : 0}%`, background: cfg.bar }}
            />
          </div>
        </div>
        {/* Sector median bar */}
        <div>
          <div className="flex justify-between text-[10px] font-semibold mb-1">
            <span className="text-slate-500">Sector median</span>
            <span className="text-slate-500">{median != null ? `${median}${comparison.unit}` : '—'}</span>
          </div>
          <div className="h-2.5 bg-white/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-slate-300 transition-all duration-700"
              style={{ width: `${medBar}%` }}
            />
          </div>
        </div>
      </div>

      {/* Insight sentence */}
      <p className={`text-xs leading-relaxed ${hasData ? cfg.color : 'text-slate-400'}`}>
        {comparison.insight}
      </p>
    </div>
  );
}

// ── Summary scorecard ─────────────────────────────────────────────────────────

function ScoreCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SectorBenchmark() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Read from localStorage
  let companyName = 'Company';
  let sector      = 'Manufacturing';
  try {
    const assessment = JSON.parse(localStorage.getItem('ic_assessment') || '{}');
    const company    = JSON.parse(localStorage.getItem('ic_company')    || '{}');
    companyName = assessment.company_name || company.name      || 'Company';
    sector      = assessment.sector       || company.sector    || 'Manufacturing';
  } catch (_) {}

  const runBenchmark = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchBenchmark(companyName, sector);
      setData(result);
    } catch (err) {
      setError(err.message || 'Benchmark failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const overall    = data ? (overallConfig[data.overall_rating] || overallConfig.insufficient_data) : null;
  const OverallIcon = overall?.icon;

  // Split comparisons into rated vs unknown
  const ratedComparisons   = data?.comparisons.filter(c => c.rating !== 'unknown') || [];
  const unknownComparisons = data?.comparisons.filter(c => c.rating === 'unknown')  || [];

  const goodCount    = ratedComparisons.filter(c => c.rating === 'good').length;
  const averageCount = ratedComparisons.filter(c => c.rating === 'average').length;
  const poorCount    = ratedComparisons.filter(c => c.rating === 'poor').length;

  return (
    <div className="p-6 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 size={14} className="text-blue-500" />
            <span className="text-xs font-semibold text-slate-500">
              Sector Benchmarking • {companyName} vs {sector}
            </span>
          </div>
          <h3 className="text-slate-900 font-bold text-xl">Sector Benchmark Analysis</h3>
          <p className="text-slate-500 text-sm mt-0.5">
            Compares key financial ratios against Indian {sector} sector medians
          </p>
        </div>
        <button
          onClick={runBenchmark}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl transition-all shadow-md shadow-blue-500/20 hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
        >
          {loading
            ? <><Loader size={14} className="animate-spin" /> Analysing…</>
            : <><Target size={14} /> {data ? 'Re-run Benchmark' : 'Run Benchmark'}</>}
        </button>
      </div>

      {/* Pre-run state */}
      {!data && !loading && !error && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
            <BarChart2 size={30} className="text-blue-400" />
          </div>
          <h4 className="text-slate-700 font-bold text-base mb-2">Ready to Benchmark</h4>
          <p className="text-slate-500 text-sm max-w-sm mx-auto mb-5">
            Compares <strong>{companyName}</strong>'s financial ratios against{' '}
            <strong>{sector}</strong> sector medians from RBI and SEBI data.
          </p>
          <div className="flex items-center justify-center flex-wrap gap-2 text-xs text-slate-500">
            {['D/E Ratio', 'Net Margin', 'Current Ratio', 'ROE', 'Revenue Growth', 'Interest Coverage'].map(m => (
              <span key={m} className="bg-white border border-slate-200 px-3 py-1.5 rounded-full">{m}</span>
            ))}
          </div>
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 mt-5 inline-block">
            Tip: Upload an annual report for best results — it contains all key financial ratios
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-10 text-center">
          <Loader size={28} className="text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-blue-700 font-semibold text-sm">Running benchmark analysis…</p>
          <p className="text-blue-500 text-xs mt-1">
            Extracting ratios from documents and comparing against {sector} sector medians
          </p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center gap-3">
          <XCircle size={18} className="text-red-500 flex-shrink-0" />
          <div>
            <p className="text-red-700 font-semibold text-sm">Benchmark failed</p>
            <p className="text-red-600 text-xs mt-0.5">{error}</p>
          </div>
          <button onClick={runBenchmark} className="ml-auto flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800">
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <>
          {/* Overall rating banner */}
          <div className={`rounded-2xl border p-5 ${overall.bg} ${overall.border}`}>
            <div className="flex items-start gap-4 flex-wrap">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-white border ${overall.border}`}>
                <OverallIcon size={22} className={overall.text} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  <h4 className={`font-bold text-base ${overall.text}`}>{overall.label}</h4>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full bg-white border ${overall.border} ${overall.text}`}>
                    {data.sector_label}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-full">
                    {data.metrics_found}/{data.metrics_total} metrics extracted
                  </span>
                </div>
                {data.extraction_notes && (
                  <p className={`text-sm leading-relaxed ${overall.text} opacity-80`}>
                    {data.extraction_notes}
                  </p>
                )}
                {/* Standout insights */}
                {data.standout_insights?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {data.standout_insights.map((insight, i) => (
                      <p key={i} className={`text-xs leading-relaxed ${overall.text}`}>
                        • {insight}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Summary scorecards */}
          {data.metrics_found > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <ScoreCard label="Above Median" value={goodCount}    color="text-green-600" />
              <ScoreCard label="Near Median"  value={averageCount} color="text-amber-600" />
              <ScoreCard label="Below Median" value={poorCount}    color="text-red-600"   />
            </div>
          )}

          {/* No data tip */}
          {data.metrics_found === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-800 font-semibold text-sm mb-1">No financial metrics found in documents</p>
                <p className="text-amber-700 text-xs leading-relaxed">
                  The benchmark table below shows sector medians for reference.
                  To get company comparisons, upload an <strong>annual report</strong> PDF
                  (labelled as "Annual Reports" in the upload form) and re-run the assessment.
                  Annual reports contain P&amp;L statements, balance sheets, and ratio summaries.
                </p>
              </div>
            </div>
          )}

          {/* Metric cards grid — rated ones first */}
          {ratedComparisons.length > 0 && (
            <>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Metrics with data ({ratedComparisons.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {ratedComparisons.map(c => (
                  <MetricCard key={c.metric} comparison={c} />
                ))}
              </div>
            </>
          )}

          {/* Unknown metrics — shown as reference table */}
          {unknownComparisons.length > 0 && (
            <>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-2">
                Sector medians for reference — awaiting company data ({unknownComparisons.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {unknownComparisons.map(c => (
                  <MetricCard key={c.metric} comparison={c} />
                ))}
              </div>
            </>
          )}

          {/* Data source note */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Benchmark Data Sources</p>
            <p className="text-slate-500 text-xs leading-relaxed">
              Sector medians are derived from RBI Annual Reports, SEBI disclosure data, CMIE Prowess database,
              and industry-specific publications (FY2023-24). Benchmarks cover{' '}
              {Object.keys({
                manufacturing: 1, technology: 1, nbfc: 1, infrastructure: 1,
                retail: 1, pharma: 1, construction: 1, healthcare: 1, agriculture: 1,
                textiles: 1, finance: 1,
              }).length} Indian sectors.
              Company metrics are AI-extracted from uploaded financial documents and should be
              independently verified before any credit decision.
            </p>
          </div>
        </>
      )}
    </div>
  );
}