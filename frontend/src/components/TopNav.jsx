import React, { useState } from 'react';
import { Search, Bell, Settings, HelpCircle, ChevronDown } from 'lucide-react';

const pageTitles = {
  dashboard:      { title: 'Dashboard',               subtitle: 'Credit portfolio overview' },
  assessment:     { title: 'New Credit Assessment',   subtitle: 'Upload and analyze company documents' },
  analysis:       { title: 'AI Analysis',             subtitle: 'Automated intelligence insights' },
  research:       { title: 'Research Insights',       subtitle: 'News and market intelligence' },
  recommendation: { title: 'Credit Recommendation',  subtitle: 'Final AI-powered decision' },
  report:         { title: 'CAM Report',              subtitle: 'Credit Appraisal Memorandum preview' },
};

export default function TopNav({ currentPage }) {
  const { title, subtitle } = pageTitles[currentPage] || pageTitles.dashboard;
  const [query, setQuery] = useState('');

  return (
    <header className="bg-white border-b border-slate-100 px-6 py-3.5 flex items-center justify-between sticky top-0 z-40 shadow-sm">
      <div>
        <h2 className="text-slate-900 font-semibold text-[17px] leading-tight">{title}</h2>
        <p className="text-slate-400 text-xs mt-0.5">{subtitle}</p>
      </div>

      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search companies, reports…"
            className="pl-9 pr-4 py-2 text-[13px] bg-slate-50 border border-slate-200 rounded-xl w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-slate-400"
          />
        </div>

        {/* Notification */}
        <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full ring-1 ring-white"></span>
        </button>

        <button className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all">
          <HelpCircle size={18} />
        </button>

        <button className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all">
          <Settings size={18} />
        </button>

        {/* Profile */}
        <div className="flex items-center gap-2 pl-3 border-l border-slate-200 cursor-pointer group">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[11px] font-bold">AK</span>
          </div>
          <div className="hidden lg:block">
            <p className="text-slate-800 text-[13px] font-semibold leading-none">Arjun Kumar</p>
            <p className="text-slate-400 text-[11px] mt-0.5">Credit Analyst</p>
          </div>
          <ChevronDown size={14} className="text-slate-400 hidden lg:block" />
        </div>
      </div>
    </header>
  );
}
