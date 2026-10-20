import React from 'react';
import { 
  Database, 
  Play, 
  Download, 
  Layers, 
  Activity, 
  HelpCircle,
  Sparkles
} from 'lucide-react';
import type { AppDataMode } from '../types/visualizer';

interface HeaderProps {
  activeTab: 'workspace' | 'schema' | 'explain' | 'docs';
  onSelectTab: (tab: 'workspace' | 'schema' | 'explain' | 'docs') => void;
  dataMode: AppDataMode;
  onChangeDataMode: (mode: AppDataMode) => void;
  onRunAnalysis: () => void;
  onExportReport: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  dataMode,
  onChangeDataMode,
  onRunAnalysis,
  onExportReport,
}) => {
  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 px-5 flex items-center justify-between gap-8 shrink-0 z-20">
      {/* Zone 1: Single Brand Wordmark */}
      <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
          <Database className="w-4 h-4 stroke-[2.2]" />
        </div>
        <span className="text-base font-bold tracking-tight text-white font-sans">
          QueryScope
        </span>
      </div>

      {/* Zone 2: 4-5 Clean Nav Tabs */}
      <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
        <button
          onClick={() => onSelectTab('workspace')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'workspace' ? 'text-blue-400 font-semibold' : ''
          }`}
        >
          Query Visualizer &amp; Debugger
        </button>

        <button
          onClick={() => onSelectTab('schema')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'schema' ? 'text-blue-400 font-semibold' : ''
          }`}
        >
          Sample Tables &amp; Data Simulation
        </button>

        <button
          onClick={() => onSelectTab('explain')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'explain' ? 'text-blue-400 font-semibold' : ''
          }`}
        >
          PostgreSQL EXPLAIN Analyzer
        </button>

        <button
          onClick={() => onSelectTab('docs')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'docs' ? 'text-blue-400 font-semibold' : ''
          }`}
        >
          Architecture &amp; Docs
        </button>
      </nav>

      {/* Zone 3: Mode Switcher & Primary Action */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden sm:flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px] font-mono">
          <button
            onClick={() => onChangeDataMode('STRUCTURE_ONLY')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              dataMode === 'STRUCTURE_ONLY'
                ? 'bg-slate-800 text-slate-100 font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Mode A: Structure
          </button>
          <button
            onClick={() => onChangeDataMode('SAMPLE_SIMULATION')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              dataMode === 'SAMPLE_SIMULATION'
                ? 'bg-blue-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Mode B: Simulation
          </button>
        </div>

        <button
          onClick={onExportReport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Summary</span>
        </button>
      </div>
    </header>
  );
};
