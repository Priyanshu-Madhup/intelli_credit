import React, { useState, useEffect } from 'react';
import {
  FileText, AlertTriangle, Clock, CheckCircle,
  ArrowUpRight, ArrowDownRight, Plus,
  Building2, ChevronRight, Activity
} from 'lucide-react';
import {
  PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
  BarChart, Bar
} from 'recharts';

const stats = [
  { label: 'Total Applications', value: '247', change: '+12%', up: true,  icon: FileText,      bg: 'bg-blue-50',   iconBg: 'bg-blue-500',  ring: 'ring-blue-100',  text: 'text-blue-600',  sub: 'vs last month' },
  { label: 'High Risk Companies', value: '18',  change: '+3',   up: true,  icon: AlertTriangle, bg: 'bg-red-50',    iconBg: 'bg-red-500',   ring: 'ring-red-100',   text: 'text-red-600',   sub: 'need attention' },
  { label: 'Pending Reviews',     value: '34',  change: '-5',   up: false, icon: Clock,         bg: 'bg-amber-50',  iconBg: 'bg-amber-500', ring: 'ring-amber-100', text: 'text-amber-600', sub: 'since last week' },
  { label: 'Approved Loans',      value: '156', change: '+8%',  up: true,  icon: CheckCircle,   bg: 'bg-green-50',  iconBg: 'bg-green-500', ring: 'ring-green-100', text: 'text-green-600', sub: '78% approval rate' },
];

const riskData = [
  { name: 'Low Risk',      value: 110, color: '#22c55e' },
  { name: 'Medium Risk',   value: 74,  color: '#f59e0b' },
  { name: 'High Risk',     value: 37,  color: '#ef4444' },
  { name: 'Under Review',  value: 26,  color: '#94a3b8' },
];

const monthlyData = [
  { month: 'Aug', apps: 32, approved: 24 },
  { month: 'Sep', apps: 41, approved: 31 },
  { month: 'Oct', apps: 38, approved: 28 },
  { month: 'Nov', apps: 45, approved: 36 },
  { month: 'Dec', apps: 52, approved: 41 },
  { month: 'Jan', apps: 39, approved: 30 },
];

const recentCompanies = [
  { name: 'Technovate Solutions Pvt Ltd', sector: 'Technology',    score: 72, amount: '₹4.5 Cr',  status: 'High Risk',   date: 'Jan 8' },
  { name: 'Greenfield Agro Industries',   sector: 'Agriculture',   score: 34, amount: '₹2.1 Cr',  status: 'Low Risk',    date: 'Jan 7' },
  { name: 'Horizon Infrastructure Ltd',   sector: 'Construction',  score: 58, amount: '₹12 Cr',   status: 'Medium Risk', date: 'Jan 6' },
  { name: 'Apex Pharma Solutions',        sector: 'Pharma',        score: 81, amount: '₹7.8 Cr',  status: 'High Risk',   date: 'Jan 5' },
  { name: 'Prime Textile Mills',          sector: 'Manufacturing', score: 29, amount: '₹3.2 Cr',  status: 'Low Risk',    date: 'Jan 4' },
];

const statusStyles = {
  'Low Risk':    { bg: 'bg-green-100', text: 'text-green-700' },
  'Medium Risk': { bg: 'bg-amber-100', text: 'text-amber-700' },
  'High Risk':   { bg: 'bg-red-100',   text: 'text-red-700'   },
};

