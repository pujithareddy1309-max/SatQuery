import React, { useState } from 'react';
import { Terminal, Copy, CheckCircle2, ChevronRight, ChevronDown, Check, AlertCircle } from 'lucide-react';
import { AgentTrace } from '../types';

interface ExecutionTraceProps {
  trace: AgentTrace | null;
}

export const ExecutionTrace: React.FC<ExecutionTraceProps> = ({ trace }) => {
  const [viewMode, setViewMode] = useState<'timeline' | 'json'>('timeline');
  const [copied, setCopied] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});

  if (!trace) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleStep = (idx: number) => {
    setExpandedSteps((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-950/40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">Autonomous Execution Trace</h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            {trace.elapsedSeconds}s
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
            {trace.planner}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-800 p-0.5 border border-slate-700 text-xs">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer font-medium ${
                viewMode === 'timeline' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setViewMode('json')}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer font-medium ${
                viewMode === 'json' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              JSON
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
          >
            {copied ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {viewMode === 'timeline' ? (
          <div className="space-y-3">
            {trace.steps.map((step, idx) => {
              const isExpanded = !!expandedSteps[idx];
              const isError = !!step.error;

              return (
                <div
                  key={idx}
                  className={`border rounded-lg p-3 transition-colors ${
                    isError
                      ? 'bg-rose-950/20 border-rose-900/50 text-rose-200'
                      : 'bg-slate-950/60 border-slate-800/80'
                  }`}
                >
                  <div
                    onClick={() => toggleStep(idx)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      {isError ? (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold border border-emerald-500/30">
                          {idx + 1}
                        </div>
                      )}
                      <span className="text-xs font-semibold text-slate-200">
                        {step.step === 'plan' ? 'Execution Plan' : step.tool || step.step}
                      </span>
                      {step.confidence && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          conf: {step.confidence}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {step.details && (
                        <span className="text-xs text-slate-400 hidden sm:inline truncate max-w-xs">
                          {step.details}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800/60 text-xs font-mono">
                      {step.params && (
                        <div className="mb-2">
                          <span className="text-[10px] uppercase text-slate-500 font-semibold block mb-1">
                            Parameters:
                          </span>
                          <pre className="p-2 rounded bg-slate-900 text-slate-300 overflow-x-auto text-[11px]">
                            {JSON.stringify(step.params, null, 2)}
                          </pre>
                        </div>
                      )}

                      {step.result && (
                        <div>
                          <span className="text-[10px] uppercase text-slate-500 font-semibold block mb-1">
                            Result:
                          </span>
                          <pre className="p-2 rounded bg-slate-900 text-emerald-300 overflow-x-auto text-[11px]">
                            {JSON.stringify(step.result, null, 2)}
                          </pre>
                        </div>
                      )}

                      {step.error && (
                        <div className="text-rose-400 text-xs mt-1">
                          Error: {step.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300/90 overflow-x-auto max-h-96 leading-relaxed">
            {JSON.stringify(trace, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};
