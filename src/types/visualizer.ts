import type { Node, Edge } from '@xyflow/react';

export type GraphViewMode = 'CTE_DEPENDENCY' | 'LOGICAL_OPERATIONS' | 'COLUMN_LINEAGE';
export type AppDataMode = 'STRUCTURE_ONLY' | 'SAMPLE_SIMULATION' | 'EXPLAIN_ANALYSIS';

export interface VisualizerState {
  code: string;
  language: 'typescript' | 'javascript' | 'sql';
  currentDataMode: AppDataMode;
  currentGraphView: GraphViewMode;
  selectedNodeId: string | null;
  selectedOperationId: string | null;
  currentStepIndex: number;
  isPlaying: boolean;
  playbackSpeed: number; // 0.5, 1, 2
  explanationLang: 'en' | 'ar_eg'; // English vs Egyptian Arabic!
  showVariablesModal: boolean;
  userVariableOverrides: Record<string, string>;
  activeTab: 'workspace' | 'schema' | 'explain' | 'docs';
}

export interface NodeCustomData {
  id: string;
  label: string;
  sublabel?: string;
  type: string;
  cteName?: string;
  isCteNode?: boolean;
  isSourceTable?: boolean;
  operationType?: string;
  sqlSnippet?: string;
  isActive?: boolean;
  isHighlighted?: boolean;
  isUpstream?: boolean;
  isDownstream?: boolean;
  stats?: {
    rowsIn?: number;
    rowsOut?: number;
    durationMs?: number;
  };
  onClick?: () => void;
}
