import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import Dashboard from './pages/Dashboard';
import NewCreditAssessment from './pages/NewCreditAssessment';
import AIAnalysis from './pages/AIAnalysis';
import ResearchInsights from './pages/ResearchInsights';
import CreditRecommendation from './pages/CreditRecommendation';
import CAMReport from './pages/CAMReport';

export default function App() {
  const [page, setPage] = useState('dashboard');

  const renderPage = () => {
    switch (page) {
      case 'dashboard':      return <Dashboard onNavigate={setPage} />;
      case 'assessment':     return <NewCreditAssessment onNavigate={setPage} />;
      case 'analysis':       return <AIAnalysis onNavigate={setPage} />;
      case 'research':       return <ResearchInsights />;
      case 'recommendation': return <CreditRecommendation onNavigate={setPage} />;
      case 'report':         return <CAMReport />;
      default:               return <Dashboard onNavigate={setPage} />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar currentPage={page} onNavigate={setPage} />
      <div className="flex-1 flex flex-col ml-64 min-w-0">
        <TopNav currentPage={page} />
        <main className="flex-1 overflow-y-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

