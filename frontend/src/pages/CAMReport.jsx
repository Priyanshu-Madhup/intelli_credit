import React, { useState, useEffect } from 'react';
import {
  Download, ChevronDown, ChevronUp, Building2,
  Users, BarChart2, AlertTriangle, Award, Printer, Share2,
  ClipboardList, Globe
} from 'lucide-react';

const riskLevelStyle = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-green-100 text-green-700',
  High:   'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low:    'bg-green-100 text-green-700',
};

/* Map a 0-100 risk score to a text label */
function riskLabel(score) {
  if (score >= 70) return 'HIGH RISK';
  if (score >= 40) return 'MEDIUM RISK';
  return 'LOW RISK';
}

/* Format a number as ₹X Cr string, or return fallback */
function fmtCr(val, fallback = '—') {
  if (val == null) return fallback;
  return `₹${val} Cr`;
}

export default function CAMReport() {
  const [open, setOpen] = useState({ company: true, financial: false, risk: false, primary: false, recommendation: false });
  const [a, setA] = useState(null);   // assessment
  const [co, setCo] = useState(null); // company meta
  const [primaryNotes, setPrimaryNotes] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ic_assessment');
      const c   = localStorage.getItem('ic_company');
      const pn  = localStorage.getItem('ic_primary_notes');
      if (raw) setA(JSON.parse(raw));
      if (c)   setCo(JSON.parse(c));
      if (pn)  setPrimaryNotes(JSON.parse(pn));
    } catch (_) {}
  }, []);

  const toggle = (id) => setOpen(prev => ({ ...prev, [id]: !prev[id] }));

  const companyName  = co?.name      ?? a?.company_name ?? '—';
  const sector       = co?.sector    ?? a?.sector       ?? '—';
  const location     = co?.location  ?? '—';
  const decision     = a?.decision   ?? '—';
  const riskScore    = a?.risk_score ?? '—';
  const rawRecLoan   = a?.recommended_loan_cr;
  const rawReqLoan   = a?.requested_loan_cr;
  const safeRecLoan  = rawRecLoan != null && rawReqLoan != null && rawRecLoan > rawReqLoan * 5
    ? Math.round(rawReqLoan * 0.8 * 100) / 100
    : rawRecLoan;
  const recLoan      = fmtCr(safeRecLoan);
  const reqLoan      = fmtCr(rawReqLoan);
  const interest     = a?.interest_rate_pct != null ? `${a.interest_rate_pct}% per annum` : '—';
  const tenor        = a?.tenor_months != null ? `${a.tenor_months} months` : '—';
  const conditions   = a?.conditions  ?? [];
  const alerts       = a?.risk_alerts ?? [];
  const fo           = a?.financial_overview ?? {};
  const sb           = a?.score_breakdown    ?? {};
  const reasoning    = a?.reasoning ?? '';
  const reportDate   = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const reportTime   = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  /* Build yearly trend table rows from a.yearly_trend or fallback to fo values */
  const yearlyTrend = a?.yearly_trend ?? [];

  /* Score breakdown rows */
  const scoreFields = [
    { key: 'financial_health',    label: 'Financial Health'    },
    { key: 'repayment_history',   label: 'Repayment History'   },
    { key: 'collateral_coverage', label: 'Collateral Coverage' },
    { key: 'management_quality',  label: 'Management Quality'  },
    { key: 'market_position',     label: 'Market Position'     },
  ];

  const noData = !a;

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">CAM Report</span>
            <span className="text-xs text-slate-400">Draft • {reportDate}</span>
          </div>
          <h3 className="text-slate-900 font-bold text-xl">Credit Appraisal Memorandum</h3>
          <p className="text-slate-500 text-sm mt-0.5">
            {noData ? 'No assessment data — run an assessment first.' : `${companyName} — Loan Proposal ${reqLoan}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all">
            <Printer size={13} /> Print
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all">
            <Share2 size={13} /> Share
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl transition-all shadow-md shadow-blue-500/20 hover:-translate-y-0.5">
            <Download size={15} /> Download PDF
          </button>
        </div>
      </div>

      {/* Report meta bar */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 text-white">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {[
            ['Company',  companyName],
            ['Sector',   sector],
            ['Location', location],
            ['Date',     reportDate],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-slate-400 text-[10px] uppercase tracking-widest mb-1">{k}</p>
              <p className="text-white font-semibold text-sm">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {noData && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
          <p className="text-amber-800 font-semibold">No assessment found.</p>
          <p className="text-amber-600 text-sm mt-1">Please run a credit assessment first, then come back here.</p>
        </div>
      )}

      {/* ── Accordion sections ─────────────────────────── */}
      {!noData && (
        <div className="space-y-3">

          {/* 1. Company Overview */}
          <AccordionSection id="company" open={open} toggle={toggle} icon={Building2} color="bg-blue-500" title="1. Company Overview">
            <KeyValueGrid rows={[
              { label: 'Company Name',     value: companyName },
              { label: 'Sector / Industry',value: sector },
              { label: 'Location',         value: location },
              { label: 'Loan Requested',   value: reqLoan },
              { label: 'Loan Recommended', value: recLoan },
              { label: 'Decision',         value: decision.charAt(0).toUpperCase() + decision.slice(1) },
            ]} />
          </AccordionSection>

          {/* 2. Financial Analysis */}
          <AccordionSection id="financial" open={open} toggle={toggle} icon={BarChart2} color="bg-green-500" title="2. Financial Analysis">
            <div className="space-y-4">
              {/* Overview snapshot */}
              <KeyValueGrid rows={[
                { label: 'Annual Revenue',    value: fo.annual_revenue    ?? '—' },
                { label: 'Revenue Trend',     value: fo.annual_revenue_delta ? `${fo.annual_revenue_delta} (${fo.annual_revenue_trend ?? ''})` : '—' },
                { label: 'Net Profit',        value: fo.net_profit        ?? '—' },
                { label: 'Net Profit Margin', value: fo.net_profit_margin ?? '—' },
                { label: 'Total Debt',        value: fo.total_debt        ?? '—' },
                { label: 'Debt / Equity',     value: fo.de_ratio          ?? '—' },
                { label: 'GST Turnover',      value: fo.gst_turnover      ?? '—' },
              ]} />

              {/* Yearly trend table */}
              {yearlyTrend.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-100 mt-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        {['Year', 'Revenue (Cr)', 'Profit (Cr)', 'Debt (Cr)'].map(h => (
                          <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 border-b border-slate-100">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {yearlyTrend.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                          <td className="px-4 py-2.5 text-slate-700 font-medium">{row.year}</td>
                          <td className="px-4 py-2.5 text-slate-600 text-right">{row.revenue ?? '—'}</td>
                          <td className="px-4 py-2.5 text-slate-600 text-right">{row.profit  ?? '—'}</td>
                          <td className="px-4 py-2.5 text-slate-600 text-right">{row.debt    ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Score breakdown */}
              {Object.keys(sb).length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Credit Score Breakdown</p>
                  {scoreFields.map(f => {
                    const score = sb[f.key]?.score ?? 0;
                    const wt    = sb[f.key]?.weight_pct ?? '—';
                    const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-400';
                    return (
                      <div key={f.key} className="flex items-center gap-3">
                        <span className="text-xs text-slate-600 w-40 flex-shrink-0">{f.label} ({wt}%)</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
                        </div>
                        <span className="text-xs font-bold text-slate-700 w-8 text-right">{score}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </AccordionSection>

          {/* 3. Risk Assessment */}
          <AccordionSection id="risk" open={open} toggle={toggle} icon={AlertTriangle} color="bg-amber-500" title="3. Risk Assessment">
            {alerts.length > 0 ? (
              <div className="space-y-2">
                {alerts.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                    <span className={`flex-shrink-0 mt-0.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full capitalize ${riskLevelStyle[r.severity] ?? 'bg-slate-100 text-slate-700'}`}>
                      {r.severity}
                    </span>
                    <div>
                      <p className="text-slate-800 text-sm font-semibold leading-none mb-0.5">{r.title}</p>
                      <p className="text-slate-500 text-xs leading-relaxed">{r.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-sm">No risk alerts in the assessment.</p>
            )}
          </AccordionSection>

          {/* 3b. Primary Due Diligence Notes */}
          {primaryNotes.length > 0 && (
            <AccordionSection id="primary" open={open} toggle={toggle} icon={ClipboardList} color="bg-emerald-500" title="3b. Primary Due Diligence Notes">
              <div className="space-y-3">
                <p className="text-xs text-slate-400 mb-2">Qualitative observations from site visits, management interviews, and field due diligence.</p>
                {primaryNotes.map((note, i) => {
                  const typeLabels = { site_visit: 'Site Visit', management_interview: 'Management Interview', market_feedback: 'Market Feedback', operational: 'Operational', other: 'Other' };
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                      <span className="flex-shrink-0 mt-0.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        {typeLabels[note.type] || note.type}
                      </span>
                      <p className="text-slate-700 text-sm leading-relaxed">{note.text}</p>
                    </div>
                  );
                })}
              </div>
            </AccordionSection>
          )}

          {/* 4. Final Recommendation */}
          <AccordionSection id="recommendation" open={open} toggle={toggle} icon={Award} color="bg-blue-600" title="4. Final Recommendation">
            <div className="space-y-4">
              <KeyValueGrid rows={[
                { label: 'Decision',             value: decision.charAt(0).toUpperCase() + decision.slice(1) },
                { label: 'Recommended Amount',   value: recLoan },
                { label: 'Interest Rate',        value: interest },
                { label: 'Tenor',                value: tenor },
                { label: 'Composite Risk Score', value: `${riskScore}/100 — ${riskLabel(riskScore)}` },
              ]} />

              {conditions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-3">Conditions</p>
                  <ul className="space-y-1.5">
                    {conditions.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {reasoning && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-3">AI Reasoning</p>
                  <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">{reasoning}</p>
                </div>
              )}
            </div>
          </AccordionSection>

        </div>
      )}

      {/* Footer */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
        <p className="text-slate-500 text-xs">
          This Credit Appraisal Memorandum (CAM) is generated by the Intelli-Credit AI platform and is intended for internal use only.
          Final credit decisions are subject to review by the Credit Committee as per applicable banking guidelines.
        </p>
        <p className="text-slate-400 text-[11px] mt-1">Intelli-Credit v2.1 • Generated: {reportDate} {reportTime} IST</p>
      </div>
    </div>
  );
}

/* ── Shared sub-components ─────────────────────────────────────────────── */

function AccordionSection({ id, open, toggle, icon: Icon, color, title, children }) {
  const isOpen = open[id];
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
        onClick={() => toggle(id)}
      >
        <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
          <Icon size={17} className="text-white" />
        </div>
        <h4 className="text-slate-900 font-semibold text-sm flex-1">{title}</h4>
        {isOpen ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />}
      </button>
      {isOpen && (
        <div className="px-5 pb-5 border-t border-slate-50">
          <div className="mt-4">{children}</div>
        </div>
      )}
    </div>
  );
}

function KeyValueGrid({ rows }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex flex-col">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{label}</span>
          <span className="text-slate-800 text-sm font-medium">{value ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}

