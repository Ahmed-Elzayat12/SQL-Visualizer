import React, { useState } from 'react';
import type { LogicalOperation } from '../types/sql';
import type { StepExecutionResult, DataRow } from '../types/execution';
import { getDetailedStepExplanation } from '../engine/deterministicExplainer';
import { 
  Check, 
  Copy, 
  HelpCircle, 
  Sparkles, 
  AlertTriangle, 
  Table, 
  Layers, 
  ArrowRight,
  Send,
  Languages,
  Info,
  Clock,
  Zap,
  Gauge,
  TrendingUp,
} from 'lucide-react';

interface InspectorPanelProps {
  operation?: LogicalOperation;
  stepResult?: StepExecutionResult;
  lang: 'en' | 'ar_eg';
  onToggleLang: (lang: 'en' | 'ar_eg') => void;
  onAskAi: (question: string) => Promise<string>;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  operation,
  stepResult,
  lang,
  onToggleLang,
  onAskAi,
}) => {
  const [activeTab, setActiveTab] = useState<'diff' | 'output' | 'performance' | 'qa'>('diff');
  const [copied, setCopied] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [aiAnswers, setAiAnswers] = useState<Array<{ q: string; a: string }>>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  if (!operation) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
        <Layers className="w-10 h-10 mb-3 stroke-1 text-slate-600" />
        <p className="text-sm font-medium text-slate-400">Select an Operation or CTE Node</p>
        <p className="text-xs text-slate-500 mt-1 max-w-[260px]">
          Click on any node in the flowchart or step in the debugger to inspect its transformations and data diffs.
        </p>
      </div>
    );
  }

  const detailedExp = getDetailedStepExplanation(operation, stepResult, lang);
  const isAr = lang === 'ar_eg';

  const handleCopySql = () => {
    navigator.clipboard.writeText(operation.sqlSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendCustomQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQuestion.trim() || isAiLoading) return;
    const q = customQuestion.trim();
    setCustomQuestion('');
    setIsAiLoading(true);
    try {
      const answer = await onAskAi(q);
      setAiAnswers((prev) => [...prev, { q, a: answer }]);
      setActiveTab('qa');
    } catch {
      setAiAnswers((prev) => [
        ...prev,
        {
          q,
          a: isAr
            ? 'عذراً، حدث خطأ أثناء الاتصال بالـ AI. يمكنك الاعتماد على الشرح الهندسي الدقيق الموجود في التبويب.'
            : 'Error querying AI assistant. Please refer to the built-in deterministic explanation.',
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 border-l border-slate-800 overflow-hidden text-slate-200">
      {/* Top Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold uppercase">
              {operation.type.replace(/_/g, ' ')}
            </span>
            {operation.cteName && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                CTE: {operation.cteName}
              </span>
            )}
          </div>

          {/* Bilingual Toggle */}
          <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-md border border-slate-700/80 text-xs font-mono">
            <button
              onClick={() => onToggleLang('ar_eg')}
              className={`px-2 py-0.5 rounded transition-colors ${
                isAr ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="اللهجة المصرية الهندسية"
            >
              🇪🇬 مصري
            </button>
            <button
              onClick={() => onToggleLang('en')}
              className={`px-2 py-0.5 rounded transition-colors ${
                !isAr ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="English"
            >
              EN
            </button>
          </div>
        </div>

        <h3 className="text-base font-bold text-slate-100" dir={isAr ? 'rtl' : 'ltr'}>
          {isAr ? operation.titleAr : operation.title}
        </h3>

        <p className="text-xs text-slate-400 mt-1 leading-relaxed" dir={isAr ? 'rtl' : 'ltr'}>
          {detailedExp.summary}
        </p>

        {/* Execution Time Estimates & Bottleneck Tag */}
        {stepResult && (
          <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  <span>Est. Runtime</span>
                </span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-sm font-bold text-emerald-400 tabular-nums">
                    {stepResult.executionTimeMs} ms
                  </span>
                  <span className="text-[10px] text-slate-500 font-sans">
                    ({stepResult.relativeDurationPercent}% of total)
                  </span>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Zap className="w-3 h-3 text-blue-400" />
                  <span>Cost &amp; Scale</span>
                </span>
                <div className="flex items-baseline gap-1.5 mt-1 truncate">
                  <span className="text-sm font-bold text-blue-400 tabular-nums">
                    {stepResult.estimatedCost}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">
                    {stepResult.algorithmicComplexity}
                  </span>
                </div>
              </div>
            </div>

            {stepResult.isSlowOperation && (
              <div className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-center gap-1.5 font-sans" dir={isAr ? 'rtl' : 'ltr'}>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="font-medium">
                  {isAr
                    ? `عنق زجاجة محتمل: العملية دي بتستهلك ${stepResult.relativeDurationPercent}% من إجمالي وقت الكويري`
                    : `Potential Bottleneck: Consumes ${stepResult.relativeDurationPercent}% of total query runtime`}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center border-b border-slate-800 bg-slate-950 px-2 text-xs font-mono">
        <button
          onClick={() => setActiveTab('diff')}
          className={`px-3 py-2 border-b-2 font-medium transition-colors ${
            activeTab === 'diff'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Data Diff & Table
        </button>
        <button
          onClick={() => setActiveTab('output')}
          className={`px-3 py-2 border-b-2 font-medium transition-colors ${
            activeTab === 'output'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          SQL Fragment
        </button>
        <button
          onClick={() => setActiveTab('performance')}
          className={`px-3 py-2 border-b-2 font-medium transition-colors ${
            activeTab === 'performance'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Performance ({operation.performanceTips.length})
        </button>
        <button
          onClick={() => setActiveTab('qa')}
          className={`px-3 py-2 border-b-2 font-medium transition-colors flex items-center gap-1 ${
            activeTab === 'qa'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>Ask AI & FAQ</span>
        </button>
      </div>

      {/* Main Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* TAB 1: DATA DIFF & INTERMEDIATE TABLE */}
        {activeTab === 'diff' && (
          <div className="space-y-4">
            {/* Why it exists callout */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800" dir={isAr ? 'rtl' : 'ltr'}>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-1">
                <Info className="w-3.5 h-3.5 text-blue-400" />
                <span>{isAr ? 'ليه الخطوة دي موجودة؟' : 'Why this operation exists:'}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{detailedExp.whyItExists}</p>
            </div>

            {/* Step Before / After Data Previews */}
            {stepResult ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <div className="flex items-center gap-2">
                    <Table className="w-3.5 h-3.5 text-slate-500" />
                    <span>Intermediate Data Preview ({stepResult.outputRows.length} rows)</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Input: {stepResult.inputRows.length} ➔ Output: {stepResult.outputRows.length}
                  </span>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
                        <th className="py-2 px-3 text-[11px] font-semibold">Row Status</th>
                        {stepResult.outputRows.length > 0 &&
                          Object.keys(stepResult.outputRows[0])
                            .filter((k) => !k.startsWith('__'))
                            .map((col) => (
                              <th key={col} className="py-2 px-3 text-[11px] font-semibold text-slate-300 whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {stepResult.outputRows.map((row, idx) => {
                        let statusBadge = (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">Normal</span>
                        );
                        let rowClass = 'hover:bg-slate-900/50';

                        if (row.__status === 'kept') {
                          statusBadge = (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Kept (Pass)
                            </span>
                          );
                          rowClass = 'bg-emerald-950/10 hover:bg-emerald-950/20';
                        } else if (row.__status === 'filtered_out') {
                          statusBadge = (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              Excluded
                            </span>
                          );
                          rowClass = 'bg-rose-950/20 opacity-60 line-through';
                        } else if (row.__status === 'selected_by_distinct') {
                          statusBadge = (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                              Top DISTINCT
                            </span>
                          );
                          rowClass = 'bg-cyan-950/15 hover:bg-cyan-950/25';
                        } else if (row.__status === 'grouped') {
                          statusBadge = (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              Aggregated
                            </span>
                          );
                          rowClass = 'bg-purple-950/15';
                        } else if (row.__status === 'matched') {
                          statusBadge = (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                              Join Match
                            </span>
                          );
                        } else if (row.__status === 'unmatched_null_padded') {
                          statusBadge = (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              LEFT NULLs
                            </span>
                          );
                        }

                        return (
                          <tr key={row.__rowId || idx} className={`transition-colors ${rowClass}`}>
                            <td className="py-2 px-3 whitespace-nowrap">{statusBadge}</td>
                            {Object.keys(stepResult.outputRows[0])
                              .filter((k) => !k.startsWith('__'))
                              .map((col) => {
                                const val = row[col];
                                const isNull = val === null || val === undefined;
                                return (
                                  <td
                                    key={col}
                                    className={`py-2 px-3 whitespace-nowrap ${
                                      isNull ? 'text-amber-500/70 italic' : 'text-slate-200'
                                    }`}
                                  >
                                    {isNull ? 'NULL' : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                  </td>
                                );
                              })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-400">
                No simulated data active for this step. Switch to Sample Data Simulation mode to see intermediate rows.
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SQL FRAGMENT */}
        {activeTab === 'output' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>SQL Code Fragment</span>
              <button
                onClick={handleCopySql}
                className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <pre className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-blue-300 overflow-x-auto leading-relaxed">
              {operation.sqlSnippet}
            </pre>

            {/* Output columns list */}
            <div className="mt-4">
              <h4 className="text-xs font-mono text-slate-400 mb-2">Projected / Evaluated Columns</h4>
              <div className="grid grid-cols-1 gap-1.5">
                {operation.outputColumns.map((col) => (
                  <div
                    key={col.name}
                    className="p-2 rounded bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs font-mono"
                  >
                    <span className="font-semibold text-slate-200">{col.name}</span>
                    <span className="text-[11px] text-slate-500 truncate max-w-[200px]">{col.expression}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PERFORMANCE INSIGHTS */}
        {activeTab === 'performance' && (
          <div className="space-y-3">
            {/* Execution Timing Breakdown Card */}
            {stepResult && (
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Execution Time &amp; Cost Analysis</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {stepResult.algorithmicComplexity}
                  </span>
                </div>

                {/* Progress bar of relative time share */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span>Query Runtime Share</span>
                    <span className="text-emerald-400 font-bold">{stepResult.relativeDurationPercent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      style={{ width: `${Math.max(4, Math.min(100, stepResult.relativeDurationPercent))}%` }}
                      className={`h-full rounded-full transition-all duration-300 ${
                        stepResult.isSlowOperation ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono">
                  <div className="p-2 rounded bg-slate-900 border border-slate-800/80">
                    <div className="text-slate-500 text-[10px]">Estimated Time</div>
                    <div className="text-emerald-400 font-bold mt-0.5">{stepResult.executionTimeMs} ms</div>
                  </div>
                  <div className="p-2 rounded bg-slate-900 border border-slate-800/80">
                    <div className="text-slate-500 text-[10px]">Estimated Cost</div>
                    <div className="text-blue-400 font-bold mt-0.5">{stepResult.estimatedCost}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-900 border border-slate-800/80">
                    <div className="text-slate-500 text-[10px]">Rows Handled</div>
                    <div className="text-slate-200 font-bold mt-0.5">{stepResult.inputRows.length}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800" dir={isAr ? 'rtl' : 'ltr'}>
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 mb-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{isAr ? 'ملاحظة الأداء في الـ PostgreSQL' : 'PostgreSQL Execution Note'}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{detailedExp.performanceNote}</p>
            </div>

            {operation.performanceTips.map((tip, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-950/90 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">{tip.observation}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {tip.category}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{tip.whyExpensive}</p>
                <div className="text-[11px] text-emerald-400 font-mono bg-emerald-950/20 p-2 rounded border border-emerald-900/30">
                  <span className="font-semibold">💡 Recommendation: </span>
                  {tip.recommendation}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: ASK AI & FAQ */}
        {activeTab === 'qa' && (
          <div className="space-y-4">
            {/* Pre-answered FAQs for this operation */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                {isAr ? 'الأسئلة الشائعة حول هذه الخطوة' : 'Frequent Architectural Questions'}
              </h4>

              {detailedExp.faqAnswers.map((faq, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5"
                  dir={isAr ? 'rtl' : 'ltr'}
                >
                  <div className="text-xs font-semibold text-blue-300 flex items-start gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <span>{faq.question}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed pr-5">{faq.answer}</p>
                </div>
              ))}
            </div>

            {/* Custom AI Chat history */}
            {aiAnswers.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <h4 className="text-xs font-mono text-slate-400 uppercase tracking-wider">Custom AI Queries</h4>
                {aiAnswers.map((item, idx) => (
                  <div key={idx} className="space-y-1.5 text-xs">
                    <div className="p-2.5 rounded bg-slate-800/80 text-slate-200 font-medium">Q: {item.q}</div>
                    <div className="p-3 rounded bg-blue-950/20 border border-blue-900/40 text-blue-100 leading-relaxed">
                      {item.a}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Ask AI Input */}
            <form onSubmit={handleSendCustomQuestion} className="pt-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder={
                    isAr
                      ? 'اسأل الـ AI عن أي سطر أو خطوة (مثلاً: ليه الصف ده مستبعد؟)'
                      : 'Ask about this step (e.g. Could this JOIN duplicate rows?)'
                  }
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={isAiLoading || !customQuestion.trim()}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium flex items-center gap-1 transition-colors"
                >
                  <Send className="w-3 h-3" />
                  <span>{isAiLoading ? 'Analyzing...' : 'Ask'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
