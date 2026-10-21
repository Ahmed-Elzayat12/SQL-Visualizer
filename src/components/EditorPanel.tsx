import React, { useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { 
  Code2, 
  Play, 
  Sparkles, 
  Sliders, 
  FolderOpen, 
  FileCode,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { SIMPLE_EXAMPLES } from '../data/simpleExamples';
import type { JsAnalysisResult, DynamicVariable } from '../types/ast';

interface EditorPanelProps {
  analysis: JsAnalysisResult;
  analysisNotice?: string;
  illustrativeInputs: boolean;
  onToggleIllustrativeInputs: (value: boolean) => void;
  onUseSql: () => void;
  code: string;
  language: 'typescript' | 'sql';
  onChangeCode: (newCode: string) => void;
  onChangeLanguage: (newLang: 'typescript' | 'sql') => void;
  onRunAnalysis: () => void;
  onLoadDemo: (demoKey: string) => void;
  variables: DynamicVariable[];
  parametersCount: number;
  onOpenVariablesModal: () => void;
  onAutoFill?: () => void;
  activeSnippet?: string;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  analysis,
  analysisNotice,
  illustrativeInputs,
  onToggleIllustrativeInputs,
  onUseSql,
  code,
  language,
  onChangeCode,
  onChangeLanguage,
  onRunAnalysis,
  onLoadDemo,
  variables,
  parametersCount,
  onOpenVariablesModal,
  onAutoFill,
  activeSnippet,
}) => {
  const editorRef = useRef<any>(null);
  const [showGeneratedSql, setShowGeneratedSql] = useState(false);
  const showingGeneratedSql = useRef(showGeneratedSql);
  // Monaco updates its model before React refreshes its change subscription.
  showingGeneratedSql.current = showGeneratedSql;

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Define dark theme adjustments for SQL & TS
    monaco.editor.defineTheme('queryscope-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '60a5fa', fontStyle: 'bold' },
        { token: 'string', foreground: '34d399' },
        { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
        { token: 'number', foreground: 'f59e0b' },
        { token: 'type', foreground: 'c084fc' },
      ],
      colors: {
        'editor.background': '#020617', // slate-950
        'editor.foreground': '#f8fafc',
        'editorLineNumber.foreground': '#334155',
        'editorLineNumber.activeForeground': '#60a5fa',
        'editor.selectionBackground': '#1e3a8a66',
        'editor.lineHighlightBackground': '#0f172a88',
      },
    });

    monaco.editor.setTheme('queryscope-dark');
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 border-r border-slate-800 overflow-hidden">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/90 gap-2 flex-wrap">
        {/* Demo Selector */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
          <select
            onChange={(e) => onLoadDemo(e.target.value)}
            value=""
            aria-label="Load a simple example"
            className="max-w-full min-w-0 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
          >
            <option value="" disabled>Load a simple example</option>
            {Object.entries(SIMPLE_EXAMPLES).map(([key, demo]) => <option key={key} value={key}>{demo.label}</option>)}
          </select>
        </div>

        {/* Language switch & Run button */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800 text-[11px] font-mono">
            <button
              onClick={() => onChangeLanguage('typescript')}
              className={`px-2 py-0.5 rounded transition-colors ${
                language === 'typescript'
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              TypeScript / JS
            </button>
            <button
              onClick={() => onChangeLanguage('sql')}
              className={`px-2 py-0.5 rounded transition-colors ${
                language === 'sql'
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              PostgreSQL
            </button>
          </div>

          <button
            onClick={onRunAnalysis}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Analyze</span>
          </button>
        </div>
      </div>

      {/* Dynamic Variables Resolver Bar (if variables or params exist) */}
      {(variables.length > 0 || parametersCount > 0) && (
        <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-1.5 bg-blue-950/30 border-b border-blue-900/40 text-xs text-blue-200">
          <div className="flex items-center gap-2 truncate">
            <Sliders className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="truncate">
              Detected {variables.length} dynamic JS expression(s) &amp; {parametersCount} parameter(s)
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {onAutoFill && (
              <button
                onClick={onAutoFill}
                title="Reuse known values for static expressions and parameters"
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 flex items-center gap-1 transition-colors"
              >
                <Sparkles className="w-3 h-3 text-blue-400" />
                <span>Known values</span>
              </button>
            )}
            <button
              onClick={onOpenVariablesModal}
              className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              Resolve Variables
            </button>
          </div>
        </div>
      )}

      <div className="shrink-0 border-b border-slate-800 p-3 text-xs space-y-2 max-h-48 overflow-auto" aria-live="polite">
        <p className="text-slate-400">Paste SQL or a TS function. Local expression helpers and CTE fragments are supported. For QueryBuilder, paste getQueryAndParameters() output.</p>
        {language === 'typescript' && <label className="flex items-start gap-2 text-slate-300">
          <input type="checkbox" checked={illustrativeInputs} onChange={event => onToggleIllustrativeInputs(event.target.checked)} />
          Use illustrative values for missing predicate arrays
        </label>}
        {analysis.assumptions.length > 0 && <div className="rounded border border-amber-800 bg-amber-950/30 p-2 text-amber-200" data-testid="preview-assumptions">
          <p className="font-semibold">Illustrative structure preview</p>
          <ul className="list-disc pl-4 mt-1 space-y-1">{analysis.assumptions.map((assumption, i) => <li key={i}>{assumption}</li>)}</ul>
          <button onClick={onOpenVariablesModal} className="mt-2 underline">Edit actual inputs</button>
        </div>}
        {analysisNotice && <p className="text-slate-400">{analysisNotice}</p>}
        {analysis.syntaxErrors.map((error, i) => <p key={i} role="alert" className="text-amber-300 break-words">{error}</p>)}
        {!analysis.isStructureReady && !analysis.syntaxErrors.length && <p className="text-amber-300">Resolve the missing template inputs to build the graph.</p>}
        {analysis.isStructureReady && analysis.parameters.some(param => param.value === undefined) && <p className="text-slate-400">SQL parameters remain as placeholders. Values are optional for the structure graph.</p>}
        {analysis.hasJsWrapper && analysis.extractedSql && <details>
          <summary className="cursor-pointer text-blue-300">Extracted SQL - {analysis.isStructureReady ? 'Structure ready' : 'Needs inputs'}</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-slate-300 select-text">{analysis.extractedSql}</pre>
          <button disabled={!analysis.isStructureReady} onClick={onUseSql} className="mt-2 rounded bg-blue-600 px-3 py-1 disabled:opacity-40">Use extracted SQL</button>
        </details>}
      </div>
      {/* Monaco Code Editor */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-800 text-xs" role="tablist" aria-label="Code view">
        <button role="tab" aria-selected={!showGeneratedSql} onClick={() => setShowGeneratedSql(false)} className={!showGeneratedSql ? 'text-blue-300' : 'text-slate-400'}>Source</button>
        <button role="tab" aria-selected={showGeneratedSql} disabled={!analysis.extractedSql} onClick={() => setShowGeneratedSql(true)} className={showGeneratedSql ? 'text-blue-300' : 'text-slate-400 disabled:opacity-40'}>Generated SQL</button>
        {showGeneratedSql && <span className="text-[10px] text-slate-500">Read-only preview</span>}
      </div>
      <div className="flex-1 min-h-0 w-full relative">
        <Editor
          height="100%"
          path={showGeneratedSql ? 'queryscope-generated.sql' : 'queryscope-source.ts'}
          language={showGeneratedSql ? 'sql' : language}
          value={showGeneratedSql ? analysis.extractedSql : code}
          onChange={(val) => { if (!showingGeneratedSql.current) onChangeCode(val || ''); }}
          onMount={handleEditorDidMount}
          theme="vs-dark"
          options={{
            automaticLayout: true,
            readOnly: showGeneratedSql,
            fontSize: 13,
            lineHeight: 20,
            fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            folding: true,
            tabSize: 2,
            padding: { top: 10, bottom: 10 },
          }}
        />
      </div>
    </div>
  );
};
