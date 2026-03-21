import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import Dashboard from './pages/Dashboard';
import NewCreditAssessment from './pages/NewCreditAssessment';
import AIAnalysis from './pages/AIAnalysis';
import ResearchInsights from './pages/ResearchInsights';
import CreditRecommendation from './pages/CreditRecommendation';
import CAMReport from './pages/CAMReport';
import DocQuery from './pages/DocQuery';
import AuthPage from './pages/AuthPage';

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState('dashboard');
  const [mounted, setMounted] = useState(new Set(['dashboard']));

  useEffect(() => {
    // Restore existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const name = session.user.user_metadata?.name || session.user.email;
        setUser({ name, email: session.user.email });
      }
      setAuthLoading(false);
    });

    // Listen for auth changes (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        const name = session.user.user_metadata?.name || session.user.email;
        setUser({ name, email: session.user.email });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = (userData) => setUser(userData);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    );
  }

  if (!user) return <AuthPage onLogin={handleLogin} />;

  const handleNavigate = (to) => {
    setPage(to);
    setMounted(prev => { const n = new Set(prev); n.add(to); return n; });
  };

  const show = (key) => ({ display: page === key ? 'block' : 'none' });

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar currentPage={page} onNavigate={handleNavigate} />
      <div className="flex-1 flex flex-col ml-64 min-w-0">
        <TopNav currentPage={page} user={user} onLogout={handleLogout} />
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

