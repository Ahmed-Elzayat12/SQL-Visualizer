import React, { useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useReactFlow,
  useStore,
  useNodesInitialized,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CteNodeComponent, OperationNodeComponent, SourceTableNodeComponent } from './CustomNodes';
import type { ParsedSqlQuery } from '../types/sql';
import type { StepExecutionResult } from '../types/execution';
import type { GraphViewMode } from '../types/visualizer';
import { Layers, GitFork } from 'lucide-react';

// React Flow observes its container; refit after a panel resize settles.
function FitGraphToContainer() {
  const { fitView } = useReactFlow();
  const width = useStore(state => state.width);
  const height = useStore(state => state.height);
  const ready = useNodesInitialized();
  useEffect(() => {
    if (!ready || !width || !height) return;
    const timer = window.setTimeout(() => { void fitView({ padding: 0.15, maxZoom: 1 }); }, 120);
    return () => window.clearTimeout(timer);
  }, [fitView, width, height, ready]);
  return null;
}

const nodeTypes = {
  cteNode: CteNodeComponent,
  operationNode: OperationNodeComponent,
  sourceTableNode: SourceTableNodeComponent,
};

interface GraphViewProps {
  parsedQuery: ParsedSqlQuery;
  simulationSteps: StepExecutionResult[];
  currentStepIndex: number;
  currentGraphView: GraphViewMode;
  onSelectNode: (nodeId: string, cteName?: string, opId?: string) => void;
  selectedNodeId: string | null;
  onToggleViewMode: (mode: GraphViewMode) => void;
}

