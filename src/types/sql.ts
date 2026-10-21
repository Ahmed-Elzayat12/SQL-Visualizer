export type SqlOperationType =
  | 'SOURCE_SCAN'
  | 'WHERE_FILTER'
  | 'DERIVED_COLUMNS'
  | 'GROUP_BY_AGGREGATE'
  | 'DISTINCT_ON'
  | 'JOIN'
  | 'UNION_ALL'
  | 'LATERAL_JOIN'
  | 'CASE_WHEN'
  | 'WINDOW_FUNCTION'
  | 'ORDER_BY'
  | 'LIMIT_OFFSET'
  | 'CTE_DEFINITION'
  | 'FINAL_OUTPUT';

export interface SqlColumn {
  name: string;
  expression: string;
  alias?: string;
  type?: string;
  sourceTable?: string;
  sourceColumn?: string;
  isDerived?: boolean;
  isAggregate?: boolean;
}

export interface SqlJoin {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
  table: string;
  alias?: string;
  onCondition?: string;
}

export interface LogicalOperation {
  id: string;
  cteName?: string; // If inside a CTE, or 'main' for final query
  type: SqlOperationType;
  title: string;
  titleAr: string; // Egyptian Arabic title
  sqlSnippet: string;
  codeRange?: { startLine: number; endLine: number; startCol?: number; endCol?: number };
  descriptionEn: string;
  descriptionAr: string; // Egyptian Arabic natural explanation
  inputs: string[]; // input CTEs or physical tables
  inputOperationIds?: string[];
  outputColumns: SqlColumn[];
  performanceTips: {
    category: 'INDEX' | 'MEMORY' | 'CARDINALITY' | 'SCAN' | 'ORDER';
    observation: string;
    whyExpensive: string;
    investigation: string;
    recommendation: string;
  }[];
  sqlConceptNotes: {
    title: string;
    body: string;
  }[];
}

export interface CteNode {
  name: string;
  isMaterialized?: boolean;
  dependencies: string[]; // CTEs or tables this CTE reads from
  rawSql: string;
  operations: LogicalOperation[];
  outputColumns: SqlColumn[];
  lineNumber: number;
}

export interface ParsedSqlQuery {
  rawSql: string;
  sourceTables: string[];
  ctes: CteNode[];
  finalQuery: {
    from: string[];
    operations: LogicalOperation[];
    outputColumns: SqlColumn[];
  };
  allOperations: LogicalOperation[];
  columnLineage: ColumnLineageItem[];
  parseErrors: string[];
  syntaxLimitations: string[];
}

export interface ColumnLineageItem {
  targetColumn: string;
  targetCte: string;
  originTable: string;
  originColumn: string;
  transformationType: 'direct' | 'aggregate' | 'expression' | 'conditional' | 'window';
  expression: string;
}
