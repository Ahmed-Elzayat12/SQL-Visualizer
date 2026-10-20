import React, { useRef } from 'react';
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
import type { DynamicVariable } from '../types/ast';

interface EditorPanelProps {
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
        <div className="flex items-center gap-2">
          <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
          <select
            onChange={(e) => onLoadDemo(e.target.value)}
            defaultValue="gps_ts"
            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
          >
            <option value="gps_ts">Fleet GPS Telemetry (NestJS / TypeScript)</option>
            <option value="gps_sql">Fleet GPS Telemetry (Raw SQL - 8 CTEs)</option>
            <option value="ecommerce">E-Commerce Customer Lifetime Value (Window Functions)</option>
            <option value="posts">Author &amp; Post Engagement (Aggregations &amp; Join)</option>
          </select>
        </div>

        {/* Language switch & Run button */}
        <div className="flex items-center gap-2">
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
        <div className="flex items-center justify-between px-3 py-1.5 bg-blue-950/30 border-b border-blue-900/40 text-xs text-blue-200">
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
                title="Auto-fill dynamic parameters with realistic values"
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 flex items-center gap-1 transition-colors"
              >
                <Sparkles className="w-3 h-3 text-blue-400" />
                <span>Auto-Fill</span>
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

      {/* Monaco Code Editor */}
      <div className="flex-1 w-full h-full relative">
        <Editor
          height="100%"
          language={language}
          value={code}
          onChange={(val) => onChangeCode(val || '')}
          onMount={handleEditorDidMount}
          theme="vs-dark"
          options={{
            fontSize: 12.5,
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
