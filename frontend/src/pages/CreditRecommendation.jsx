import React, { useState, useEffect } from 'react';
import {
  Award, CheckCircle, XCircle, DollarSign, Percent, AlertTriangle,
  TrendingUp, FileText, ChevronDown, ChevronUp, Download, ChevronRight
} from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip
} from 'recharts';

const decisionConfig = {
  approved:    { label: 'Approved',             icon: CheckCircle,  gradient: 'from-green-500 to-emerald-600', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badgeBg: 'bg-green-100', badgeText: 'text-green-800' },
  conditional: { label: 'Conditional Approval', icon: AlertTriangle, gradient: 'from-amber-500 to-orange-500', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badgeBg: 'bg-amber-100', badgeText: 'text-amber-800' },
  rejected:    { label: 'Rejected',             icon: XCircle,      gradient: 'from-red-500 to-rose-600',     bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-700',   badgeBg: 'bg-red-100',   badgeText: 'text-red-800'  },
};

const statusBar = { good: 'bg-green-500', medium: 'bg-amber-500', low: 'bg-red-400' };

function scoreStatus(score) {
  if (score >= 70) return 'good';
  if (score >= 50) return 'medium';
  return 'low';
}

const SCORE_FIELDS = [
  { key: 'financial_health',    label: 'Financial Health',    weight: '30%' },
  { key: 'repayment_history',   label: 'Repayment History',   weight: '25%' },
  { key: 'collateral_coverage', label: 'Collateral Coverage', weight: '20%' },
  { key: 'management_quality',  label: 'Management Quality',  weight: '15%' },
  { key: 'market_position',     label: 'Market Position',     weight: '10%' },
];

export default function CreditRecommendation({ onNavigate }) {
  const [expanded, setExpanded] = useState(false);
  const [assessment, setAssessment] = useState(null);
  const [company, setCompany] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ic_assessment');
      const co  = localStorage.getItem('ic_company');
      if (raw) setAssessment(JSON.parse(raw));
      if (co)  setCompany(JSON.parse(co));
    } catch (_) {}
  }, []);

  // Derive values from assessment or fall back to empty defaults
  const RISK_SCORE  = assessment?.risk_score ?? '—';
  const DECISION    = assessment?.decision   ?? 'conditional';
  const conditions  = assessment?.conditions ?? [];
  const aiReasoning = assessment?.reasoning  ?? 'No reasoning available yet. Upload documents and run an assessment first.';
  const scoreBreakdown = assessment?.score_breakdown ?? {};
  const companyName = company?.name ?? assessment?.company_name ?? 'Company';
  const sectorLabel = company?.sector ?? assessment?.sector ?? '';
  const loanRec     = assessment?.recommended_loan_cr != null ? `₹${assessment.recommended_loan_cr} Cr` : '—';
  const loanReq     = assessment?.requested_loan_cr   != null ? assessment.requested_loan_cr : null;
  const loanPct     = loanReq && assessment?.recommended_loan_cr
    ? `${Math.round((assessment.recommended_loan_cr / loanReq) * 100)}% of requested`
    : '';
  const interest    = assessment?.interest_rate_pct != null ? `${assessment.interest_rate_pct}%` : '—';
  const tenor       = assessment?.tenor_months != null ? `${assessment.tenor_months} months` : '—';

  const scoreItems = SCORE_FIELDS.map(f => {
    const s = scoreBreakdown[f.key]?.score ?? 0;
    return { label: f.label, score: s, max: 100, weight: f.weight, status: scoreStatus(s) };
  });

  const dc = decisionConfig[DECISION] ?? decisionConfig.conditional;
  const DecisionIcon = dc.icon;

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      {/* Decision banner */}
      <div className={`rounded-2xl bg-gradient-to-r ${dc.gradient} p-6 shadow-lg`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <DecisionIcon size={28} className="text-white" />
            </div>
            <div>
              <p className="text-white/80 text-xs font-semibold uppercase tracking-widest mb-0.5">AI Credit Decision</p>
              <h3 className="text-white font-bold text-2xl">{dc.label}</h3>
              <p className="text-white/70 text-sm mt-0.5">{companyName}{sectorLabel ? ` • ${sectorLabel}` : ''}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => onNavigate('report')}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-sm font-semibold rounded-xl transition-all"
            >
              <FileText size={15} /> View CAM Report
            </button>
            <button className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 hover:bg-slate-50 text-sm font-bold rounded-xl transition-all shadow-md">
              <Download size={15} /> Download PDF
            </button>
          </div>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: 'Risk Score',               value: `${RISK_SCORE}/100`,  sub: 'Composite Risk Score',  icon: Award,       bg: 'bg-amber-50',  text: 'text-amber-700'  },
          { label: 'Recommended Loan Amount',  value: loanRec,              sub: loanPct || 'of requested', icon: DollarSign,  bg: 'bg-blue-50',   text: 'text-blue-700'   },
          { label: 'Suggested Interest Rate',  value: interest,             sub: 'p.a. (risk-adjusted)',  icon: Percent,     bg: 'bg-indigo-50', text: 'text-indigo-700' },
          { label: 'Recommended Tenor',        value: tenor,                sub: 'with quarterly review', icon: TrendingUp,  bg: 'bg-green-50',  text: 'text-green-700'  },
        ].map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className={`${m.bg} rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}>
              <div className={`w-9 h-9 rounded-xl bg-white/60 flex items-center justify-center mb-3`}>
                <Icon size={18} className={m.text} />
              </div>
              <p className="text-slate-500 text-xs font-medium leading-tight">{m.label}</p>
              <p className={`text-2xl font-bold mt-0.5 leading-none ${m.text}`}>{m.value}</p>
              <p className="text-slate-400 text-[11px] mt-1">{m.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Score breakdown + Conditions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Score breakdown */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h4 className="text-slate-900 font-semibold text-sm mb-4 flex items-center gap-2">
            <Award size={15} className="text-blue-500" /> Score Breakdown
          </h4>
          {/* Radar chart */}
          {scoreItems.some(i => i.score > 0) && (
            <ResponsiveContainer width="100%" height={210}>
              <RadarChart
                data={scoreItems.map(i => ({
                  subject: i.label.split(' ')[0],
                  score: i.score,
                  fullMark: 100,
                }))}
                margin={{ top: 4, right: 24, bottom: 4, left: 24 }}
              >
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.2}
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                  formatter={(v) => [`${v} / 100`, 'Score']}
                />
              </RadarChart>
            </ResponsiveContainer>
          )}
          <div className="space-y-3.5 mt-2">
            {scoreItems.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-700 font-medium">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">{item.weight}</span>
                    <span className={`font-bold ${item.status === 'good' ? 'text-green-600' : item.status === 'medium' ? 'text-amber-600' : 'text-red-600'}`}>{item.score}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${statusBar[item.status]}`}
                    style={{ width: `${item.score}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Conditions */}
        <div className={`${dc.bg} ${dc.border} border rounded-2xl p-5`}>
          <h4 className="text-slate-900 font-semibold text-sm mb-4 flex items-center gap-2">
            <AlertTriangle size={15} className={dc.text} /> Loan Conditions
          </h4>
          <div className="space-y-2.5">
            {conditions.map((c, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className={`w-5 h-5 rounded-full flex-shrink-0 mt-0.5 ${dc.badgeBg} flex items-center justify-center`}>
                  <span className={`text-[10px] font-bold ${dc.badgeText}`}>{i + 1}</span>
                </div>
                <p className="text-slate-700 text-xs leading-relaxed">{c}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Explanation */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <button
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <span className="text-white text-sm">🤖</span>
            </div>
            <div>
              <h4 className="text-slate-900 font-semibold text-sm">AI Reasoning & Explanation</h4>
              <p className="text-slate-400 text-xs">Detailed rationale behind the credit decision</p>
            </div>
          </div>
          {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>
        {expanded && (
          <div className="px-5 pb-5 border-t border-slate-50">
            <div className="mt-4 p-4 bg-slate-50 rounded-xl">
              <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">{aiReasoning}</p>
            </div>
            <div className="flex items-center justify-between mt-4">
              <p className="text-slate-400 text-xs">Model: IntelliCredit-v2.1 • Accuracy: 94.2% on historical data</p>
              <button
                onClick={() => onNavigate('report')}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-semibold"
              >
                Full CAM Report <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
