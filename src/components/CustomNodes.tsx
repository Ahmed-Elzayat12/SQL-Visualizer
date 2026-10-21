import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Database,
  Filter,
  Layers,
  GitMerge,
  ListFilter,
  Calculator,
  CheckCircle2,
  ArrowRight,
  Zap,
  Activity
} from 'lucide-react';
import type { NodeCustomData } from '../types/visualizer';

export const CteNodeComponent = memo(({ data }: { data: NodeCustomData }) => {
  const isSelected = data.isActive;
  const isUpstream = data.isUpstream;
  const isDownstream = data.isDownstream;

  let borderClass = 'border-slate-800 hover:border-slate-700 bg-slate-900/95';
  if (isSelected) {
    borderClass = 'border-blue-500 ring-2 ring-blue-500/30 bg-slate-900';
  } else if (isUpstream) {
    borderClass = 'border-emerald-500/70 ring-1 ring-emerald-500/20 bg-slate-900';
  } else if (isDownstream) {
    borderClass = 'border-amber-500/70 ring-1 ring-amber-500/20 bg-slate-900';
  }

  return (
    <div
      onClick={data.onClick}
      className={`min-w-[240px] max-w-[280px] rounded-lg border p-3.5 shadow-lg backdrop-blur-sm transition-all duration-200 cursor-pointer ${borderClass}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-blue-400 !border-2 !border-slate-900"
      />

      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs text-blue-400 font-mono tracking-wider uppercase">CTE Block</div>
            <div className="text-sm font-semibold text-slate-100 font-mono">{data.label}</div>
          </div>
        </div>

        {data.sublabel && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            {data.sublabel}
          </span>
        )}
      </div>

      {data.sqlSnippet && (
        <div className="mt-2 p-2 rounded bg-slate-950/80 border border-slate-800/80 font-mono text-[11px] text-slate-400 truncate">
          {data.sqlSnippet}
        </div>
      )}

      {data.stats && (
        <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>Rows Processed</span>
          <span className="text-slate-200 tabular-nums font-semibold">{data.stats.rowsOut ?? '-'}</span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-blue-400 !border-2 !border-slate-900"
      />
    </div>
  );
});

export const OperationNodeComponent = memo(({ data }: { data: NodeCustomData }) => {
  const isSelected = data.isActive;
  const isUpstream = data.isUpstream;
  const isDownstream = data.isDownstream;

  let icon = <Activity className="w-3.5 h-3.5" />;
  let colorTheme = 'text-blue-400 bg-blue-500/10 border-blue-500/20';

  switch (data.operationType) {
    case 'SOURCE_SCAN':
      icon = <Database className="w-3.5 h-3.5" />;
      colorTheme = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      break;
    case 'WHERE_FILTER':
      icon = <Filter className="w-3.5 h-3.5" />;
      colorTheme = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      break;
    case 'GROUP_BY_AGGREGATE':
      icon = <Layers className="w-3.5 h-3.5" />;
      colorTheme = 'text-purple-400 bg-purple-500/10 border-purple-500/20';
      break;
    case 'DISTINCT_ON':
      icon = <ListFilter className="w-3.5 h-3.5" />;
      colorTheme = 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
      break;
    case 'JOIN':
      icon = <GitMerge className="w-3.5 h-3.5" />;
      colorTheme = 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
      break;
    case 'DERIVED_COLUMNS':
    case 'CASE_WHEN':
      icon = <Calculator className="w-3.5 h-3.5" />;
      colorTheme = 'text-pink-400 bg-pink-500/10 border-pink-500/20';
      break;
  }

  let borderClass = 'border-slate-800 hover:border-slate-700 bg-slate-900/90';
  if (isSelected) {
    borderClass = 'border-blue-500 ring-2 ring-blue-500/40 bg-slate-900';
  } else if (isUpstream) {
    borderClass = 'border-emerald-500/70 ring-1 ring-emerald-500/20 bg-slate-900';
  } else if (isDownstream) {
    borderClass = 'border-amber-500/70 ring-1 ring-amber-500/20 bg-slate-900';
  }

  return (
    <div
      onClick={data.onClick}
      className={`min-w-[220px] max-w-[260px] rounded-lg border p-3 shadow-md backdrop-blur-sm transition-all duration-200 cursor-pointer ${borderClass}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-slate-400 !border !border-slate-900"
      />

      <div className="flex items-center gap-2 mb-1.5">
        <div className={`p-1 rounded border ${colorTheme}`}>
          {icon}
        </div>
        <div className="truncate">
          <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
            {data.cteName ? `CTE: ${data.cteName}` : 'Operation'}
          </div>
          <div className="text-xs font-semibold text-slate-100 truncate">{data.label}</div>
        </div>
      </div>

      {data.sqlSnippet && (
        <div className="mt-1.5 p-1.5 rounded bg-slate-950 font-mono text-[10px] text-slate-400 truncate border border-slate-800/60">
          {data.sqlSnippet}
        </div>
      )}

      {data.stats && (
        <div className="mt-2 pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span>Row Delta</span>
          <span className="text-slate-200 tabular-nums">
            {data.stats.rowsIn ?? '-'} <ArrowRight className="w-2.5 h-2.5 inline mx-0.5 text-slate-500" /> {data.stats.rowsOut ?? '-'}
          </span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-slate-400 !border !border-slate-900"
      />
    </div>
  );
});

export const SourceTableNodeComponent = memo(({ data }: { data: NodeCustomData }) => {
  const isSelected = data.isActive;

  return (
    <div
      onClick={data.onClick}
      className={`w-[280px] rounded-lg border p-3.5 shadow-lg backdrop-blur-sm cursor-pointer transition-all ${
        isSelected
          ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-slate-900'
          : 'border-slate-800 bg-slate-900/90 hover:border-slate-700'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Database className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-emerald-400 font-mono uppercase tracking-wider">Source Table</div>
          <div className="text-sm font-semibold text-slate-100 font-mono break-all">{data.label}</div>
        </div>
      </div>

      {data.stats && (
        <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>Physical Rows</span>
          <span className="text-slate-200 tabular-nums font-semibold">{data.stats.rowsOut ?? '-'}</span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-emerald-400 !border-2 !border-slate-900"
      />
    </div>
  );
});
