import React, { useState, useEffect } from 'react';
import type { DynamicVariable } from '../types/ast';
import { X, Check, Sliders, AlertCircle, RefreshCw, Sparkles, Trash2 } from 'lucide-react';

interface VariablesModalProps {
  isOpen: boolean;
  onClose: () => void;
  variables: DynamicVariable[];
  parameters: { index: number; name: string; value?: string }[];
  currentOverrides: Record<string, string>;
  onApplyOverrides: (newOverrides: Record<string, string>) => void;
}

export function generateAutoFillValues(
  variables: DynamicVariable[],
  parameters: { index: number; name: string; value?: string }[]
): Record<string, string> {
  const filled: Record<string, string> = {};

  for (const v of variables) {
    if (v.resolvedValue) {
      filled[v.name] = v.resolvedValue;
      continue;
    }
    // Only use deterministic values; missing runtime inputs need user input.
  }

  for (const p of parameters) {
    if (p.value !== undefined) filled[p.name] = p.value;
  }

  return filled;
}

export const VariablesModal: React.FC<VariablesModalProps> = ({
  isOpen,
  onClose,
  variables,
  parameters,
  currentOverrides,
  onApplyOverrides,
}) => {
  const [formValues, setFormValues] = useState<Record<string, string>>({
    ...currentOverrides,
  });
  const [autoFilledNotice, setAutoFilledNotice] = useState<boolean>(false);

  useEffect(() => {
    setFormValues({ ...currentOverrides });
  }, [currentOverrides, isOpen]);

  if (!isOpen) return null;

  const handleChange = (key: string, val: string) => {
    setFormValues((prev) => ({
      ...prev,
      [key]: val,
    }));
    setAutoFilledNotice(false);
  };

  const handleAutoFill = () => {
    const autoValues = generateAutoFillValues(variables, parameters);
    setFormValues(prev => ({ ...prev, ...autoValues }));
    setAutoFilledNotice(true);
    setTimeout(() => setAutoFilledNotice(false), 3000);
  };

  const handleClearAll = () => {
    setFormValues({});
    setAutoFilledNotice(false);
  };

  const handleSave = () => {
    onApplyOverrides(formValues);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] rounded-xl border border-slate-800 bg-slate-900 shadow-2xl flex flex-col overflow-hidden text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Dynamic SQL Expressions &amp; Parameters</h3>
              <p className="text-xs text-slate-400">Use JSON string arrays for function inputs, SQL text for expressions, and SQL literals for bind parameters.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="px-5 py-2.5 bg-slate-950/90 border-b border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoFill}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-medium transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Use known values</span>
            </button>

            <button
              onClick={handleClearAll}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          </div>

          {autoFilledNotice && (
            <span className="text-[11px] text-emerald-400 font-medium animate-pulse flex items-center gap-1">
              <Check className="w-3 h-3" /> Known values applied. Enter any missing runtime values.
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4 text-xs font-mono">
          {variables.length === 0 && parameters.length === 0 ? (
            <div className="p-6 rounded-lg bg-slate-950 border border-slate-800 text-center text-slate-400 font-sans">
              No unresolved dynamic expressions or positional parameters detected in this query.
            </div>
          ) : (
            <>
              {/* Dynamic JS Variables */}
              {variables.length > 0 && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-sans flex items-center justify-between">
                    <span>JavaScript Template Expressions ({variables.length})</span>
                    <span className="text-[10px] text-slate-500 lowercase">AST tokenized</span>
                  </div>
                  {variables.map((v) => (
                    <div key={v.name} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-blue-400 font-semibold break-all">{v.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {v.sourceType} · Line {v.line}
                        </span>
                      </div>
                      {v.inputKind === 'string_array' && <p className="text-slate-400">JSON array of SQL predicates, e.g. ["age &gt;= 18"]. Use [] for an empty list.</p>}
                      <textarea
                        aria-label={v.name}
                        rows={v.inputKind === 'string_array' ? 3 : 2}
                        value={formValues[v.name] ?? v.resolvedValue ?? ''}
                        onChange={(e) => handleChange(v.name, e.target.value)}
                        placeholder={v.defaultValue || 'Enter SQL replacement...'}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Positional Parameters $1, $2, etc. */}
              {parameters.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-sans flex items-center justify-between">
                    <span>PostgreSQL Bound Parameters ({parameters.length})</span>
                    <span className="text-[10px] text-slate-500">Prepared statement</span>
                  </div>
                  {parameters.map((p) => (
                    <div key={p.name} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-400 font-semibold">{p.name}</span>
                        <span className="text-[10px] text-slate-500">Positional parameter ${p.index}</span>
                      </div>
                      <input
                        type="text"
                        aria-label={p.name}
                        value={formValues[p.name] ?? p.value ?? ''}
                        onChange={(e) => handleChange(p.name, e.target.value)}
                        placeholder="e.g. '2026-10-20' or 42"
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-800 bg-slate-950">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-md"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Apply &amp; Reconstruct Query</span>
          </button>
        </div>
      </div>
    </div>
  );
};
