import React, { useState } from 'react';
import type { ExplainPlanNode, ExplainResult } from '../types/execution';
import { SAMPLE_EXPLAIN_JSON } from '../data/demoExplainPlan';
import { parseExplainJson } from '../engine/explainAnalyzer';
import { 
  Activity, 
  AlertTriangle, 
  Clock, 
  Cpu, 
  Database, 
  Layers, 
  Play, 
  RotateCcw,
  Zap
} from 'lucide-react';

export const ExplainView: React.FC = () => {
  const [jsonInput, setJsonInput] = useState(SAMPLE_EXPLAIN_JSON);
  const [explainResult, setExplainResult] = useState<ExplainResult | null>(() =>
    parseExplainJson(SAMPLE_EXPLAIN_JSON)
  );
  const [selectedNode, setSelectedNode] = useState<ExplainPlanNode | null>(() =>
    explainResult?.rootNode || null
  );

  const handleAnalyze = () => {
    const res = parseExplainJson(jsonInput);
    setExplainResult(res);
    if (res) setSelectedNode(res.rootNode);
  };

  const handleLoadSample = () => {
    setJsonInput(SAMPLE_EXPLAIN_JSON);
    const res = parseExplainJson(SAMPLE_EXPLAIN_JSON);
    setExplainResult(res);
    if (res) setSelectedNode(res.rootNode);
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-200 overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            PostgreSQL Physical EXPLAIN (ANALYZE, BUFFERS) Plan Analyzer
          </h2>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Mode C
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleLoadSample}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 transition-colors"
          >
            Load Sample JSON
          </button>
          <button
            onClick={handleAnalyze}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-sm transition-colors"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Analyze Plan</span>
          </button>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left: Input Textarea */}
        <div className="lg:col-span-4 border-r border-slate-800 flex flex-col bg-slate-950 p-3">
          <div className="text-xs font-mono text-slate-400 mb-2 flex items-center justify-between">
            <span>Paste EXPLAIN (FORMAT JSON) here:</span>
            <span className="text-[10px] text-slate-500">EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)</span>
          </div>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            className="flex-1 w-full bg-slate-900/90 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 resize-none"
            placeholder="Paste your JSON EXPLAIN output..."
          />
        </div>

        {/* Center: Physical Plan Tree & Metrics */}
        <div className="lg:col-span-8 flex flex-col overflow-y-auto p-4 space-y-4">
          {explainResult ? (
            <>
              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[11px] text-slate-500 font-mono">Execution Time</div>
                  <div className="text-lg font-bold text-emerald-400 font-mono tabular-nums">
                    {explainResult.executionTimeMs ?? explainResult.totalActualTimeMs} ms
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[11px] text-slate-500 font-mono">Total Estimated Cost</div>
                  <div className="text-lg font-bold text-blue-400 font-mono tabular-nums">
                    {explainResult.totalCost}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[11px] text-slate-500 font-mono">Planning Time</div>
                  <div className="text-lg font-bold text-slate-200 font-mono tabular-nums">
                    {explainResult.planningTimeMs ?? 0.4} ms
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[11px] text-slate-500 font-mono">Detected Hotspots</div>
                  <div className="text-lg font-bold text-amber-400 font-mono tabular-nums">
                    {explainResult.bottlenecks.length}
                  </div>
                </div>
              </div>

              {/* Bottlenecks Alert Box */}
              {explainResult.bottlenecks.length > 0 && (
                <div className="p-3.5 rounded-lg bg-amber-950/20 border border-amber-900/40 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span>PostgreSQL Plan Bottleneck Analysis</span>
                  </div>
                  {explainResult.bottlenecks.map((b, idx) => (
                    <div key={idx} className="text-xs text-slate-300 pl-6 border-l-2 border-amber-500/50">
                      <span className="font-semibold text-white">{b.nodeType}: </span>
                      {b.description}
                      <div className="text-emerald-400 text-[11px] mt-0.5">💡 {b.recommendation}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Physical Tree Viewer */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="text-xs font-semibold text-slate-300 font-mono flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span>Physical Execution Operator Tree</span>
                </div>

                <div className="space-y-2 font-mono text-xs">
                  <RenderPlanNode
                    node={explainResult.rootNode}
                    depth={0}
                    onSelectNode={setSelectedNode}
                    selectedNode={selectedNode}
                  />
                </div>
              </div>

              {/* Node Inspector Detail */}
              {selectedNode && (
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="text-sm font-bold text-slate-100">{selectedNode.nodeType} Operator</div>
                    {selectedNode.relationName && (
                      <span className="text-emerald-400">Relation: {selectedNode.relationName}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-slate-300 pt-2">
                    <div>
                      <span className="text-slate-500">Actual Time: </span>
                      <span className="font-semibold text-emerald-400">{selectedNode.actualTotalTime} ms</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Actual Rows: </span>
                      <span className="font-semibold text-blue-400">{selectedNode.actualRows}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Cost: </span>
                      <span className="font-semibold">{selectedNode.startupCost}..{selectedNode.totalCost}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Shared Hit Blocks: </span>
                      <span className="font-semibold text-purple-400">{selectedNode.sharedHitBlocks ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Shared Read Blocks: </span>
                      <span className="font-semibold">{selectedNode.sharedReadBlocks ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Loops: </span>
                      <span className="font-semibold">{selectedNode.actualLoops ?? 1}</span>
                    </div>
                  </div>

                  {selectedNode.filter && (
                    <div className="pt-2 text-slate-400">
                      <span className="text-amber-400 font-semibold">Filter: </span>
                      {selectedNode.filter} (discarded {selectedNode.rowsRemovedByFilter ?? 0} rows)
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="p-8 rounded-lg bg-slate-900 border border-slate-800 text-center text-slate-400 text-xs">
              Invalid or empty JSON EXPLAIN output. Click &ldquo;Load Sample JSON&rdquo; or paste valid EXPLAIN (FORMAT JSON).
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const RenderPlanNode: React.FC<{
  node: ExplainPlanNode;
  depth: number;
  onSelectNode: (n: ExplainPlanNode) => void;
  selectedNode: ExplainPlanNode | null;
}> = ({ node, depth, onSelectNode, selectedNode }) => {
  const isSelected = selectedNode === node;

  return (
    <div style={{ marginLeft: `${depth * 20}px` }} className="space-y-1.5">
      <div
        onClick={() => onSelectNode(node)}
        className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-3 ${
          isSelected
            ? 'bg-emerald-950/30 border-emerald-500 text-emerald-200'
            : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          <span className="font-semibold text-slate-100">{node.nodeType}</span>
          {node.relationName && (
            <span className="text-slate-500">on &apos;{node.relationName}&apos;</span>
          )}
          {node.cteName && <span className="text-blue-400">CTE: {node.cteName}</span>}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400 shrink-0">
          <span>{node.actualTotalTime ? `${node.actualTotalTime} ms` : ''}</span>
          <span className="text-slate-200 font-semibold">{node.actualRows ?? node.planRows} rows</span>
        </div>
      </div>

      {node.plans &&
        node.plans.map((child, idx) => (
          <RenderPlanNode
            key={idx}
            node={child}
            depth={depth + 1}
            onSelectNode={onSelectNode}
            selectedNode={selectedNode}
          />
        ))}
    </div>
  );
};
