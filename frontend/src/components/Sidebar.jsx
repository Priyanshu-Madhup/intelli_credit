import React from 'react';
import {
  LayoutDashboard, FileSearch, Brain, Globe, Award,
  FileText, Zap, ChevronRight, Settings, LogOut
} from 'lucide-react';

const navItems = [
  { id: 'dashboard',       label: 'Dashboard',          icon: LayoutDashboard },
  { id: 'assessment',      label: 'New Assessment',      icon: FileSearch },
  { id: 'analysis',        label: 'AI Analysis',         icon: Brain },
  { id: 'research',        label: 'Research Insights',   icon: Globe },
  { id: 'recommendation',  label: 'Credit Decision',     icon: Award },
  { id: 'report',          label: 'CAM Report',          icon: FileText },
];

export default function Sidebar({ currentPage, onNavigate }) {
  return (
    <div className="w-64 h-screen bg-slate-900 flex flex-col fixed left-0 top-0 z-50 select-none">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/40 flex-shrink-0">
            <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-white font-bold text-[15px] tracking-tight leading-none">Intelli-Credit</h1>
            <p className="text-slate-500 text-[11px] mt-0.5 font-medium">AI Credit Platform</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-hide">
        <p className="text-slate-600 text-[10px] font-semibold uppercase tracking-widest px-3 mb-3">Navigation</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 group ${
                active
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              }`}
            >
              <Icon size={17} className={active ? 'text-blue-100' : 'text-slate-500 group-hover:text-slate-300'} />
              <span className="flex-1 text-left">{item.label}</span>
              {active && <ChevronRight size={14} className="text-blue-300" />}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-slate-700/50 space-y-1">
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 text-[13px] font-medium transition-all">
          <Settings size={16} className="text-slate-500" />
          Settings
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-slate-800 text-[13px] font-medium transition-all">
          <LogOut size={16} className="text-slate-500" />
          Sign Out
        </button>
        <div className="flex items-center gap-3 px-3 pt-3 mt-1 border-t border-slate-800">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[11px] font-bold">AK</span>
          </div>
          <div className="min-w-0">
            <p className="text-slate-200 text-xs font-semibold truncate">Arjun Kumar</p>
            <p className="text-slate-500 text-[11px] truncate">Credit Analyst</p>
          </div>
        </div>
      </div>
    </div>
  );
}
