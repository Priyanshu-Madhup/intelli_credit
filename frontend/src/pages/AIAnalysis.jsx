import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  BarChart2, CreditCard, Activity, ChevronRight,
  Loader, RefreshCw
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { fetchChartData } from '../api';

/* ── Risk Gauge (SVG semicircle) ─────────────────────────────────────────── */
function RiskGauge({ score }) {
  const cx = 150, cy = 150, r = 100, sw = 18;

  const pt = (s) => {
    const a = Math.PI * (1 - s / 100);
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
  };

  const arc = (from, to) => {
    const s = pt(from), e = pt(to);
    const lg = Math.abs(to - from) > 50 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${lg} 0 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  };

  const na = Math.PI * (1 - score / 100);
  const nl = r - 24;
  const nx = cx + nl * Math.cos(na), ny = cy - nl * Math.sin(na);
  const dotPt = pt(score);

  const color = score < 33 ? '#22c55e' : score < 67 ? '#f59e0b' : '#ef4444';
  const label = score < 33 ? 'Low Risk' : score < 67 ? 'Medium Risk' : 'High Risk';

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 300 185" className="w-full max-w-[260px]">
        {/* background track */}
        <path d={arc(0, 100)} fill="none" stroke="#e2e8f0" strokeWidth={sw + 4} strokeLinecap="round" />
        {/* color bands */}
        <path d={arc(0, 33)}  fill="none" stroke="#22c55e" strokeWidth={sw} strokeLinecap="round" />
        <path d={arc(33, 67)} fill="none" stroke="#f59e0b" strokeWidth={sw} />
        <path d={arc(67, 100)} fill="none" stroke="#ef4444" strokeWidth={sw} strokeLinecap="round" />
        {/* needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#1e293b" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="7" fill="#1e293b" />
        <circle cx={cx} cy={cy} r="3" fill="white" />
        {/* score indicator dot */}
        <circle cx={dotPt.x} cy={dotPt.y} r="7" fill={color} stroke="white" strokeWidth="2.5" />
        {/* score label */}
        <text x={cx} y={cy + 32} textAnchor="middle" fill={color} style={{ fontSize: '30px', fontWeight: '800' }}>{score}</text>
        <text x={cx} y={cy + 50} textAnchor="middle" fill="#94a3b8" style={{ fontSize: '11px' }}>out of 100</text>
        {/* axis labels */}
        <text x="24"  y={cy + 18} fill="#94a3b8" style={{ fontSize: '10px', fontWeight: '600' }}>LOW</text>
        <text x="245" y={cy + 18} fill="#94a3b8" style={{ fontSize: '10px', fontWeight: '600' }}>HIGH</text>
      </svg>
      <span className="text-sm font-bold mt-1 tracking-wide" style={{ color }}>{label}</span>
    </div>
  );
}

