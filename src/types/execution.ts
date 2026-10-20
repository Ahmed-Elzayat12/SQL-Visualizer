export type RowStatus =
  | 'normal'
  | 'kept'
  | 'filtered_out'
  | 'grouped'
  | 'matched'
  | 'unmatched_null_padded'
  | 'selected_by_distinct'
  | 'discarded_by_distinct'
  | 'new_column';

export interface DataRow {
  __rowId: string;
  __status?: RowStatus;
  __matchedKey?: string;
  __groupKey?: string;
  __statusReason?: string;
  [key: string]: any;
}

export interface StepExecutionResult {
  stepIndex: number;
  operationId: string;
  cteName?: string;
  operationType: string;
  inputTableName: string;
  inputRows: DataRow[];
  outputRows: DataRow[];
  addedColumns: string[];
  removedColumns: string[];
  highlightedRowIds: string[];
  explanationEn: string;
  explanationAr: string;
  transformationSummary: {
    inputCount: number;
    outputCount: number;
    deltaRows: number;
    deltaCols: number;
    keyMetric?: string;
  };
  executionTimeMs: number;
  estimatedCost: number;
  relativeDurationPercent: number;
  isSlowOperation: boolean;
  algorithmicComplexity: string;
}

export interface ExplainPlanNode {
  nodeType: string;
  relationName?: string;
  alias?: string;
  startupCost?: number;
  totalCost?: number;
  planRows?: number;
  planWidth?: number;
  actualStartupTime?: number;
  actualTotalTime?: number;
  actualRows?: number;
  actualLoops?: number;
  filter?: string;
  rowsRemovedByFilter?: number;
  indexName?: string;
  indexCond?: string;
  joinType?: string;
  hashCond?: string;
  sharedHitBlocks?: number;
  sharedReadBlocks?: number;
  plans?: ExplainPlanNode[];
  cteName?: string;
}

export interface ExplainResult {
  rawJson: string;
  rootNode: ExplainPlanNode;
  planningTimeMs?: number;
  executionTimeMs?: number;
  totalCost: number;
  totalActualTimeMs: number;
  bottlenecks: {
    type: 'HIGH_COST' | 'EXPENSIVE_FILTER' | 'SEQ_SCAN' | 'TEMP_SPILL' | 'SLOW_TIME';
    nodeType: string;
    description: string;
    recommendation: string;
  }[];
}
