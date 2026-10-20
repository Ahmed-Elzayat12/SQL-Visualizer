import React, { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CteNodeComponent, OperationNodeComponent, SourceTableNodeComponent } from './CustomNodes';
import type { ParsedSqlQuery } from '../types/sql';
import type { StepExecutionResult } from '../types/execution';
import type { GraphViewMode } from '../types/visualizer';
import { Layers, GitFork, Network, Maximize2 } from 'lucide-react';

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
            rowsOut: currentStep?.outputRows?.length || 8,
          },
          onClick: () => onSelectNode(`tbl_${tbl}`, tbl),
        },
      });
      yOffset += 140;
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
      const colX = 380 + (lvl - 1) * 340;
      bucket.forEach((cte, idx) => {
        const rowY = 60 + idx * 160;
        const isCurrentActive = currentStep?.cteName?.toLowerCase() === cte.name.toLowerCase();
        const isSelected = selectedNodeId === `cte_${cte.name}` || isCurrentActive;

        // Check if upstream or downstream of selected node
        const isUpstream = selectedNodeId ? cte.dependencies.some(d => selectedNodeId.includes(d)) : false;

        nodes.push({
          id: `cte_${cte.name}`,
          type: 'cteNode',
          position: { x: colX, y: rowY },
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
    const maxLevel = Math.max(...Array.from(levels.values()), 1);
    const finalX = 380 + maxLevel * 340;
    const isFinalActive = currentStep?.operationId?.includes('final') || selectedNodeId === 'node_final';

    nodes.push({
      id: 'node_final',
      type: 'cteNode',
      position: { x: finalX, y: 120 },
      data: {
        id: 'node_final',
        label: 'Final Query Result',
        sublabel: 'PROJECTION',
        isCteNode: true,
        isActive: isFinalActive,
        sqlSnippet: 'SELECT ... FROM labeled ORDER BY ...',
        stats: {
          rowsOut: currentStep?.outputRows?.length || 5,
        },
        onClick: () => onSelectNode('node_final', 'final_output'),
      },
    });

    parsedQuery.finalQuery.from.forEach((fromTbl) => {
      edges.push({
        id: `edge_final_${fromTbl}`,
        source: `cte_${fromTbl}`,
        target: 'node_final',
        animated: isFinalActive,
        style: {
          stroke: isFinalActive ? '#10b981' : '#475569',
          strokeWidth: isFinalActive ? 2.5 : 1.5,
        },
      });
    });

    return { cteNodes: nodes, cteEdges: edges };
  }, [parsedQuery, currentStep, selectedNodeId, onSelectNode]);

  // 2. Build Detailed Logical Operations Graph
  const { opNodes, opEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    let currentX = 60;
    let currentY = 100;
    let prevOpId: string | null = null;

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

      if (prevOpId) {
        edges.push({
          id: `edge_op_${prevOpId}_${op.id}`,
          source: prevOpId,
          target: op.id,
          animated: isSelected,
          style: {
            stroke: isSelected ? '#3b82f6' : '#334155',
            strokeWidth: isSelected ? 2.5 : 1.5,
          },
        });
      }

      prevOpId = op.id;
      currentX += 300;
      if (idx > 0 && idx % 4 === 0) {
        currentX = 60;
        currentY += 180;
      }
    });

    return { opNodes: nodes, opEdges: edges };
  }, [parsedQuery.allOperations, currentStep, selectedNodeId, simulationSteps, onSelectNode]);

  // Active nodes & edges based on mode
  const currentNodes = currentGraphView === 'CTE_DEPENDENCY' ? cteNodes : opNodes;
  const currentEdges = currentGraphView === 'CTE_DEPENDENCY' ? cteEdges : opEdges;

  return (
    <div className="relative w-full h-full bg-slate-950 flex flex-col overflow-hidden">
      {/* View Switcher Top Bar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 p-1 rounded-lg bg-slate-900/90 border border-slate-800 shadow-md backdrop-blur-md">
        <button
          onClick={() => onToggleViewMode('CTE_DEPENDENCY')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            currentGraphView === 'CTE_DEPENDENCY'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>CTE Dependency View</span>
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
          <span>Relational Operations View</span>
        </button>
      </div>

      {/* Legend Indicator */}
      <div className="absolute top-3 right-3 z-10 hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800/80 text-[11px] text-slate-400 backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Source Table</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-400"></span>
          <span>CTE Materialization</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-400"></span>
          <span>Active Step</span>
        </div>
      </div>

      <ReactFlow
        nodes={currentNodes}
        edges={currentEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.5}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={20} size={1} variant={BackgroundVariant.Dots} />
        <Controls className="!bg-slate-900 !border-slate-800 !rounded-lg !shadow-lg [&>button]:!border-slate-800 [&>button]:!bg-slate-900 [&>button]:!text-slate-300 hover:[&>button]:!bg-slate-800" />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'sourceTableNode') return '#10b981';
            if (node.data?.isActive) return '#3b82f6';
            return '#334155';
          }}
          maskColor="rgba(2, 6, 23, 0.7)"
          className="!bg-slate-900/90 !border-slate-800 !rounded-lg !shadow-lg"
        />
      </ReactFlow>
    </div>
  );
};
