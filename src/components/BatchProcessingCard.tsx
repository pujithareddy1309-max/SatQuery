import React, { useState, useRef, useEffect } from 'react';
import {
  FileSpreadsheet,
  UploadCloud,
  FileText,
  Play,
  Pause,
  RotateCcw,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  Crosshair,
  ChevronDown,
  ChevronUp,
  Eye,
  Sparkles,
  Maximize2,
  Trash2,
  Activity,
  Copy,
  Check,
} from 'lucide-react';
import { BatchCoordinateItem, OperationalTemplate, RasterScene } from '../types';
import { CollapsibleCard } from './CollapsibleCard';
import {
  parseCoordinatesCSV,
  generateSampleCSV,
  exportBatchToJSON,
  downloadJSONFile,
} from '../satquery/csvParser';
import { executeBatchItemPipeline } from '../satquery/batchRunner';

interface BatchProcessingCardProps {
  onInspectItemInDashboard: (
    scene1: RasterScene,
    scene2: RasterScene,
    query: string,
    template: OperationalTemplate,
    locationName: string
  ) => void;
  onOpenModal?: () => void;
}

export const BatchProcessingCard: React.FC<BatchProcessingCardProps> = ({
  onInspectItemInDashboard,
  onOpenModal,
}) => {
  const [inputMode, setInputMode] = useState<'upload' | 'paste'>('upload');
  const [csvText, setCsvText] = useState<string>('');
  const [batchItems, setBatchItems] = useState<BatchCoordinateItem[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentItemIndex, setCurrentItemIndex] = useState<number>(-1);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    if (isProcessing && !isPaused) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isProcessing, isPaused]);

  const handleLoadCsvContent = (text: string) => {
    setCsvText(text);
    const { items, errors } = parseCoordinatesCSV(text);
    setBatchItems(items);
    setParseErrors(errors);
  };

  const handleLoadSample = () => {
    const sample = generateSampleCSV();
    handleLoadCsvContent(sample);
  };

  const handleDownloadTemplate = () => {
    const sample = generateSampleCSV();
    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'satquery_batch_coordinates_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) handleLoadCsvContent(content);
    };
    reader.readAsText(file);
  };

  const handleStartBatch = async () => {
    if (batchItems.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setIsPaused(false);
    isCancelledRef.current = false;

    for (let i = 0; i < batchItems.length; i++) {
      if (isCancelledRef.current) break;
      while (isPausedRef.current) {
        await new Promise((r) => setTimeout(r, 200));
        if (isCancelledRef.current) break;
      }
      if (isCancelledRef.current) break;

      const item = batchItems[i];
      if (item.status === 'completed') continue;

      setCurrentItemIndex(i);
      setBatchItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, status: 'processing' } : it))
      );

      try {
        const { result, scene1, scene2 } = await executeBatchItemPipeline(item);
        if (isCancelledRef.current) break;

        setBatchItems((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, status: 'completed', result, scene1, scene2 } : it
          )
        );
      } catch (err: any) {
        setBatchItems((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, status: 'error', error: err?.message || 'Pipeline error' } : it
          )
        );
      }

      await new Promise((r) => setTimeout(r, 100));
    }

    setIsProcessing(false);
    setCurrentItemIndex(-1);
  };

  const handleExportJson = () => {
    const exportData = exportBatchToJSON(batchItems, elapsedSeconds);
    const filename = `satquery_batch_summary_${new Date().toISOString().slice(0, 10)}.json`;
    downloadJSONFile(exportData, filename);
  };

  const handleCopyJson = () => {
    const exportData = exportBatchToJSON(batchItems, elapsedSeconds);
    navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const completedCount = batchItems.filter((i) => i.status === 'completed').length;
  const progressPercent =
    batchItems.length > 0 ? Math.round((completedCount / batchItems.length) * 100) : 0;
  const currentSummaryData = exportBatchToJSON(batchItems, elapsedSeconds);

  return (
    <CollapsibleCard
      id="batch-processing-card"
      title="Batch Coordinate Bi-Temporal Pipeline"
      subtitle="Upload CSV of multiple coordinate sets, run automated change detection, and export summary JSON"
      icon={FileSpreadsheet}
      defaultCollapsed={false}
      headerRightExtra={
        <div className="flex items-center gap-2">
          {batchItems.length > 0 && (
            <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {completedCount}/{batchItems.length} Processed
            </span>
          )}
          {onOpenModal && (
            <button
              type="button"
              onClick={onOpenModal}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Expand to Fullscreen Modal"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>
      }
      collapsedSummary={
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>Batch Queue: <strong className="text-emerald-400">{batchItems.length}</strong> coordinate sets</span>
          <span>·</span>
          <span>Completed: <strong className="text-emerald-300">{completedCount}</strong></span>
        </div>
      }
      bodyClassName="p-4 sm:p-5 space-y-4"
    >
      {/* CSV Source Controls */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setInputMode('upload')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                inputMode === 'upload'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5 inline mr-1.5" />
              Upload CSV File
            </button>
            <button
              type="button"
              onClick={() => setInputMode('paste')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                inputMode === 'paste'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <FileText className="w-3.5 h-3.5 inline mr-1.5" />
              Paste CSV Text
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLoadSample}
              className="px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Load 6-Point Sample CSV</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition cursor-pointer flex items-center gap-1"
              title="Download empty CSV template"
            >
              <Download className="w-3 h-3 text-slate-400" />
              <span className="hidden sm:inline">Template</span>
            </button>

            {batchItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setBatchItems([]);
                  setCsvText('');
                  setParseErrors([]);
                  setElapsedSeconds(0);
                }}
                disabled={isProcessing}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/40 transition cursor-pointer disabled:opacity-40"
                title="Clear queue"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Input box */}
        {inputMode === 'upload' ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center transition cursor-pointer ${
              isDragging
                ? 'border-emerald-400 bg-emerald-950/20'
                : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={handleFileInputChange}
              className="hidden"
            />
            <UploadCloud className="w-7 h-7 mx-auto text-emerald-400 mb-1.5 stroke-1" />
            <h4 className="text-xs font-semibold text-slate-200">
              Drop coordinate CSV here, or click to browse
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Supports: <code className="text-emerald-300">lat, lon, name, t1_date, t2_date, layer</code>
            </p>
          </div>
        ) : (
          <textarea
            value={csvText}
            onChange={(e) => handleLoadCsvContent(e.target.value)}
            placeholder="name,lat,lon,t1_date,t2_date,layer,template&#10;Lake Mead,36.1425,-114.7377,2023-08-15,2024-04-20,osiris-ndwi,disaster"
            rows={4}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
          />
        )}

        {parseErrors.length > 0 && (
          <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/40 text-amber-200 text-xs">
            {parseErrors.join(' | ')}
          </div>
        )}
      </div>

      {/* Execution Controls & Progress Bar */}
      {batchItems.length > 0 && (
        <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Progress: {completedCount} / {batchItems.length}
              </span>
              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                <Clock className="w-3 h-3 text-slate-500" />
                {elapsedSeconds}s
              </span>
              {isProcessing && currentItemIndex >= 0 && (
                <span className="text-emerald-400 text-xs animate-pulse font-medium">
                  · Processing: {batchItems[currentItemIndex]?.name}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {!isProcessing ? (
                <button
                  type="button"
                  onClick={handleStartBatch}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-md shadow-emerald-950/30 transition cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-slate-950" />
                  <span>{completedCount > 0 ? 'Re-Run Batch' : 'Run Batch Pipeline'}</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsPaused(!isPaused)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition cursor-pointer"
                  >
                    {isPaused ? <Play className="w-3 h-3 fill-slate-950" /> : <Pause className="w-3 h-3 fill-slate-950" />}
                    <span>{isPaused ? 'Resume' : 'Pause'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      isCancelledRef.current = true;
                      setIsProcessing(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </>
              )}

              {completedCount > 0 && (
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-950/40 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Mini Table of Items */}
      {batchItems.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-semibold sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3 w-10 text-center">Status</th>
                  <th className="py-2 px-3">Target Location</th>
                  <th className="py-2 px-3">Observation Periods</th>
                  <th className="py-2 px-3">Dominant Change</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {batchItems.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={`transition-colors hover:bg-slate-900/60 ${
                      currentItemIndex === idx && isProcessing ? 'bg-emerald-950/20' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center">
                      {item.status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />
                      ) : item.status === 'processing' ? (
                        <Activity className="w-4 h-4 text-emerald-400 animate-spin mx-auto" />
                      ) : item.status === 'error' ? (
                        <AlertCircle className="w-4 h-4 text-red-400 mx-auto" />
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-slate-700 mx-auto" />
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-200">{item.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {item.lat.toFixed(4)}°, {item.lon.toFixed(4)}° · {item.layer}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-[10px] font-mono text-slate-400">
                      <div>T1: {item.t1Date}</div>
                      <div className="text-emerald-400">T2: {item.t2Date}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      {item.result ? (
                        <div>
                          <span className="font-semibold text-emerald-300 block text-xs">
                            {item.result.dominantChange}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {Math.round(item.result.confidence * 100)}% conf
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px] capitalize">{item.status}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {item.result && (
                        <button
                          type="button"
                          onClick={() => {
                            if (item.scene1 && item.scene2) {
                              const q = `Bi-temporal change detection for ${item.name} (${item.t1Date} to ${item.t2Date})`;
                              onInspectItemInDashboard(item.scene1, item.scene2, q, item.template, item.name);
                            }
                          }}
                          className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-semibold transition cursor-pointer"
                        >
                          Inspect
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Aggregate Stats Summary */}
      {completedCount > 0 && (
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-3 text-slate-300 font-mono text-[11px]">
            <span>Total Analyzed: <strong className="text-emerald-400">{currentSummaryData.metadata.aggregateAnalysis.totalHectaresAnalyzed} ha</strong></span>
            <span>·</span>
            <span>Net Veg: <strong className="text-emerald-300">{currentSummaryData.metadata.aggregateAnalysis.netVegetationShiftHectares} ha</strong></span>
            <span>·</span>
            <span>Net Water: <strong className="text-cyan-300">{currentSummaryData.metadata.aggregateAnalysis.netWaterShiftHectares} ha</strong></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyJson}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer flex items-center gap-1"
            >
              {copiedJson ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              className="px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              <span>Download JSON</span>
            </button>
          </div>
        </div>
      )}
    </CollapsibleCard>
  );
};
