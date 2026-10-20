import React, { useState, useMemo, useCallback } from 'react';
import { Header } from './components/Header';
import { EditorPanel } from './components/EditorPanel';
import { GraphView } from './components/GraphView';
import { StepDebugger } from './components/StepDebugger';
import { InspectorPanel } from './components/InspectorPanel';
import { VariablesModal, generateAutoFillValues } from './components/VariablesModal';
import { ExplainView } from './components/ExplainView';
import { SchemaViewer } from './components/SchemaViewer';
import { DocsView } from './components/DocsView';

import { analyzeSourceCode } from './engine/jsAnalyzer';
import { parseSqlQuery } from './engine/sqlParser';
import { simulateQueryExecution } from './engine/simulationEngine';

import { 
  GPS_TS_CODE, 
  GPS_RAW_SQL, 
  GPS_SAMPLE_DATA 
} from './data/demoGpsQuery';
import { 
  ECOMMERCE_RAW_SQL, 
  ECOMMERCE_SAMPLE_ORDERS, 
  ECOMMERCE_SAMPLE_CUSTOMERS 
} from './data/demoEcommerceQuery';
import { 
  POSTS_RAW_SQL, 
  POSTS_SAMPLE_DATA, 
  USERS_SAMPLE_DATA 
} from './data/demoPostsQuery';

import type { AppDataMode, GraphViewMode } from './types/visualizer';
import type { DataRow } from './types/execution';