export const GraphView: React.FC<GraphViewProps> = ({
  parsedQuery,
  simulationSteps,
  currentStepIndex,
  currentGraphView,
  onSelectNode,
  selectedNodeId,
  onToggleViewMode,
}) => {
  // Current active step
  const currentStep = simulationSteps[currentStepIndex];

  // 1. Build CTE Dependency Graph
  const { cteNodes, cteEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Source tables first
    const sourceTableSet = new Set(parsedQuery.sourceTables);
    let xOffset = 60;
    let yOffset = 80;

    sourceTableSet.forEach((tbl) => {
      const isSelected = selectedNodeId === `tbl_${tbl}`;
      nodes.push({
        id: `tbl_${tbl}`,
        type: 'sourceTableNode',
        position: { x: xOffset, y: yOffset },
        data: {
          id: `tbl_${tbl}`,
          label: tbl,
          isSourceTable: true,
          isActive: isSelected,
          stats: {
            rowsOut: simulationSteps.find(step => step.operationId === parsedQuery.allOperations.find(op => op.type === 'SOURCE_SCAN' && op.inputs[0] === tbl)?.id)?.outputRows.length,
          },
          onClick: () => onSelectNode(`tbl_${tbl}`, tbl),
        },
      });
      xOffset += 320;
    });

    // Level calculation for CTE DAG
    const levels = new Map<string, number>();
    const getLevel = (cteName: string, visited: Set<string> = new Set()): number => {
      if (visited.has(cteName)) return 1;
      visited.add(cteName);
      const cte = parsedQuery.ctes.find(c => c.name.toLowerCase() === cteName.toLowerCase());
      if (!cte || cte.dependencies.length === 0) return 1;

      let maxDepLevel = 0;
      for (const dep of cte.dependencies) {
        if (parsedQuery.ctes.some(c => c.name.toLowerCase() === dep.toLowerCase())) {
          maxDepLevel = Math.max(maxDepLevel, getLevel(dep, new Set(visited)));
        }
      }
      return maxDepLevel + 1;
    };

    parsedQuery.ctes.forEach((cte) => {
      levels.set(cte.name.toLowerCase(), getLevel(cte.name));
    });

    // Group CTEs by level for layered horizontal layout
    const levelBuckets = new Map<number, typeof parsedQuery.ctes>();
    parsedQuery.ctes.forEach((cte) => {
      const lvl = levels.get(cte.name.toLowerCase()) || 1;
      if (!levelBuckets.has(lvl)) levelBuckets.set(lvl, []);
      levelBuckets.get(lvl)!.push(cte);
    });

    levelBuckets.forEach((bucket, lvl) => {
      const colX = 60;
      bucket.forEach((cte, idx) => {
        const rowY = 280 + (lvl - 1) * 220;
        const isCurrentActive = currentStep?.cteName?.toLowerCase() === cte.name.toLowerCase();
        const isSelected = selectedNodeId === `cte_${cte.name}` || isCurrentActive;

        // Check if upstream or downstream of selected node
        const isUpstream = selectedNodeId ? cte.dependencies.some(d => selectedNodeId.includes(d)) : false;

        nodes.push({
          id: `cte_${cte.name}`,
          type: 'cteNode',
          position: { x: colX + idx * 320, y: rowY },
          data: {
            id: `cte_${cte.name}`,
            label: cte.name,
            sublabel: cte.isMaterialized ? 'MATERIALIZED' : 'INLINE',
            isCteNode: true,
            isActive: isSelected,
            isUpstream,
            sqlSnippet: cte.rawSql.slice(0, 50) + '...',
            stats: {
              rowsOut: currentStep?.cteName === cte.name ? currentStep.outputRows.length : undefined,
            },
            onClick: () => onSelectNode(`cte_${cte.name}`, cte.name),
          },
        });

        // Edges from dependencies
        cte.dependencies.forEach((dep) => {
          const isSource = sourceTableSet.has(dep);
          const sourceId = isSource ? `tbl_${dep}` : `cte_${dep}`;
          const isEdgeActive = isSelected || isCurrentActive;

          edges.push({
            id: `edge_${sourceId}_${cte.name}`,
            source: sourceId,
            target: `cte_${cte.name}`,
            animated: isEdgeActive,
            style: {
              stroke: isEdgeActive ? '#3b82f6' : '#475569',
              strokeWidth: isEdgeActive ? 2.5 : 1.5,
            },
          });
        });
      });
    });

    // Final output node
    const maxLevel = Math.max(...Array.from(levels.values()), 0);
    const finalY = 280 + maxLevel * 220;
    const isFinalActive = currentStep?.operationId?.includes('final') || selectedNodeId === 'node_final';

    nodes.push({
      id: 'node_final',
      type: 'cteNode',
      position: { x: 60, y: finalY },
      data: {
        id: 'node_final',
        label: 'Final Query Result',
        sublabel: 'PROJECTION',
        isCteNode: true,
        isActive: isFinalActive,
        sqlSnippet: parsedQuery.finalQuery.operations.map(op => op.sqlSnippet).join('\n'),
        stats: {
          rowsOut: simulationSteps.at(-1)?.outputRows.length,
        },
        onClick: () => onSelectNode('node_final', 'final_output', parsedQuery.finalQuery.operations.at(-1)?.id),
      },
    });

    parsedQuery.finalQuery.from.forEach((fromTbl) => {
      edges.push({
        id: `edge_final_${fromTbl}`,
        source: sourceTableSet.has(fromTbl) ? `tbl_${fromTbl}` : `cte_${fromTbl}`,
        target: 'node_final',
        animated: isFinalActive,
        style: {
          stroke: isFinalActive ? '#10b981' : '#475569',
          strokeWidth: isFinalActive ? 2.5 : 1.5,
        },
      });
    });

    return { cteNodes: nodes, cteEdges: edges };
  }, [parsedQuery, currentStep, selectedNodeId, onSelectNode, simulationSteps]);

  // 2. Build Detailed Logical Operations Graph
  const { opNodes, opEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    let currentX = 60;
    let currentY = 100;
    const lastOperationByCte = new Map(parsedQuery.ctes.map(cte => [cte.name.toLowerCase(), cte.operations.at(-1)?.id]));

    parsedQuery.allOperations.forEach((op, idx) => {
      const isCurrentActive = currentStep?.operationId === op.id;
      const isSelected = selectedNodeId === op.id || isCurrentActive;

      nodes.push({
        id: op.id,
        type: 'operationNode',
        position: { x: currentX, y: currentY },
        data: {
          id: op.id,
          label: op.title,
          cteName: op.cteName,
          operationType: op.type,
          sqlSnippet: op.sqlSnippet,
          isActive: isSelected,
          stats: {
            rowsIn: simulationSteps[idx]?.inputRows?.length,
            rowsOut: simulationSteps[idx]?.outputRows?.length,
          },
          onClick: () => onSelectNode(op.id, op.cteName, op.id),
        },
      });

      const predecessors = op.type === 'SOURCE_SCAN'
        ? op.inputs.flatMap(input => lastOperationByCte.get(input.toLowerCase()) ?? [])
        : op.inputOperationIds ?? (idx ? [parsedQuery.allOperations[idx - 1].id] : []);
      for (const predecessor of predecessors) {
        edges.push({
          id: `edge_op_${predecessor}_${op.id}`,
          source: predecessor,
          target: op.id,
          animated: isSelected,
          style: {
            stroke: isSelected ? '#3b82f6' : '#334155',
            strokeWidth: isSelected ? 2.5 : 1.5,
          },
        });
      }

      currentX += 300;
      if (idx > 0 && idx % 4 === 0) {
        currentX = 60;
        currentY += 180;
      }
    });

    return { opNodes: nodes, opEdges: edges };
  }, [parsedQuery, currentStep, selectedNodeId, simulationSteps, onSelectNode]);

  // Active nodes & edges based on mode
  const currentNodes = currentGraphView === 'CTE_DEPENDENCY' ? cteNodes : opNodes;
  const currentEdges = currentGraphView === 'CTE_DEPENDENCY' ? cteEdges : opEdges;

  if (!parsedQuery.rawSql.trim()) return <div className="h-full flex items-center justify-center p-8 text-center text-sm text-slate-400">Paste SQL or resolve the input messages to see the query graph.</div>;

  return (
    <div className="relative w-full h-full bg-slate-950 flex flex-col overflow-hidden">
      {/* View Switcher Top Bar */}
      <div className="shrink-0 flex flex-wrap items-center gap-1.5 p-2 bg-slate-900 border-b border-slate-800">
        <button
          onClick={() => onToggleViewMode('CTE_DEPENDENCY')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            currentGraphView === 'CTE_DEPENDENCY'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Dependencies</span>
        </button>

        <button
          onClick={() => onToggleViewMode('LOGICAL_OPERATIONS')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            currentGraphView === 'LOGICAL_OPERATIONS'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <GitFork className="w-3.5 h-3.5" />
          <span>Operations</span>
        </button>
      </div>

      <div className="shrink-0 flex flex-wrap gap-3 px-3 py-2 text-[11px] text-slate-400 border-b border-slate-800">
        <span className="text-emerald-400">Source table</span><span className="text-blue-400">Query / CTE</span>
        <span>{parsedQuery.ctes.length} CTEs / {parsedQuery.sourceTables.length} source tables</span>
        {!simulationSteps.length && <span className="text-amber-300">Structure preview / No row results</span>}
        {parsedQuery.allOperations.some(operation => operation.type === 'UNION_ALL') && <span>UNION ALL</span>}
        {parsedQuery.allOperations.some(operation => operation.type === 'LATERAL_JOIN') && <span>LATERAL</span>}
      </div>
      <div className="flex-1 min-h-0 relative">
      <ReactFlow
        key={`${currentGraphView}:${parsedQuery.rawSql}`}
        nodes={currentNodes}
        edges={currentEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.5}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={20} size={1} variant={BackgroundVariant.Dots} />
        <Controls className="!bg-slate-900 !border-slate-800 !rounded-lg !shadow-lg [&>button]:!border-slate-800 [&>button]:!bg-slate-900 [&>button]:!text-slate-300 hover:[&>button]:!bg-slate-800" />
        <FitGraphToContainer />
      </ReactFlow>
      </div>
    </div>
  );
};