/* ── Severity styles ─────────────────────────────────────────────────────── */
const severityStyle = {
  high:   { bg: 'bg-red-50',    border: 'border-red-200',    badge: 'bg-red-100 text-red-700',     dot: 'bg-red-500'    },
  medium: { bg: 'bg-amber-50',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500'  },
  low:    { bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500'   },
};

/* ── Helpers to build financials cards from assessment data ──────────────── */
function buildFinancials(fo) {
  if (!fo) return [];
  return [
    { label: 'Annual Revenue', value: fo.annual_revenue  || '—', sub: 'Latest FY',        trend: fo.annual_revenue_trend  || 'up',   delta: fo.annual_revenue_delta || '',  icon: TrendingUp,   clr: 'text-blue-600',  bg: 'bg-blue-50'  },
    { label: 'Net Profit',     value: fo.net_profit      || '—', sub: `Margin ${fo.net_profit_margin || '—'}`, trend: fo.net_profit_trend || 'up', delta: '', icon: TrendingDown, clr: 'text-red-600',   bg: 'bg-red-50'   },
    { label: 'Total Debt',     value: fo.total_debt      || '—', sub: `D/E ${fo.de_ratio || '—'}`,  trend: fo.total_debt_trend  || 'up',   delta: '',                            icon: CreditCard,   clr: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'GST Turnover',   value: fo.gst_turnover    || '—', sub: 'Last 12 months',   trend: fo.gst_turnover_trend    || 'up',   delta: '',                            icon: Activity,     clr: 'text-green-600', bg: 'bg-green-50' },
  ];
}

/* ── Alert icon helper ───────────────────────────────────────────────────── */
function alertIcon(severity) {
  if (severity === 'high')   return '⚖️';
  if (severity === 'medium') return '📊';
  return '📋';
}

export default function AIAnalysis({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [steps, setSteps]       = useState([false, false, false, false]);
  const [assessment, setAssessment]   = useState(null);
  const [company, setCompany]           = useState(null);
  const [chartData, setChartData]       = useState(null);
  const [chartFetching, setChartFetching] = useState(false);

  useEffect(() => {
    // If no assessment data exists yet, skip the animation entirely
    const rawCheck = localStorage.getItem('ic_assessment');
    if (!rawCheck) {
      setLoading(false);
      return;
    }

    // Animate loading screen then reveal data — no extra API calls on mount.
    // All financial data (financial_overview, yearly_trend) is already in localStorage
    // from the /assess call that ran during New Assessment.
    const stepTimers = [0, 1, 2, 3].map(i =>
      setTimeout(() => setSteps(prev => { const n = [...prev]; n[i] = true; return n; }), (i + 1) * 600)
    );
    let p = 0;
    const iv = setInterval(() => {
      p += 2;
      setProgress(Math.min(p, 100));
      if (p >= 100) {
        clearInterval(iv);
        setTimeout(() => {
          try {
            const raw = localStorage.getItem('ic_assessment');
            const co  = localStorage.getItem('ic_company');
            if (raw) setAssessment(JSON.parse(raw));
            if (co)  setCompany(JSON.parse(co));
          } catch (_) {}
          setLoading(false);
        }, 300);
      }
    }, 50);
    return () => { stepTimers.forEach(clearTimeout); clearInterval(iv); };
  }, []);

  // Helper: check if a value is meaningful (not N/A, dash, empty, null)
  function isMeaningful(v) {
    if (v == null) return false;
    const s = String(v).trim();
    return s.length > 0 && !['N/A', 'n/a', '—', '', 'null', '-'].includes(s);
  }

  // Helper: check if a financial_overview object has real (non-N/A) values
  function hasMeaningfulFO(fo) {
    if (!fo) return false;
    return isMeaningful(fo.annual_revenue);
  }

  // Merge financial_overview from chart + assessment, preferring non-empty values
  function mergeFO(primary, secondary) {
    if (!primary && !secondary) return {};
    if (!primary) return { ...secondary };
    if (!secondary) return { ...primary };
    const merged = { ...secondary };
    for (const [k, v] of Object.entries(primary)) {
      if (isMeaningful(v)) merged[k] = v;
    }
    return merged;
  }

  const chartFO = chartData?.financial_overview || {};
  const assessFO = assessment?.financial_overview || {};
  const rawMergedFO = hasMeaningfulFO(chartFO)
    ? mergeFO(chartFO, assessFO)
    : hasMeaningfulFO(assessFO)
      ? mergeFO(assessFO, chartFO)
      : mergeFO(chartFO, assessFO);

  // Enrich financial_overview from profitability_metrics
  const profMetrics = chartData?.profitability_metrics || assessment?.profitability_metrics || {};
  const enrichedFO = { ...rawMergedFO };
  if (!isMeaningful(enrichedFO.net_profit_margin) && profMetrics.net_margin_pct != null) {
    enrichedFO.net_profit_margin = `${profMetrics.net_margin_pct}%`;
  }
  if (!isMeaningful(enrichedFO.de_ratio) && profMetrics.de_ratio_num != null) {
    enrichedFO.de_ratio = `${profMetrics.de_ratio_num}x`;
  }

  const financials  = buildFinancials(enrichedFO);
  const alerts      = assessment?.risk_alerts || [];
  const yearlyData  = (chartData?.yearly_trend?.length ? chartData.yearly_trend : assessment?.yearly_trend) || [];
  const hasProfMetrics = Object.values(profMetrics).some(v => v != null);
  const RISK_SCORE  = assessment?.risk_score ?? 0;
  const companyLabel = company ? `${company.name} • ${company.sector}` : (assessment?.company_name ? `${assessment.company_name} • ${assessment.sector}` : 'Company');

  // Persist enriched assessment data to localStorage so CAM Report and other pages get real data
  useEffect(() => {
    if (!loading && assessment) {
      try {
        const enriched = {
          ...assessment,
          financial_overview: enrichedFO,
          yearly_trend: yearlyData.length > 0 ? yearlyData : assessment.yearly_trend,
          profitability_metrics: Object.keys(profMetrics).length > 0 ? profMetrics : assessment.profitability_metrics,
        };
        localStorage.setItem('ic_assessment', JSON.stringify(enriched));
      } catch (_) {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, enrichedFO, yearlyData, profMetrics]);

  const stepLabels = ['Parsing uploaded documents', 'Extracting financial ratios', 'Running risk assessment models', 'Compiling final report'];

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-10 w-96 shadow-xl text-center border border-slate-100">
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
            <Brain size={36} className="text-blue-600 animate-pulse" />
          </div>
          <h3 className="text-slate-900 font-bold text-lg mb-1">AI Analysis in Progress</h3>
          <p className="text-slate-500 text-sm mb-6">Processing company data and extracting insights…</p>
          <div className="space-y-2.5 text-left mb-6">
            {stepLabels.map((s, i) => (
              <div key={s} className="flex items-center gap-3 text-sm">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${steps[i] ? 'bg-green-500' : 'bg-slate-200'}`}>
                  {steps[i] ? <CheckCircle size={12} className="text-white" /> : <Loader size={11} className="text-slate-400 animate-spin" />}
                </div>
                <span className={steps[i] ? 'text-slate-700 font-medium' : 'text-slate-400'}>{s}</span>
              </div>
            ))}
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-slate-400 text-xs mt-2">{progress}% complete</p>
        </div>
      </div>
    );
  }



  const doFetchCharts = () => {
    const cname = company?.name || assessment?.company_name || '';
    setChartFetching(true);
    fetchChartData(cname)
      .then(d => setChartData(prev => {
        if (!prev) return d;
        const mergedFO = { ...(prev.financial_overview || {}), ...(d.financial_overview || {}) };
        if (!d.financial_overview?.gst_turnover && prev.financial_overview?.gst_turnover) {
          mergedFO.gst_turnover = prev.financial_overview.gst_turnover;
          mergedFO.gst_turnover_trend = prev.financial_overview.gst_turnover_trend || 'up';
        }
        return { ...d, financial_overview: mergedFO };
      }))
      .catch(() => {})
      .finally(() => setChartFetching(false));
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">Analysis Complete</span>
            <span className="text-xs text-slate-400">{companyLabel}</span>
          </div>
          <h3 className="text-slate-900 font-bold text-xl">AI Analysis Report</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={doFetchCharts}
            disabled={chartFetching}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-all disabled:opacity-50"
          >
            {chartFetching ? <Loader size={13} className="animate-spin" /> : <BarChart2 size={13} />}
            {chartFetching ? 'Extracting…' : 'Fetch from Docs'}
          </button>
          <button
            onClick={() => setLoading(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all"
          >
            <RefreshCw size={13} /> Re-run
          </button>
          <button
            onClick={() => onNavigate('recommendation')}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/20"
          >
            View Decision <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Financial overview */}
      <div>
        <h4 className="text-slate-900 font-semibold text-sm mb-3 flex items-center gap-2">
          <BarChart2 size={16} className="text-blue-500" /> Financial Overview
        </h4>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {financials.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.label} className={`${f.bg} rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}>
                <div className="flex items-start justify-between mb-3">
                  <Icon size={18} className={f.clr} />
                  <span className={`text-xs font-semibold ${f.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>{f.delta}</span>
                </div>
                <p className="text-slate-500 text-xs font-medium">{f.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5 leading-none">{f.value}</p>
                <p className="text-slate-400 text-[11px] mt-1">{f.sub}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Charts + Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Bar chart */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h4 className="text-slate-900 font-semibold text-sm mb-1">Yearly Financial Trend</h4>
          <p className="text-slate-400 text-xs mb-4">
            Revenue, profit &amp; debt (₹ Cr){' '}
            {chartFetching && <span className="text-blue-400 italic">— extracting from documents…</span>}
          </p>
          {yearlyData.length === 0 ? (
            <div className="h-[200px] flex flex-col items-center justify-center gap-2">
              {chartFetching ? (
                <>
                  <Loader size={20} className="text-blue-400 animate-spin" />
                  <p className="text-slate-400 text-xs">Querying vector database for financial data…</p>
                </>
              ) : (
                <p className="text-slate-400 text-sm">No yearly trend data found. Upload financial documents first.</p>
              )}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={yearlyData} barGap={4} margin={{ top: 0, right: 5, bottom: 0, left: -15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Bar dataKey="revenue" name="Revenue (₹Cr)" fill="#3b82f6" radius={[5, 5, 0, 0]} />
                <Bar dataKey="profit"  name="Profit (₹Cr)"  fill="#22c55e" radius={[5, 5, 0, 0]} />
                <Bar dataKey="debt"    name="Debt (₹Cr)"    fill="#ef4444" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Risk Gauge */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col items-center justify-center">
          <h4 className="text-slate-900 font-semibold text-sm mb-1 self-start">Risk Score</h4>
          <p className="text-slate-400 text-xs mb-2 self-start">AI-computed composite risk score</p>
          <RiskGauge score={RISK_SCORE} />
          <div className="grid grid-cols-3 gap-2 w-full mt-3">
            {[['0–33', 'Low', 'bg-green-500'], ['34–66', 'Medium', 'bg-amber-500'], ['67–100', 'High', 'bg-red-500']].map(([range, lbl, bg]) => (
              <div key={lbl} className="text-center">
                <div className={`h-1 ${bg} rounded-full mb-1`}></div>
                <p className="text-[10px] text-slate-500">{range}</p>
                <p className="text-[10px] font-semibold text-slate-700">{lbl}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Profitability Metrics — from vector DB chart extraction */}
      {hasProfMetrics && (
        <div>
          <h4 className="text-slate-900 font-semibold text-sm mb-3 flex items-center gap-2">
            <Activity size={16} className="text-purple-500" /> Profitability & Liquidity Metrics
          </h4>
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {[
              { key: 'gross_margin_pct',  label: 'Gross Margin',       suffix: '%', bg: 'bg-emerald-50', clr: 'text-emerald-700', good: v => v >= 25 },
              { key: 'net_margin_pct',    label: 'Net Margin',         suffix: '%', bg: 'bg-blue-50',    clr: 'text-blue-700',    good: v => v >= 8  },
              { key: 'roe_pct',           label: 'Return on Equity',   suffix: '%', bg: 'bg-purple-50',  clr: 'text-purple-700',  good: v => v >= 15 },
              { key: 'current_ratio',     label: 'Current Ratio',      suffix: 'x', bg: 'bg-amber-50',   clr: 'text-amber-700',   good: v => v >= 1.5 },
              { key: 'de_ratio_num',      label: 'Debt / Equity',      suffix: 'x', bg: 'bg-red-50',     clr: 'text-red-700',     good: v => v <= 2.5 },
              { key: 'interest_coverage', label: 'Interest Coverage',  suffix: 'x', bg: 'bg-teal-50',    clr: 'text-teal-700',    good: v => v >= 3   },
            ].filter(m => profMetrics[m.key] != null).map(m => (
              <div key={m.key} className={`${m.bg} rounded-2xl p-4 text-center hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}>
                <p className="text-slate-500 text-xs font-medium mb-1">{m.label}</p>
                <p className={`text-2xl font-bold ${m.clr}`}>
                  {profMetrics[m.key].toFixed(m.suffix === '%' ? 1 : 2)}{m.suffix}
                </p>
                <p className={`text-[11px] mt-1.5 font-semibold ${m.good(profMetrics[m.key]) ? 'text-green-600' : 'text-red-500'}`}>
                  {m.good(profMetrics[m.key]) ? '✓ Healthy' : '⚠ Review needed'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Alerts */}
      <div>
        <h4 className="text-slate-900 font-semibold text-sm mb-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-500" /> Risk Alerts
          <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{alerts.filter(a => a.severity === 'high').length} High Priority</span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {alerts.map((a, i) => {
            const st = severityStyle[a.severity];
            return (
              <div key={i} className={`${st.bg} ${st.border} border rounded-2xl p-4 hover:shadow-md transition-all duration-200`}>
                <div className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0 mt-0.5">{a.icon || alertIcon(a.severity)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-slate-800 font-semibold text-sm">{a.title}</p>
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${st.badge}`}>{a.severity}</span>
                    </div>
                    <p className="text-slate-600 text-xs leading-relaxed">{a.body}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* Need Brain icon */
function Brain(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
    </svg>
  );
}