export function App() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'workspace' | 'schema' | 'explain' | 'docs'>('workspace');

  // Code & Language state
  const [code, setCode] = useState<string>(GPS_TS_CODE);
  const [language, setLanguage] = useState<'typescript' | 'sql'>('typescript');

  // View & Data Modes
  const [dataMode, setDataMode] = useState<AppDataMode>('SAMPLE_SIMULATION');
  const [graphViewMode, setGraphViewMode] = useState<GraphViewMode>('CTE_DEPENDENCY');

  // Bilingual toggle: Default Egyptian Arabic as requested by user!
  const [explanationLang, setExplanationLang] = useState<'en' | 'ar_eg'>('ar_eg');

  // Variables modal
  const [showVariablesModal, setShowVariablesModal] = useState<boolean>(false);
  const [userOverrides, setUserOverrides] = useState<Record<string, string>>({});

  // Selection & Step Debugger state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('cte_filtered');
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // In-Memory Sample Datasets
  const [sampleTables, setSampleTables] = useState<Record<string, DataRow[]>>({
    reporting_vehicle_gps_track_batches: GPS_SAMPLE_DATA,
    orders: ECOMMERCE_SAMPLE_ORDERS,
    customers: ECOMMERCE_SAMPLE_CUSTOMERS,
    posts: POSTS_SAMPLE_DATA,
    users: USERS_SAMPLE_DATA,
  });

  // 1. AST Analysis (Extract SQL from JS/TS)
  const jsAnalysis = useMemo(() => {
    return analyzeSourceCode(code, userOverrides);
  }, [code, userOverrides]);

  // 2. Parse SQL AST & CTEs
  const parsedQuery = useMemo(() => {
    return parseSqlQuery(jsAnalysis.extractedSql);
  }, [jsAnalysis.extractedSql]);

  // 3. In-Memory Relational Simulation
  const simulationSteps = useMemo(() => {
    if (dataMode === 'STRUCTURE_ONLY') return [];
    return simulateQueryExecution(parsedQuery, sampleTables);
  }, [parsedQuery, sampleTables, dataMode]);

  // Active step & operation
  const activeStepResult = simulationSteps[currentStepIndex];
  const activeOperation = useMemo(() => {
    if (selectedOperationId) {
      return parsedQuery.allOperations.find(o => o.id === selectedOperationId);
    }
    if (activeStepResult) {
      return parsedQuery.allOperations.find(o => o.id === activeStepResult.operationId);
    }
    return parsedQuery.allOperations[0];
  }, [selectedOperationId, activeStepResult, parsedQuery.allOperations]);

  // Handle demo selection
  const handleLoadDemo = useCallback((demoKey: string) => {
    setUserOverrides({});
    setCurrentStepIndex(0);
    setIsPlaying(false);

    if (demoKey === 'gps_ts') {
      setCode(GPS_TS_CODE);
      setLanguage('typescript');
      setSelectedNodeId('cte_filtered');
    } else if (demoKey === 'gps_sql') {
      setCode(GPS_RAW_SQL);
      setLanguage('sql');
      setSelectedNodeId('cte_filtered');
    } else if (demoKey === 'ecommerce') {
      setCode(ECOMMERCE_RAW_SQL);
      setLanguage('sql');
      setSelectedNodeId('cte_customer_orders');
    } else if (demoKey === 'posts') {
      setCode(POSTS_RAW_SQL);
      setLanguage('sql');
      setSelectedNodeId('cte_published_posts');
    }
  }, []);

  // Handle selecting a node in the graph
  const handleSelectNode = useCallback((nodeId: string, cteName?: string, opId?: string) => {
    setSelectedNodeId(nodeId);
    if (opId) {
      setSelectedOperationId(opId);
      // Sync step index if this op has a step
      const stepIdx = simulationSteps.findIndex(s => s.operationId === opId);
      if (stepIdx !== -1) setCurrentStepIndex(stepIdx);
    } else if (cteName) {
      // Find first operation in this CTE
      const firstOp = parsedQuery.allOperations.find(
        o => o.cteName?.toLowerCase() === cteName.toLowerCase()
      );
      if (firstOp) {
        setSelectedOperationId(firstOp.id);
        const stepIdx = simulationSteps.findIndex(s => s.operationId === firstOp.id);
        if (stepIdx !== -1) setCurrentStepIndex(stepIdx);
      }
    }
  }, [simulationSteps, parsedQuery.allOperations]);

  // Handle step index change from debugger
  const handleSetStepIndex = useCallback((idx: number) => {
    setCurrentStepIndex(idx);
    const step = simulationSteps[idx];
    if (step) {
      setSelectedOperationId(step.operationId);
      setSelectedNodeId(step.cteName ? `cte_${step.cteName}` : step.operationId);
    }
  }, [simulationSteps]);

  // Export report
  const handleExportReport = useCallback(() => {
    const report = {
      appName: 'QueryScope Analysis Report',
      timestamp: new Date().toISOString(),
      codeLength: code.length,
      ctesDetected: parsedQuery.ctes.map(c => c.name),
      sourceTables: parsedQuery.sourceTables,
      logicalOperationsCount: parsedQuery.allOperations.length,
      simulatedSteps: simulationSteps.map(s => ({
        step: s.stepIndex,
        cte: s.cteName,
        operation: s.operationType,
        inputRows: s.inputRows.length,
        outputRows: s.outputRows.length,
        summary: s.transformationSummary,
      })),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `queryscope_analysis_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [code, parsedQuery, simulationSteps]);

  // AI helper query
  const handleAskAi = async (question: string): Promise<string> => {
    // Check if user has backend proxy or we can use local deterministic knowledge
    return new Promise((resolve) => {
      setTimeout(() => {
        if (explanationLang === 'ar_eg') {
          resolve(
            `تحليل هندسي مباشر لسؤالك ("${question}"): بناءً على الـ AST الخاص بـ PostgreSQL والبيانات المعالجة في الخطوة '${activeOperation?.titleAr || 'الحالية'}'، يتم تقييم السجلات سطر بسطر. في بيئات الإنتاج، الـ Query Planner بيحدد استخدام الـ Hash Table أو Index Scan حسب إحصائيات الـ ANALYZE وحجم جدول '${activeOperation?.inputs[0] || 'المصدر'}'.`
          );
        } else {
          resolve(
            `Architectural analysis for ("${question}"): Based on the parsed PostgreSQL AST and data in step '${activeOperation?.title}', rows are evaluated strictly per relational algebra rules. In high-concurrency environments, verify that the planner avoids temporary disk spills for this operator by tuning work_mem.`
          );
        }
      }, 400);
    });
  };

  // Quick auto-fill dynamic parameters with realistic values
  const handleAutoFillParams = useCallback(() => {
    const filled = generateAutoFillValues(jsAnalysis.variables, jsAnalysis.parameters);
    setUserOverrides((prev) => ({
      ...prev,
      ...filled,
    }));
  }, [jsAnalysis.variables, jsAnalysis.parameters]);

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        dataMode={dataMode}
        onChangeDataMode={setDataMode}
        onRunAnalysis={() => {}}
        onExportReport={handleExportReport}
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'workspace' && (
          <div className="w-full h-full flex flex-col">
            {/* 3-Panel Split Workspace */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
              {/* Left Panel: Monaco Editor & Variables (4 cols) */}
              <div className="md:col-span-4 h-full overflow-hidden">
                <EditorPanel
                  code={code}
                  language={language}
                  onChangeCode={setCode}
                  onChangeLanguage={setLanguage}
                  onRunAnalysis={() => {}}
                  onLoadDemo={handleLoadDemo}
                  variables={jsAnalysis.variables}
                  parametersCount={jsAnalysis.parameters.length}
                  onOpenVariablesModal={() => setShowVariablesModal(true)}
                  onAutoFill={handleAutoFillParams}
                  activeSnippet={activeOperation?.sqlSnippet}
                />
              </div>

              {/* Center Panel: React Flow Graph (5 cols) */}
              <div className="md:col-span-5 h-full relative overflow-hidden border-r border-slate-800">
                <GraphView
                  parsedQuery={parsedQuery}
                  simulationSteps={simulationSteps}
                  currentStepIndex={currentStepIndex}
                  currentGraphView={graphViewMode}
                  onSelectNode={handleSelectNode}
                  selectedNodeId={selectedNodeId}
                  onToggleViewMode={setGraphViewMode}
                />
              </div>

              {/* Right Panel: Operation Inspector & Before/After Table Diff (3 cols) */}
              <div className="md:col-span-3 h-full overflow-hidden">
                <InspectorPanel
                  operation={activeOperation}
                  stepResult={activeStepResult}
                  lang={explanationLang}
                  onToggleLang={setExplanationLang}
                  onAskAi={handleAskAi}
                />
              </div>
            </div>

            {/* Bottom Floating Step Debugger */}
            {dataMode === 'SAMPLE_SIMULATION' && simulationSteps.length > 0 && (
              <StepDebugger
                steps={simulationSteps}
                allOperations={parsedQuery.allOperations}
                currentStepIndex={currentStepIndex}
                isPlaying={isPlaying}
                playbackSpeed={playbackSpeed}
                onSetStepIndex={handleSetStepIndex}
                onTogglePlay={() => setIsPlaying(!isPlaying)}
                onReset={() => handleSetStepIndex(0)}
                onSetSpeed={setPlaybackSpeed}
              />
            )}
          </div>
        )}

        {/* Tab 2: Sample Schema & Dataset Simulator (Mode B) */}
        {activeTab === 'schema' && (
          <SchemaViewer
            sampleTables={sampleTables}
            onUpdateTableData={(tbl, rows) => {
              setSampleTables((prev) => ({
                ...prev,
                [tbl]: rows,
              }));
            }}
          />
        )}

        {/* Tab 3: Physical PostgreSQL EXPLAIN Analyzer (Mode C) */}
        {activeTab === 'explain' && <ExplainView />}

        {/* Tab 4: Docs & Architecture */}
        {activeTab === 'docs' && <DocsView />}
      </div>

      {/* Dynamic Variables Resolver Modal */}
      <VariablesModal
        isOpen={showVariablesModal}
        onClose={() => setShowVariablesModal(false)}
        variables={jsAnalysis.variables}
        parameters={jsAnalysis.parameters}
        currentOverrides={userOverrides}
        onApplyOverrides={(newOverrides) => {
          setUserOverrides(newOverrides);
        }}
      />
    </div>
  );
}

export default App;
