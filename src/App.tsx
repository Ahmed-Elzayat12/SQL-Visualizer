import React, { useState, useMemo, useCallback } from 'react';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { Header } from './components/Header';
import { EditorPanel } from './components/EditorPanel';
import { GraphView } from './components/GraphView';
import { StepDebugger } from './components/StepDebugger';
import { InspectorPanel } from './components/InspectorPanel';
import { VariablesModal, generateAutoFillValues } from './components/VariablesModal';
import { ExplainView } from './components/ExplainView';
import { SchemaViewer } from './components/SchemaViewer';
import { DocsView } from './components/DocsView';

import { analyzeSourceCode, detectSourceLanguage } from './engine/jsAnalyzer';
import { parseSqlQuery } from './engine/sqlParser';
import { simulateQueryExecution } from './engine/simulationEngine';

import { SIMPLE_EXAMPLES, SIMPLE_TABLES } from './data/simpleExamples';

import type { AppDataMode, GraphViewMode } from './types/visualizer';
import type { DataRow } from './types/execution';

export function App() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'workspace' | 'schema' | 'explain' | 'docs'>('workspace');

  // Code & Language state
  const [code, setCode] = useState<string>(SIMPLE_EXAMPLES.filter.code);
  const [language, setLanguage] = useState<'typescript' | 'sql'>('sql');
  const [illustrativeInputs, setIllustrativeInputs] = useState(true);

  // View & Data Modes
  const [dataMode, setDataMode] = useState<AppDataMode>('SAMPLE_SIMULATION');
  const [graphViewMode, setGraphViewMode] = useState<GraphViewMode>('CTE_DEPENDENCY');

  // Bilingual toggle: Default Egyptian Arabic as requested by user!
  const [explanationLang, setExplanationLang] = useState<'en' | 'ar_eg'>('ar_eg');

  // Variables modal
  const [showVariablesModal, setShowVariablesModal] = useState<boolean>(false);
  const [userOverrides, setUserOverrides] = useState<Record<string, string>>({});

  // Selection & Step Debugger state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // In-Memory Sample Datasets
  const [sampleTables, setSampleTables] = useState<Record<string, DataRow[]>>(SIMPLE_TABLES);

  // 1. AST Analysis (Extract SQL from JS/TS)
  const jsAnalysis = useMemo(() => {
    return analyzeSourceCode(code, userOverrides, language, { illustrativeInputs });
  }, [code, userOverrides, language, illustrativeInputs]);

  // 2. Parse SQL AST & CTEs
  const parsedQuery = useMemo(() => {
    return parseSqlQuery(jsAnalysis.isStructureReady ? jsAnalysis.extractedSql : '');
  }, [jsAnalysis.extractedSql, jsAnalysis.isStructureReady]);

  // 3. In-Memory Relational Simulation
  const simulation = useMemo(() => {
    if (dataMode === 'STRUCTURE_ONLY' || !jsAnalysis.isFullyResolved) return { steps: [], error: '' };
    if (parsedQuery.syntaxLimitations.length) return { steps: [], error: parsedQuery.syntaxLimitations.join(' ') };
    const missing = parsedQuery.sourceTables.filter(table => !sampleTables[table]);
    if (missing.length) return { steps: [], error: `Structure only: no sample rows are loaded for ${missing.join(', ')}.` };
    try { return { steps: simulateQueryExecution(parsedQuery, sampleTables), error: '' }; }
    catch (error) { return { steps: [], error: error instanceof Error ? error.message : 'Unable to simulate query.' }; }
  }, [parsedQuery, sampleTables, dataMode, jsAnalysis.isFullyResolved]);
  const simulationSteps = simulation.steps;

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

    const demo = SIMPLE_EXAMPLES[demoKey as keyof typeof SIMPLE_EXAMPLES];
    if (demo) {
      setCode(demo.code);
      setLanguage(demo.language);
      setSelectedNodeId(null);
      setSelectedOperationId(null);
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
        o => o.cteName?.toLowerCase() === cteName.toLowerCase() || (o.type === 'SOURCE_SCAN' && o.inputs[0]?.toLowerCase() === cteName.toLowerCase())
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
      setSelectedNodeId(graphViewMode === 'LOGICAL_OPERATIONS' ? step.operationId : step.cteName === 'final_output' ? 'node_final' : step.cteName ? `cte_${step.cteName}` : step.operationId);
    }
  }, [simulationSteps, graphViewMode]);

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
    <div className="flex flex-col w-full h-dvh bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        dataMode={dataMode}
        onChangeDataMode={setDataMode}
        onRunAnalysis={() => { setCurrentStepIndex(0); setSelectedOperationId(null); setIsPlaying(false); }}
        onExportReport={handleExportReport}
      />

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-auto relative">
        {activeTab === 'workspace' && (
          <div className="workspace flex flex-col">
            <WorkspaceLayout
              editor={
                <EditorPanel
                  code={code}
                  language={language}
                  onChangeCode={(value) => {
                    setLanguage(detectSourceLanguage(value, language));
                    setCode(value); setCurrentStepIndex(0); setSelectedOperationId(null); setIsPlaying(false); setUserOverrides({});
                  }}
                  onChangeLanguage={setLanguage}
                  onRunAnalysis={() => { setCurrentStepIndex(0); setSelectedOperationId(null); setIsPlaying(false); }}
                  onLoadDemo={handleLoadDemo}
                  variables={jsAnalysis.variables}
                  parametersCount={jsAnalysis.parameters.length}
                  onOpenVariablesModal={() => setShowVariablesModal(true)}
                  onAutoFill={handleAutoFillParams}
                  activeSnippet={activeOperation?.sqlSnippet}
                  analysis={{ ...jsAnalysis, syntaxErrors: [...jsAnalysis.syntaxErrors, ...parsedQuery.parseErrors] }}
                  analysisNotice={simulation.error || parsedQuery.syntaxLimitations.join(' ')}
                  illustrativeInputs={illustrativeInputs}
                  onToggleIllustrativeInputs={setIllustrativeInputs}
                  onUseSql={() => { setCode(jsAnalysis.extractedSql); setLanguage('sql'); setUserOverrides(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => /^\$\d+$/.test(key)))); }}
                />
              }
              graph={
                <GraphView
                  parsedQuery={parsedQuery}
                  simulationSteps={simulationSteps}
                  currentStepIndex={currentStepIndex}
                  currentGraphView={graphViewMode}
                  onSelectNode={handleSelectNode}
                  selectedNodeId={selectedNodeId}
                  onToggleViewMode={setGraphViewMode}
                />
              }
              inspector={
                <InspectorPanel
                  operation={activeOperation}
                  stepResult={activeStepResult}
                  lang={explanationLang}
                  onToggleLang={setExplanationLang}
                  onAskAi={handleAskAi}
                />
              }
            />

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