const scoreColor = (s) => s < 40 ? 'text-green-600' : s < 70 ? 'text-amber-600' : 'text-red-600';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-xl text-xs">
        <p className="font-semibold text-slate-700 mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-bold">{p.value}</span></p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Dashboard({ onNavigate }) {
  const [lastAssessment, setLastAssessment] = useState(null);
  const [lastCompany, setLastCompany]       = useState(null);
  const [history, setHistory]               = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ic_assessment');
      const co  = localStorage.getItem('ic_company');
      const hist = localStorage.getItem('ic_history');
      if (raw)  setLastAssessment(JSON.parse(raw));
      if (co)   setLastCompany(JSON.parse(co));
      if (hist) setHistory(JSON.parse(hist));
    } catch (_) {}
  }, []);

  const riskLabel = (score) => score >= 70 ? 'High Risk' : score >= 40 ? 'Medium Risk' : 'Low Risk';

  const liveRow = lastAssessment && lastCompany ? [{
    name:   lastCompany.name,
    sector: lastCompany.sector,
    score:  lastAssessment.risk_score ?? 0,
    amount: lastAssessment.recommended_loan_cr != null ? `₹${lastAssessment.recommended_loan_cr} Cr` : '—',
    status: riskLabel(lastAssessment.risk_score ?? 0),
    date:   'Today',
  }] : [];

  // Use real assessment history for the table, fall back to static demo data
  const allCompanies = history.length > 0
    ? history.slice(0, 6)
    : [...liveRow, ...recentCompanies].slice(0, 6);

  // Compute live risk distribution from history (fall back to static when not enough data)
  const liveRiskData = history.length >= 2 ? [
    { name: 'Low Risk',    value: history.filter(c => c.score < 40).length,                    color: '#22c55e' },
    { name: 'Medium Risk', value: history.filter(c => c.score >= 40 && c.score < 70).length,  color: '#f59e0b' },
    { name: 'High Risk',   value: history.filter(c => c.score >= 70).length,                   color: '#ef4444' },
  ].filter(d => d.value > 0) : riskData;

  // Score history bar chart (last 8 assessments, oldest first)
  const scoreHistory = history.length > 0
    ? [...history].reverse().slice(-8).map(h => ({
        name:  h.name.split(' ')[0],
        score: h.score,
        fill:  h.score >= 70 ? '#ef4444' : h.score >= 40 ? '#f59e0b' : '#22c55e',
      }))
    : null;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-slate-900 font-bold text-xl">Credit Portfolio Dashboard</h3>
          <p className="text-slate-500 text-sm mt-0.5">{lastCompany ? `Last assessment: ${lastCompany.name}` : "Upload documents to run your first assessment."}</p>
        </div>
        <button
          onClick={() => onNavigate('assessment')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 active:translate-y-0"
        >
          <Plus size={16} />
          Start New Assessment
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`${s.bg} ${s.ring} ring-1 rounded-2xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer`}>
              <div className="flex items-start justify-between mb-4">
                <div className={`${s.iconBg} w-10 h-10 rounded-xl flex items-center justify-center shadow-sm`}>
                  <Icon size={18} className="text-white" />
                </div>
                <span className={`flex items-center gap-0.5 text-xs font-semibold ${s.up ? 'text-green-600' : 'text-red-600'}`}>
                  {s.up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {s.change}
                </span>
              </div>
              <p className="text-slate-500 text-xs font-medium mb-1">{s.label}</p>
              <p className="text-3xl font-bold text-slate-900 leading-none">{s.value}</p>
              <p className={`text-xs mt-1.5 font-medium ${s.text}`}>{s.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Score History or Applications Trend (takes 3/5) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h4 className="text-slate-900 font-semibold text-sm">
                {scoreHistory ? 'Credit Score History' : 'Applications Trend'}
              </h4>
              <p className="text-slate-400 text-xs mt-0.5">
                {scoreHistory ? 'Risk scores of assessed companies (low → high risk)' : 'Applications vs Approvals — last 6 months'}
              </p>
            </div>
            {scoreHistory && (
              <div className="flex items-center gap-3 text-xs">
                {[['bg-green-500', 'Low'], ['bg-amber-500', 'Medium'], ['bg-red-500', 'High']].map(([bg, lbl]) => (
                  <span key={lbl} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${bg} inline-block`}></span>
                    <span className="text-slate-500">{lbl}</span>
                  </span>
                ))}
              </div>
            )}
            {!scoreHistory && (
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                  <span className="text-slate-500">Applications</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span>
                  <span className="text-slate-500">Approved</span>
                </span>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={190}>
            {scoreHistory ? (
              <BarChart data={scoreHistory} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                  formatter={(v) => [`${v} / 100`, 'Risk Score']}
                />
                <Bar dataKey="score" name="Risk Score" radius={[5, 5, 0, 0]} isAnimationActive>
                  {scoreHistory.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <AreaChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                <defs>
                  <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="apps" name="Applications" stroke="#3b82f6" strokeWidth={2.5} fill="url(#blueGrad)" dot={false} />
                <Area type="monotone" dataKey="approved" name="Approved" stroke="#22c55e" strokeWidth={2.5} fill="url(#greenGrad)" dot={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Risk distribution (takes 2/5) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="mb-4">
            <h4 className="text-slate-900 font-semibold text-sm">Risk Distribution</h4>
            <p className="text-slate-400 text-xs mt-0.5">Current portfolio breakdown</p>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={liveRiskData} cx="50%" cy="50%" innerRadius={45} outerRadius={68} paddingAngle={3} dataKey="value" strokeWidth={0}>
                {liveRiskData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {liveRiskData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }}></span>
                  <span className="text-slate-600">{d.name}</span>
                </div>
                <span className="font-semibold text-slate-800">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent companies table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-blue-500" />
            <h4 className="text-slate-900 font-semibold text-sm">Recent Company Analyses</h4>
          </div>
          <button className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 hover:gap-1.5 transition-all">
            View all <ChevronRight size={13} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Company</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Sector</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Risk Score</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Loan Amount</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 hidden xl:table-cell">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {allCompanies.map((c, i) => {
                const ss = statusStyles[c.status];
                return (
                  <tr key={i} className="hover:bg-slate-50/70 transition-colors group cursor-pointer">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0">
                          <Building2 size={14} className="text-slate-500" />
                        </div>
                        <span className="text-slate-800 text-sm font-medium group-hover:text-blue-600 transition-colors">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className="text-slate-500 text-sm">{c.sector}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${c.score < 40 ? 'bg-green-500' : c.score < 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${c.score}%` }}></div>
                        </div>
                        <span className={`text-sm font-bold ${scoreColor(c.score)}`}>{c.score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <span className="text-slate-700 text-sm font-medium">{c.amount}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold ${ss.bg} ${ss.text}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 hidden xl:table-cell">
                      <span className="text-slate-400 text-xs">{c.date}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Action CTA */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 flex items-center justify-between shadow-lg shadow-blue-500/20">
        <div>
          <h4 className="text-white font-bold text-base">Ready to assess a new company?</h4>
          <p className="text-blue-100 text-sm mt-1">Upload documents and get an AI-powered credit appraisal in minutes.</p>
        </div>
        <button
          onClick={() => onNavigate('assessment')}
          className="flex items-center gap-2 bg-white text-blue-700 hover:bg-blue-50 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md hover:-translate-y-0.5 flex-shrink-0 ml-4"
        >
          <Plus size={15} />
          Start Assessment
        </button>
      </div>
    </div>
  );
}
