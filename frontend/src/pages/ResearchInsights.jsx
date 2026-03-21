import React, { useState, useEffect } from 'react';
import {
  Globe, Clock, Filter, RefreshCw, Search, Loader, ExternalLink,
  Newspaper, Scale, FileText, TrendingUp, Users, Building2,
  AlertTriangle, ChevronDown, ChevronUp, Zap, BookOpen, Send
} from 'lucide-react';
import { fetchDocInsights, runFullResearch, customWebSearch, synthesizeResearch } from '../api';

/* ── risk helpers ── */
const riskTagStyle = {
  High:   { bg: 'bg-red-100',   text: 'text-red-700',   dot: 'bg-red-500',   border: 'border-red-200' },
  Medium: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-amber-200' },
  Low:    { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500', border: 'border-green-200' },
};

const HIGH_RISK_KW   = ['default', 'npa', 'violation', 'fraud', 'penalty', 'seized', 'litigation', 'court', 'legal notice', 'non-performing', 'overdue', 'criminal', 'scam', 'arrest'];
const MEDIUM_RISK_KW = ['discrepancy', 'delayed', 'concern', 'irregular', 'compliance', 'mismatch', 'issue', 'risk', 'challenge', 'weak', 'declining', 'slowdown', 'cautious'];

function inferRisk(text) {
  const lower = (text || '').toLowerCase();
  if (HIGH_RISK_KW.some(k => lower.includes(k))) return 'High';
  if (MEDIUM_RISK_KW.some(k => lower.includes(k))) return 'Medium';
  return 'Low';
}

function shortSummary(text, max = 280) {
  if (!text) return '';
  if (text.length <= max) return text;
  const cut = text.substring(0, max);
  return cut.substring(0, cut.lastIndexOf(' ')) + '…';
}

/* Category icons */
const catIcons = {
  'Company News': Newspaper,
  'Financial': TrendingUp,
  'Litigation': Scale,
  'Regulatory': FileText,
  'Promoter': Users,
  'Sector': Building2,
  'Credit History': BookOpen,
  'Risk': AlertTriangle,
  'Collateral': Building2,
};

const docCategories = ['All', 'Financial', 'Regulatory', 'Legal', 'Credit History', 'Risk', 'Collateral'];
const webCategories = ['All', 'Company News', 'Financial', 'Litigation', 'Regulatory', 'Promoter', 'Sector'];

export default function ResearchInsights() {
  /* ── state ── */
  const [activeTab, setActiveTab] = useState('web'); // 'doc' or 'web'

  // document insights state
  const [docActiveTag, setDocActiveTag] = useState('All');
  const [docActiveCat, setDocActiveCat] = useState('All');
  const [docSearch, setDocSearch] = useState('');
  const [docInsights, setDocInsights] = useState([]);
  const [docLoading, setDocLoading] = useState(false);
  const [docNoMsg, setDocNoMsg] = useState('');

  // web research state
  const [webActiveTag, setWebActiveTag] = useState('All');
  const [webActiveCat, setWebActiveCat] = useState('All');
  const [webSearch, setWebSearch] = useState('');
  const [webInsights, setWebInsights] = useState([]);
  const [webRawResults, setWebRawResults] = useState({});
  const [webLoading, setWebLoading] = useState(false);
  const [webSynthLoading, setWebSynthLoading] = useState(false);
  const [webError, setWebError] = useState('');

  // custom search
  const [customQuery, setCustomQuery] = useState('');
  const [customResults, setCustomResults] = useState([]);
  const [customLoading, setCustomLoading] = useState(false);

  // company context
  const [company, setCompany] = useState(null);

  useEffect(() => {
    try {
      const co = localStorage.getItem('ic_company');
      if (co) setCompany(JSON.parse(co));
    } catch (_) {}
  }, []);

  const companyLabel = company?.name ||
    (() => { try { return JSON.parse(localStorage.getItem('ic_assessment') || '{}')?.company_name || ''; } catch (_) { return ''; } })();

  /* ── Document insights loader — 1 FAISS query + 1 LLM call ── */
  const loadDocInsights = async () => {
    setDocLoading(true);
    setDocNoMsg('');
    setDocInsights([]);
    try {
      const res = await fetchDocInsights();
      const insights = (res.insights || []).map(ins => ({
        category: ins.category || 'General',
        icon: ins.icon || '📄',
        title: `${ins.category || 'General'} Insight`,
        summary: ins.summary || '',
        tag: ins.severity || inferRisk(ins.summary || ''),
        source: 'Document (RAG)',
        time: 'Just now',
      }));
      if (insights.length === 0) {
        setDocNoMsg('No documents uploaded yet. Run a credit assessment first.');
      } else {
        setDocInsights(insights);
      }
    } catch (err) {
      if (err.message?.includes('No documents')) {
        setDocNoMsg('No documents uploaded yet. Run a credit assessment first.');
      } else {
        setDocNoMsg(err.message || 'Failed to load insights.');
      }
    }
    setDocLoading(false);
  };

  /* ── Web research loader ── */
  const loadWebResearch = async (name) => {
    const target = name || companyLabel;
    if (!target) {
      setWebError('Enter a company name or run an assessment first.');
      return;
    }
    setWebLoading(true);
    setWebError('');
    setWebInsights([]);
    setWebRawResults({});
    try {
      const res = await runFullResearch(target, company?.sector || '');
      setWebRawResults(res.results || {});

      // Auto-synthesize
      setWebSynthLoading(true);
      try {
        const synth = await synthesizeResearch(target, company?.sector || '', res.results || {});
        const insights = (synth.insights || []).map(ins => ({
          category: ins.category || 'Company News',
          title: ins.title || '',
          summary: ins.summary || '',
          tag: ins.severity || inferRisk(ins.summary || ''),
          source: ins.source || 'Web',
          time: 'Live',
        }));
        setWebInsights(insights);
      } catch (_) {
        // Fallback: create basic insights from raw results
        const fallback = [];
        for (const [cat, items] of Object.entries(res.results || {})) {
          const catLabel = { company_news: 'Company News', financial_intelligence: 'Financial', litigation: 'Litigation', regulatory_filings: 'Regulatory', promoter_background: 'Promoter', sector_trends: 'Sector' }[cat] || cat;
          for (const item of (items || []).slice(0, 3)) {
            fallback.push({
              category: catLabel,
              title: item.title || '',
              summary: shortSummary(item.snippet || '', 280),
              tag: inferRisk(item.snippet || item.title || ''),
              source: item.source || 'Web',
              time: item.date || 'Recent',
              link: item.link || '',
            });
          }
        }
        setWebInsights(fallback);
      }
      setWebSynthLoading(false);
    } catch (err) {
      setWebError(err.message || 'Web research failed');
    }
    setWebLoading(false);
  };

  /* ── Custom search ── */
  const handleCustomSearch = async () => {
    if (!customQuery.trim()) return;
    setCustomLoading(true);
    setCustomResults([]);
    try {
      const res = await customWebSearch(customQuery.trim());
      setCustomResults(res.results || []);
    } catch (err) {
      setCustomResults([{ title: 'Search failed', snippet: err.message, link: '', source: '', date: '' }]);
    }
    setCustomLoading(false);
  };

  /* ── Auto-load doc insights on first mount ONLY if an assessment already exists ── */
  useEffect(() => {
    const hasData = localStorage.getItem('ic_assessment');
    if (hasData) { loadDocInsights(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Filtering helpers ── */
  const filterList = (items, tag, cat, q) => items.filter(a => {
    const matchTag = tag === 'All' || a.tag === tag;
    const matchCat = cat === 'All' || a.category === cat;
    const matchQ = !q || (a.title + a.summary).toLowerCase().includes(q.toLowerCase());
    return matchTag && matchCat && matchQ;
  });

  const filteredDoc = filterList(docInsights, docActiveTag, docActiveCat, docSearch);
  const filteredWeb = filterList(webInsights, webActiveTag, webActiveCat, webSearch);

  const countRisks = (items) => ({
    High: items.filter(a => a.tag === 'High').length,
    Medium: items.filter(a => a.tag === 'Medium').length,
    Low: items.filter(a => a.tag === 'Low').length,
  });

  /* ── Render ── */
  return (
    <div className="p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe size={14} className="text-blue-500" />
            <span className="text-xs font-semibold text-slate-500">
              Research Intelligence {companyLabel ? `• ${companyLabel}` : ''}
            </span>
          </div>
          <h3 className="text-slate-900 font-bold text-xl">Research &amp; Web Intelligence</h3>
          <p className="text-slate-400 text-xs mt-0.5">Document insights + live web research via Serper AI</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { id: 'web', label: 'Web Research', icon: Globe },
          { id: 'doc', label: 'Document Insights', icon: FileText },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === t.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════ WEB RESEARCH TAB ════════════════════════════ */}
      {activeTab === 'web' && (
        <div className="space-y-5">
          {/* Search bar for company */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Enter company name for web research…"
                  defaultValue={companyLabel}
                  id="webCompanyInput"
                  className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  onKeyDown={e => e.key === 'Enter' && loadWebResearch(e.target.value)}
                />
              </div>
              <button
                onClick={() => {
                  const el = document.getElementById('webCompanyInput');
                  loadWebResearch(el?.value || '');
                }}
                disabled={webLoading}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl transition-all shadow-md shadow-blue-500/20 hover:-translate-y-0.5 disabled:opacity-50"
              >
                {webLoading ? <Loader size={14} className="animate-spin" /> : <Zap size={14} />}
                {webLoading ? 'Researching…' : 'Run Web Research'}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Searches news, regulatory filings (MCA/RBI/SEBI), litigation, promoter background, and sector trends
            </p>
          </div>

          {/* Loading */}
          {(webLoading || webSynthLoading) && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-8 text-center">
              <Loader size={28} className="text-blue-600 animate-spin mx-auto mb-3" />
              <p className="text-blue-700 font-semibold text-sm">
                {webSynthLoading ? 'AI is synthesizing research into risk insights…' : 'Crawling web for company intelligence…'}
              </p>
              <p className="text-blue-500 text-xs mt-1">
                Searching across news, MCA filings, litigation databases &amp; sector reports
              </p>
            </div>
          )}

          {/* Error */}
          {webError && !webLoading && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
              <AlertTriangle size={20} className="text-red-500 mx-auto mb-2" />
              <p className="text-red-700 font-semibold text-sm">{webError}</p>
            </div>
          )}

          {/* Web insights results */}
          {!webLoading && !webSynthLoading && webInsights.length > 0 && (
            <>
              <RiskSummary counts={countRisks(webInsights)} />
              <FilterBar
                activeTag={webActiveTag} setActiveTag={setWebActiveTag}
                activeCat={webActiveCat} setActiveCat={setWebActiveCat}
                search={webSearch} setSearch={setWebSearch}
                categories={webCategories}
              />
              <p className="text-xs text-slate-500">{filteredWeb.length} insight{filteredWeb.length !== 1 ? 's' : ''} found from web research</p>
              <InsightGrid items={filteredWeb} showLinks />
              {filteredWeb.length === 0 && <EmptyFilter onClear={() => { setWebActiveTag('All'); setWebActiveCat('All'); setWebSearch(''); }} />}

              {/* Raw results accordion */}
              <RawResultsAccordion results={webRawResults} />
            </>
          )}

          {/* Custom search section */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h4 className="text-slate-900 font-semibold text-sm mb-3 flex items-center gap-2">
              <Search size={14} className="text-blue-500" /> Custom Web Search
            </h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={customQuery}
                onChange={e => setCustomQuery(e.target.value)}
                placeholder='e.g. "Tata Motors NBFC RBI regulation 2025"'
                className="flex-1 px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                onKeyDown={e => e.key === 'Enter' && handleCustomSearch()}
              />
              <button
                onClick={handleCustomSearch}
                disabled={customLoading}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-all disabled:opacity-50"
              >
                {customLoading ? <Loader size={13} className="animate-spin" /> : <Send size={13} />} Search
              </button>
            </div>
            {customResults.length > 0 && (
              <div className="mt-4 space-y-3">
                {customResults.map((r, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h5 className="text-slate-900 font-semibold text-sm leading-snug">{r.title}</h5>
                        <p className="text-slate-500 text-xs mt-1 leading-relaxed">{r.snippet}</p>
                        {r.source && <p className="text-slate-400 text-[11px] mt-1.5">{r.source} {r.date ? `• ${r.date}` : ''}</p>}
                      </div>
                      {r.link && (
                        <a href={r.link} target="_blank" rel="noopener noreferrer"
                          className="flex-shrink-0 p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all">
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════ DOCUMENT INSIGHTS TAB ════════════════════════════ */}
      {activeTab === 'doc' && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <button
              onClick={loadDocInsights}
              disabled={docLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all disabled:opacity-50"
            >
              {docLoading ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {docLoading ? 'Analyzing…' : 'Refresh'}
            </button>
          </div>

          {docLoading && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8 text-center">
              <Loader size={28} className="text-blue-600 animate-spin mx-auto mb-3" />
              <p className="text-blue-700 font-semibold text-sm">Running AI document analysis…</p>
              <p className="text-blue-500 text-xs mt-1">Querying 6 risk dimensions</p>
            </div>
          )}

          {!docLoading && docNoMsg && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
              <p className="text-amber-800 font-semibold text-sm">{docNoMsg}</p>
            </div>
          )}

          {!docLoading && docInsights.length > 0 && (
            <>
              <RiskSummary counts={countRisks(docInsights)} />
              <FilterBar
                activeTag={docActiveTag} setActiveTag={setDocActiveTag}
                activeCat={docActiveCat} setActiveCat={setDocActiveCat}
                search={docSearch} setSearch={setDocSearch}
                categories={docCategories}
              />
              <p className="text-xs text-slate-500">{filteredDoc.length} insight{filteredDoc.length !== 1 ? 's' : ''} found</p>
              <InsightGrid items={filteredDoc} />
              {filteredDoc.length === 0 && <EmptyFilter onClear={() => { setDocActiveTag('All'); setDocActiveCat('All'); setDocSearch(''); }} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════ Shared sub-components ═══════ */

function RiskSummary({ counts }) {
  return (
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
  );
}

function FilterBar({ activeTag, setActiveTag, activeCat, setActiveCat, search, setSearch, categories }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search insights…"
          className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1 text-xs text-slate-500 font-medium mr-1"><Filter size={12} /> Risk:</div>
        {['All', 'High', 'Medium', 'Low'].map(t => (
          <button key={t} onClick={() => setActiveTag(t)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              activeTag === t
                ? t === 'High' ? 'bg-red-500 text-white' : t === 'Medium' ? 'bg-amber-500 text-white' : t === 'Low' ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}>{t}</button>
        ))}
        <div className="flex items-center gap-1 text-xs text-slate-500 font-medium mx-1">| Category:</div>
        {categories.map(c => (
          <button key={c} onClick={() => setActiveCat(c)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${activeCat === c ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{c}</button>
        ))}
      </div>
    </div>
  );
}

function InsightGrid({ items, showLinks }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {items.map((a, i) => {
        const st = riskTagStyle[a.tag] || riskTagStyle.Low;
        const CatIcon = catIcons[a.category] || Globe;
        return (
          <div key={i} className={`bg-white rounded-2xl border ${st.border || 'border-slate-100'} p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg ${st.bg} flex items-center justify-center`}>
                  <CatIcon size={14} className={st.text} />
                </div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{a.category}</span>
              </div>
              <span className={`flex-shrink-0 flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`}></span>
                {a.tag} Risk
              </span>
            </div>
            <h5 className="text-slate-900 font-semibold text-sm leading-snug mb-2">{a.title}</h5>
            <p className="text-slate-500 text-xs leading-relaxed mb-4">{a.summary}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Globe size={11} />
                  <span className="font-medium text-slate-600">{shortSummary(a.source || 'Web', 30)}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock size={11} />
                  <span>{a.time || 'Recent'}</span>
                </div>
              </div>
              {showLinks && a.link && (
                <a href={a.link} target="_blank" rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-all">
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyFilter({ onClear }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
      <Globe size={32} className="text-slate-300 mx-auto mb-3" />
      <p className="text-slate-500 font-medium text-sm">No insights match your filters</p>
      <button onClick={onClear} className="mt-3 text-xs text-blue-600 hover:underline">Clear filters</button>
    </div>
  );
}

function RawResultsAccordion({ results }) {
  const [openCat, setOpenCat] = useState(null);

  const catLabels = {
    company_news: { label: 'Company News', icon: Newspaper },
    financial_intelligence: { label: 'Financial Intelligence', icon: TrendingUp },
    litigation: { label: 'Litigation & Legal', icon: Scale },
    regulatory_filings: { label: 'Regulatory Filings', icon: FileText },
    promoter_background: { label: 'Promoter Background', icon: Users },
    sector_trends: { label: 'Sector Trends', icon: Building2 },
  };

  const entries = Object.entries(results).filter(([, v]) => v && v.length > 0);
  if (entries.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-50">
        <h4 className="text-slate-900 font-semibold text-sm flex items-center gap-2">
          <BookOpen size={14} className="text-blue-500" /> Raw Search Results
        </h4>
        <p className="text-slate-400 text-xs mt-0.5">Click a category to see all web results</p>
      </div>
      {entries.map(([cat, items]) => {
        const meta = catLabels[cat] || { label: cat, icon: Globe };
        const Icon = meta.icon;
        const isOpen = openCat === cat;
        return (
          <div key={cat} className="border-b border-slate-50 last:border-b-0">
            <button
              onClick={() => setOpenCat(isOpen ? null : cat)}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Icon size={14} className="text-slate-500" />
                <span className="text-sm font-medium text-slate-700">{meta.label}</span>
                <span className="text-xs text-slate-400">{items.length} results</span>
              </div>
              {isOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </button>
            {isOpen && (
              <div className="px-5 pb-4 space-y-3">
                {items.map((item, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h6 className="text-slate-800 font-semibold text-xs leading-snug">{item.title}</h6>
                        <p className="text-slate-500 text-xs mt-1 leading-relaxed">{item.snippet}</p>
                        {(item.source || item.date) && (
                          <p className="text-slate-400 text-[11px] mt-1.5">
                            {item.source}{item.date ? ` • ${item.date}` : ''}
                          </p>
                        )}
                      </div>
                      {item.link && (
                        <a href={item.link} target="_blank" rel="noopener noreferrer"
                          className="flex-shrink-0 p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all">
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
