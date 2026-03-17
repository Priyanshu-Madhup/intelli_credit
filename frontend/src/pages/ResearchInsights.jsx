import React, { useState, useEffect } from 'react';
import { Globe, Clock, Filter, RefreshCw, Search, Loader } from 'lucide-react';
import { queryDocuments } from '../api';

const riskTagStyle = {
  High:   { bg: 'bg-red-100',   text: 'text-red-700',   dot: 'bg-red-500'   },
  Medium: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  Low:    { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
};

const INSIGHT_QUERIES = [
  { question: 'What are the key revenue figures, profit margins, and overall financial performance?',     category: 'Financial',      icon: '📊' },
  { question: 'Are there any GST discrepancies, tax compliance issues, or regulatory violations?',         category: 'Regulatory',     icon: '⚠️' },
  { question: 'What is the litigation history, legal disputes, or court notices in the documents?',        category: 'Legal',          icon: '⚖️' },
  { question: 'What is the loan repayment history, NPA status, prior defaults or credit delinquencies?',  category: 'Credit History', icon: '🏦' },
  { question: 'What are the main business risks, market challenges, or operational concerns?',             category: 'Risk',           icon: '📉' },
  { question: 'What is the collateral, asset base, and security offered by the company?',                 category: 'Collateral',     icon: '🏢' },
];

const HIGH_RISK_KW   = ['default', 'npa', 'violation', 'fraud', 'penalty', 'seized', 'litigation', 'court', 'legal notice', 'non-performing', 'overdue', 'criminal'];
const MEDIUM_RISK_KW = ['discrepancy', 'delayed', 'concern', 'irregular', 'compliance', 'mismatch', 'issue', 'risk', 'challenge', 'weak', 'declining'];

function inferRisk(text) {
  const lower = text.toLowerCase();
  if (HIGH_RISK_KW.some(k => lower.includes(k)))   return 'High';
  if (MEDIUM_RISK_KW.some(k => lower.includes(k))) return 'Medium';
  return 'Low';
}

function shortSummary(text) {
  if (text.length <= 320) return text;
  const cut = text.substring(0, 320);
  return cut.substring(0, cut.lastIndexOf(' ')) + '…';
}

const categories = ['All', 'Financial', 'Regulatory', 'Legal', 'Credit History', 'Risk', 'Collateral'];

export default function ResearchInsights() {
  const [activeTag,      setActiveTag]      = useState('All');
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQ,        setSearchQ]        = useState('');
  const [insights,       setInsights]       = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [noDocMsg,       setNoDocMsg]       = useState('');
  const [company,        setCompany]        = useState(null);

  const loadInsights = async () => {
    setLoading(true);
    setNoDocMsg('');
    setInsights([]);
    const results = [];
    for (const q of INSIGHT_QUERIES) {
      try {
        const res    = await queryDocuments(q.question);
        const answer = res.answer || '';
        if (answer.toLowerCase().includes('no indexed documents')) {
          setNoDocMsg('No documents uploaded yet. Run a credit assessment first to see document-based insights here.');
          setLoading(false);
          return;
        }
        results.push({
          category: q.category,
          icon:     q.icon,
          title:    `${q.category} Insight`,
          summary:  shortSummary(answer),
          tag:      inferRisk(answer),
          source:   'Document (RAG)',
          time:     'Just now',
        });
      } catch (_) { /* skip failed queries */ }
    }
    setInsights(results);
    setLoading(false);
  };

  useEffect(() => {
    try {
      const co = localStorage.getItem('ic_company');
      if (co) setCompany(JSON.parse(co));
    } catch (_) {}
    loadInsights();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = insights.filter(a => {
    const matchTag = activeTag === 'All' || a.tag === activeTag;
    const matchCat = activeCategory === 'All' || a.category === activeCategory;
    const matchQ   = !searchQ || a.title.toLowerCase().includes(searchQ.toLowerCase()) || a.summary.toLowerCase().includes(searchQ.toLowerCase());
    return matchTag && matchCat && matchQ;
  });

  const counts = {
    High:   insights.filter(a => a.tag === 'High').length,
    Medium: insights.filter(a => a.tag === 'Medium').length,
    Low:    insights.filter(a => a.tag === 'Low').length,
  };

  let companyLabel = 'Company';
  if (company?.name) {
    companyLabel = company.name;
  } else {
    try { companyLabel = JSON.parse(localStorage.getItem('ic_assessment') || '{}')?.company_name || 'Company'; } catch (_) {}
  }

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe size={14} className="text-blue-500" />
            <span className="text-xs font-semibold text-slate-500">Document Intelligence • {companyLabel}</span>
          </div>
          <h3 className="text-slate-900 font-bold text-xl">Research Insights</h3>
        </div>
        <button
          onClick={loadInsights}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all disabled:opacity-50"
        >
          {loading ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />} {loading ? 'Analyzing…' : 'Refresh'}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8 text-center">
          <Loader size={28} className="text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-blue-700 font-semibold text-sm">Running AI document analysis…</p>
          <p className="text-blue-500 text-xs mt-1">Querying {INSIGHT_QUERIES.length} risk dimensions from indexed documents</p>
        </div>
      )}

      {/* No docs message */}
      {!loading && noDocMsg && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
          <p className="text-amber-800 font-semibold text-sm">{noDocMsg}</p>
        </div>
      )}

      {/* Results */}
      {!loading && insights.length > 0 && (
        <>
          {/* Risk summary pills */}
          <div className="flex items-center flex-wrap gap-3">
            <span className="text-xs font-semibold text-slate-500 mr-1">Risk Summary:</span>
            {Object.entries(counts).map(([tag, count]) => {
              const st = riskTagStyle[tag];
              return (
                <span key={tag} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${st.bg} ${st.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`}></span>
                  {count} {tag} Risk
                </span>
              );
            })}
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search insights…"
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1 text-xs text-slate-500 font-medium mr-1">
                <Filter size={12} /> Risk:
              </div>
              {['All', 'High', 'Medium', 'Low'].map(t => (
                <button
                  key={t}
                  onClick={() => setActiveTag(t)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    activeTag === t
                      ? t === 'High' ? 'bg-red-500 text-white' : t === 'Medium' ? 'bg-amber-500 text-white' : t === 'Low' ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {t}
                </button>
              ))}
              <div className="flex items-center gap-1 text-xs text-slate-500 font-medium mx-1">| Category:</div>
              {categories.map(c => (
                <button
                  key={c}
                  onClick={() => setActiveCategory(c)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${activeCategory === c ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-500">{filtered.length} insight{filtered.length !== 1 ? 's' : ''} found</p>

          {/* Insight cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((a, i) => {
              const st = riskTagStyle[a.tag];
              return (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{a.icon}</span>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{a.category}</span>
                    </div>
                    <span className={`flex-shrink-0 flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`}></span>
                      {a.tag} Risk
                    </span>
                  </div>
                  <h5 className="text-slate-900 font-semibold text-sm leading-snug mb-2">{a.title}</h5>
                  <p className="text-slate-500 text-xs leading-relaxed mb-4">{a.summary}</p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Globe size={11} />
                      <span className="font-medium text-slate-600">{a.source}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock size={11} />
                      <span>{a.time}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
              <Globe size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium text-sm">No insights match your filters</p>
              <button onClick={() => { setActiveTag('All'); setActiveCategory('All'); setSearchQ(''); }} className="mt-3 text-xs text-blue-600 hover:underline">Clear filters</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
