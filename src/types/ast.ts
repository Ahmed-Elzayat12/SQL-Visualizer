export interface DynamicVariable {
  name: string;
  expression: string;
  start: number;
  end: number;
  line: number;
  resolvedValue?: string;
  isResolved: boolean;
  sourceType: 'constant' | 'parameter' | 'predicate_array' | 'identifier' | 'function_parameter' | 'unknown';
  inputKind?: 'string_array';
  defaultValue?: string;
}

export interface JsAnalysisResult {
  hasJsWrapper: boolean;
  extractedSql: string;
  originalCode: string;
  variables: DynamicVariable[];
  parameters: { index: number; name: string; value?: string }[];
  isFullyResolved: boolean;
  isStructureReady: boolean;
  assumptions: string[];
  syntaxErrors: string[];
  frameworkDetected?: 'NestJS' | 'TypeORM' | 'pg' | 'Raw SQL' | 'Generic TS';
  functionOrMethodName?: string;
}
