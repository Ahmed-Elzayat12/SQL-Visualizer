import React, { useEffect } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  Zap, 
  ArrowRight,
  Activity,
  Clock,
} from 'lucide-react';
import type { StepExecutionResult } from '../types/execution';
import type { LogicalOperation } from '../types/sql';

interface StepDebuggerProps {
  steps: StepExecutionResult[];
  allOperations: LogicalOperation[];
  currentStepIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  onSetStepIndex: (idx: number) => void;
  onTogglePlay: () => void;
  onReset: () => void;
  onSetSpeed: (speed: number) => void;
}

export const StepDebugger: React.FC<StepDebuggerProps> = ({
  steps,
  allOperations,
  currentStepIndex,
  isPlaying,
  playbackSpeed,
  onSetStepIndex,
  onTogglePlay,
  onReset,
  onSetSpeed,
}) => {
  // Autoplay effect
  useEffect(() => {
    if (!isPlaying) return;
    const intervalTime = Math.round(1800 / playbackSpeed);

    const timer = setInterval(() => {
      onSetStepIndex(
        currentStepIndex >= steps.length - 1 ? 0 : currentStepIndex + 1
      );
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isPlaying, currentStepIndex, steps.length, playbackSpeed, onSetStepIndex]);

  const currentStep = steps[currentStepIndex];
  const currentOp = allOperations[currentStepIndex];

  if (!currentStep) return null;

  return (
    <div className="w-full bg-slate-900/95 border-t border-slate-800 p-3 shrink-0 flex flex-wrap items-center justify-between gap-3 shadow-2xl backdrop-blur-md">
      {/* Left: Step Info & Metric */}
      <div className="flex items-center gap-3 min-w-0 flex-1 basis-64 overflow-hidden">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700/80 text-xs font-mono shrink-0">
          <span className="text-slate-400">Step</span>
          <span className="text-blue-400 font-bold tabular-nums">
            {currentStepIndex + 1}
          </span>
          <span className="text-slate-500">/</span>
          <span className="text-slate-400 tabular-nums">{steps.length}</span>
        </div>

        <div className="truncate">
          <div className="flex items-center gap-2 truncate">
            {currentStep.cteName && (
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                CTE: {currentStep.cteName}
              </span>
            )}
            <span className="text-xs font-semibold text-slate-200 truncate">
              {currentOp?.title || currentStep.operationType}
            </span>
          </div>

          <div className="text-[11px] text-slate-400 truncate mt-0.5">
            {currentStep.explanationEn}
          </div>
        </div>
      </div>

      {/* Center: Playback Controls */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onReset}
          title="Reset to beginning"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          onClick={() => onSetStepIndex(Math.max(0, currentStepIndex - 1))}
          disabled={currentStepIndex === 0}
          title="Previous Step"
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent border border-slate-700/50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button
          onClick={onTogglePlay}
          title={isPlaying ? 'Pause' : 'Play'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs text-white transition-all shadow-md ${
            isPlaying
              ? 'bg-amber-600 hover:bg-amber-500'
              : 'bg-blue-600 hover:bg-blue-500'
          }`}
        >
          {isPlaying ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Step Play</span>
            </>
          )}
        </button>

        <button
          onClick={() => onSetStepIndex(Math.min(steps.length - 1, currentStepIndex + 1))}
          disabled={currentStepIndex === steps.length - 1}
          title="Next Step"
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent border border-slate-700/50 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Speed Selector */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-slate-800/80 border border-slate-700/60 text-[10px] font-mono ml-2">
          {[0.5, 1, 2].map((spd) => (
            <button
              key={spd}
              onClick={() => onSetSpeed(spd)}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                playbackSpeed === spd
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>

      {/* Right: Row Transformation Delta & Execution Time */}
      <div className="hidden lg:flex items-center gap-2.5 shrink-0">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950/80 border border-slate-800 text-xs font-mono">
          <Clock className="w-3 h-3 text-emerald-400" />
          <span className="text-emerald-400 font-semibold tabular-nums">{currentStep.executionTimeMs} ms</span>
          <span className="text-[10px] text-slate-500">({currentStep.relativeDurationPercent}%)</span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-300 px-3 py-1 rounded bg-slate-950/80 border border-slate-800">
          <span className="text-slate-500">Rows:</span>
          <span className="tabular-nums font-semibold">{currentStep.inputRows.length}</span>
          <ArrowRight className="w-3 h-3 text-slate-600" />
          <span className="tabular-nums font-bold text-emerald-400">
            {currentStep.outputRows.length}
          </span>
          <span className="text-[10px] text-slate-500">
            ({currentStep.transformationSummary.deltaRows >= 0 ? '+' : ''}
            {currentStep.transformationSummary.deltaRows})
          </span>
        </div>
      </div>
    </div>
  );
};
