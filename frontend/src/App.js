import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import Dashboard from './pages/Dashboard';
import NewCreditAssessment from './pages/NewCreditAssessment';
import AIAnalysis from './pages/AIAnalysis';
import ResearchInsights from './pages/ResearchInsights';
import CreditRecommendation from './pages/CreditRecommendation';
import CAMReport from './pages/CAMReport';
import DocQuery from './pages/DocQuery';

export default function App() {
  const [page, setPage] = useState('dashboard');
  // Track which pages have been visited — only mount a page once first visited,
  // then keep it mounted (display:none) to preserve state without firing all effects on startup.
  const [mounted, setMounted] = useState(new Set(['dashboard']));

  const handleNavigate = (to) => {
    setPage(to);
    setMounted(prev => { const n = new Set(prev); n.add(to); return n; });
  };

  const show = (key) => ({ display: page === key ? 'block' : 'none' });

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar currentPage={page} onNavigate={handleNavigate} />
      <div className="flex-1 flex flex-col ml-64 min-w-0">
        <TopNav currentPage={page} />
        <main className="flex-1 overflow-y-auto">
          {mounted.has('dashboard')      && <div style={show('dashboard')}><Dashboard onNavigate={handleNavigate} /></div>}
          {mounted.has('assessment')     && <div style={show('assessment')}><NewCreditAssessment onNavigate={handleNavigate} /></div>}
          {mounted.has('analysis')       && <div style={show('analysis')}><AIAnalysis onNavigate={handleNavigate} /></div>}
          {mounted.has('research')       && <div style={show('research')}><ResearchInsights /></div>}
          {mounted.has('recommendation') && <div style={show('recommendation')}><CreditRecommendation onNavigate={handleNavigate} /></div>}
          {mounted.has('report')         && <div style={show('report')}><CAMReport /></div>}
          {mounted.has('docquery')       && <div style={show('docquery')}><DocQuery /></div>}
        </main>
      </div>
    </div>
  );
}

