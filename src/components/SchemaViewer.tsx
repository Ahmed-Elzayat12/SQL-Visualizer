import React, { useState } from 'react';
import type { DataRow } from '../types/execution';
import { Database, Plus, Upload, Table as TableIcon, FileText } from 'lucide-react';

interface SchemaViewerProps {
  sampleTables: Record<string, DataRow[]>;
  onUpdateTableData: (tableName: string, newRows: DataRow[]) => void;
}

export const SchemaViewer: React.FC<SchemaViewerProps> = ({
  sampleTables,
  onUpdateTableData,
}) => {
  const tableNames = Object.keys(sampleTables);
  const [activeTable, setActiveTable] = useState<string>(tableNames[0] || 'users');
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');

  const currentRows = sampleTables[activeTable] || [];

  const handleApplyImport = () => {
    try {
      const parsed = JSON.parse(importJsonText);
      if (Array.isArray(parsed)) {
        onUpdateTableData(activeTable, parsed);
        setShowJsonImport(false);
      }
    } catch (e) {
      alert('Invalid JSON array');
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-200 overflow-hidden">
      {/* Top Bar */}
      <div className="flex flex-wrap gap-3 items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Database Schema &amp; Sample Data Simulation Environment
          </h2>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Mode B
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setImportJsonText(JSON.stringify(currentRows, null, 2));
              setShowJsonImport(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import / Edit JSON</span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 overflow-auto">
        {/* Table Selector Sidebar */}
        <div className="md:col-span-3 border-r border-slate-800 bg-slate-950 p-3 space-y-1 overflow-y-auto">
          <div className="text-[11px] font-mono uppercase text-slate-500 px-2 py-1 tracking-wider">
            Sample Tables ({tableNames.length})
          </div>
          {tableNames.map((tbl) => (
            <button
              key={tbl}
              onClick={() => setActiveTable(tbl)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-colors flex items-center justify-between ${
                activeTable === tbl
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <TableIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{tbl}</span>
              </div>
              <span className="text-[10px] text-slate-500 tabular-nums font-semibold">
                {sampleTables[tbl]?.length ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Table Rows Data Grid */}
        <div className="md:col-span-9 min-w-0 flex flex-col overflow-auto p-4">
          <div className="flex items-center justify-between mb-3 text-xs font-mono">
            <span className="text-slate-400">
              Showing <span className="text-slate-100 font-bold">{currentRows.length}</span> sample rows for table &apos;{activeTable}&apos;
            </span>
            <span className="text-[11px] text-emerald-400">Isolated In-Memory Environment</span>
          </div>

          <div className="flex-1 overflow-auto rounded-xl border border-slate-800 bg-slate-900/60">
            {currentRows.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900 text-slate-400 sticky top-0">
                    {Object.keys(currentRows[0])
                      .filter((k) => !k.startsWith('__'))
                      .map((col) => (
                        <th key={col} className="py-2.5 px-3 text-[11px] font-semibold text-slate-300 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {currentRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                      {Object.keys(currentRows[0])
                        .filter((k) => !k.startsWith('__'))
                        .map((col) => {
                          const val = row[col];
                          const isNull = val === null || val === undefined;
                          return (
                            <td key={col} className="py-2 px-3 whitespace-nowrap">
                              {isNull ? (
                                <span className="text-amber-500/70 italic">NULL</span>
                              ) : (
                                <span className="text-slate-200">{String(val)}</span>
                              )}
                            </td>
                          );
                        })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-slate-500 text-xs">No records available in this table.</div>
            )}
          </div>
        </div>
      </div>

      {/* JSON Import Modal */}
      {showJsonImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100">Edit Table Dataset (JSON Array)</h3>
            <textarea
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              rows={14}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
            <div className="flex justify-end gap-2 text-xs font-mono">
              <button
                onClick={() => setShowJsonImport(false)}
                className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyImport}
                className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
              >
                Save &amp; Update Simulation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
