import React, { useState, useRef, useEffect } from 'react';
import {
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
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  Copy,
  Check,
  Layers,
  Sparkles,
  Eye,
  FileSpreadsheet,
  Globe2,
  Trash2,
  Info,
  Activity,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BatchCoordinateItem, BatchSummaryExport, OperationalTemplate, RasterScene } from '../types';
import {
  parseCoordinatesCSV,
  generateSampleCSV,
  exportBatchToJSON,
  downloadJSONFile,
} from '../satquery/csvParser';
import { executeBatchItemPipeline } from '../satquery/batchRunner';

interface BatchProcessingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInspectItemInDashboard: (
    scene1: RasterScene,
    scene2: RasterScene,
    query: string,
    template: OperationalTemplate,
    locationName: string
  ) => void;
}

export const BatchProcessingModal: React.FC<BatchProcessingModalProps> = ({
  isOpen,
  onClose,
  onInspectItemInDashboard,
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
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);
  const timerRef = useRef<any>(null);

  // Sync ref with state
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Timer effect
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

  // Handle CSV parsing when csvText changes
  const handleLoadCsvContent = (text: string) => {
    setCsvText(text);
    const { items, errors } = parseCoordinatesCSV(text);
    setBatchItems(items);
    setParseErrors(errors);
  };

  // Load built-in sample
  const handleLoadSample = () => {
    const sample = generateSampleCSV();
    handleLoadCsvContent(sample);
  };

  // Download template CSV
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

  // File drop handler
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      readFile(file);
    }
  };

  // File input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      readFile(file);
    }
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        handleLoadCsvContent(content);
      }
    };
    reader.readAsText(file);
  };

  // Start Batch Execution Pipeline
  const handleStartBatch = async () => {
    if (batchItems.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setIsPaused(false);
    isCancelledRef.current = false;

    // Reset status of any failed or pending
    setBatchItems((prev) =>
      prev.map((item) =>
        item.status === 'completed' ? item : { ...item, status: 'pending', error: undefined }
      )
    );

    for (let i = 0; i < batchItems.length; i++) {
      if (isCancelledRef.current) break;

      // Wait if paused
      while (isPausedRef.current) {
        await new Promise((r) => setTimeout(r, 200));
        if (isCancelledRef.current) break;
      }
      if (isCancelledRef.current) break;

      const item = batchItems[i];
      if (item.status === 'completed') continue;

      setCurrentItemIndex(i);

      // Mark processing
      setBatchItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, status: 'processing' } : it))
      );

      try {
        const { result, scene1, scene2 } = await executeBatchItemPipeline(item);

        if (isCancelledRef.current) break;

        setBatchItems((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: 'completed',
                  result,
                  scene1,
                  scene2,
                }
              : it
          )
        );
      } catch (err: any) {
        console.error(`Batch processing error on row ${i + 1}:`, err);
        setBatchItems((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: 'error',
                  error: err?.message || 'Remote sensing pipeline failure',
                }
              : it
          )
        );
      }

      // Small pause for smooth UI progress
      await new Promise((r) => setTimeout(r, 120));
    }

    setIsProcessing(false);
    setCurrentItemIndex(-1);
  };

  const handlePauseResume = () => {
    setIsPaused((prev) => !prev);
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    setIsProcessing(false);
    setIsPaused(false);
    setCurrentItemIndex(-1);
  };

  const handleClearAll = () => {
    if (isProcessing) handleCancel();
    setBatchItems([]);
    setCsvText('');
    setParseErrors([]);
    setElapsedSeconds(0);
    setExpandedItemId(null);
  };

  // Export JSON
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

  // Inspect in dashboard
  const handleInspect = (item: BatchCoordinateItem) => {
    if (item.scene1 && item.scene2) {
      const q = `Bi-temporal change detection for ${item.name} (${item.t1Date} to ${item.t2Date})`;
      onInspectItemInDashboard(item.scene1, item.scene2, q, item.template, item.name);
      onClose();
    }
  };

  if (!isOpen) return null;

  const completedCount = batchItems.filter((i) => i.status === 'completed').length;
  const errorCount = batchItems.filter((i) => i.status === 'error').length;
  const progressPercent =
    batchItems.length > 0 ? Math.round((completedCount / batchItems.length) * 100) : 0;

  const currentSummaryData = exportBatchToJSON(batchItems, elapsedSeconds);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-emerald-950/40 text-slate-100 overflow-hidden">
        {/* Header Bar */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/50 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Batch Coordinate Bi-Temporal Pipeline
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold">
                  CSV AUTOMATION
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Upload coordinate sets, auto-run co-registered change detection, and export JSON telemetry.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition cursor-pointer"
              title="Download sample CSV format"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>CSV Template</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Close batch processing modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Top Actions: Upload / Paste / Load Sample */}
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
                  <span>Load 6-Point Global Sample CSV</span>
                </button>

                {batchItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    disabled={isProcessing}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-900 transition cursor-pointer disabled:opacity-40"
                    title="Clear all batch items"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Input Surface */}
            {inputMode === 'upload' ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer ${
                  isDragging
                    ? 'border-emerald-400 bg-emerald-950/20'
                    : 'border-slate-700 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-950/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <UploadCloud className="w-8 h-8 mx-auto text-emerald-400 mb-2 stroke-1" />
                <h3 className="text-xs font-semibold text-slate-200">
                  Click to browse or drop your CSV file here
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  Expected columns: <code className="text-emerald-300">lat</code>, <code className="text-emerald-300">lon</code>, <code className="text-slate-300">name</code>, <code className="text-slate-300">t1_date</code>, <code className="text-slate-300">t2_date</code>, <code className="text-slate-300">layer</code>
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={csvText}
                  onChange={(e) => handleLoadCsvContent(e.target.value)}
                  placeholder="Paste CSV text here...&#10;name,lat,lon,t1_date,t2_date,layer,template&#10;Lake Mead,36.1425,-114.7377,2023-08-15,2024-04-20,osiris-ndwi,disaster"
                  rows={5}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>
            )}

            {/* Parse Warnings / Errors */}
            {parseErrors.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200 text-xs space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span>CSV Parsing Notices:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-300/90 pl-1">
                  {parseErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Batch Status & Queue Execution HUD */}
          {batchItems.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Batch Queue Status
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-900 text-slate-300 border border-slate-700">
                      {completedCount} / {batchItems.length} Completed
                    </span>
                    {errorCount > 0 && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-red-950/60 text-red-300 border border-red-800">
                        {errorCount} Errors
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>Elapsed: {elapsedSeconds}s</span>
                    {isProcessing && currentItemIndex >= 0 && (
                      <span className="text-emerald-400 animate-pulse font-medium">
                        · Running: {batchItems[currentItemIndex]?.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Control Action Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  {!isProcessing ? (
                    <button
                      type="button"
                      onClick={handleStartBatch}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-950/40 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-slate-950" />
                      <span>{completedCount > 0 ? 'Resume / Re-Run Batch' : 'Run Batch Pipeline'}</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handlePauseResume}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition cursor-pointer"
                      >
                        {isPaused ? <Play className="w-3.5 h-3.5 fill-slate-950" /> : <Pause className="w-3.5 h-3.5 fill-slate-950" />}
                        <span>{isPaused ? 'Resume' : 'Pause'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCancel}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Cancel</span>
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
                      <span>Export Summary (JSON)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Batch Completion</span>
                  <span className="text-emerald-400 font-semibold">{progressPercent}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Results & Items Table */}
          {batchItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  Target Coordinates & Change Detection Results ({batchItems.length})
                </h3>
                <span className="text-[11px] text-slate-500">
                  Click any row to view spectral deltas or inspect directly in dashboard
                </span>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[11px] uppercase font-semibold">
                      <tr>
                        <th className="py-2.5 px-3 w-12 text-center">Status</th>
                        <th className="py-2.5 px-3">Location & Coordinates</th>
                        <th className="py-2.5 px-3">Observation Periods</th>
                        <th className="py-2.5 px-3">Layer</th>
                        <th className="py-2.5 px-3">Dominant Change</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {batchItems.map((item, idx) => {
                        const isExpanded = expandedItemId === item.id;
                        const isCurrent = currentItemIndex === idx && isProcessing;

                        return (
                          <React.Fragment key={item.id}>
                            <tr
                              className={`transition-colors hover:bg-slate-900/60 ${
                                isCurrent ? 'bg-emerald-950/20' : ''
                              }`}
                            >
                              {/* Status Icon */}
                              <td className="py-3 px-3 text-center">
                                {item.status === 'completed' ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />
                                ) : item.status === 'processing' ? (
                                  <Activity className="w-4 h-4 text-emerald-400 animate-spin mx-auto" />
                                ) : item.status === 'error' ? (
                                  <span title={item.error} className="inline-block">
                                    <AlertCircle className="w-4 h-4 text-red-400 mx-auto" />
                                  </span>
                                ) : (
                                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-700 mx-auto" />
                                )}
                              </td>

                              {/* Location & Coords */}
                              <td className="py-3 px-3">
                                <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                                  <span>{item.name}</span>
                                </div>
                                <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1 mt-0.5">
                                  <Crosshair className="w-3 h-3 text-emerald-400" />
                                  <span>{item.lat.toFixed(4)}°, {item.lon.toFixed(4)}°</span>
                                </div>
                              </td>

                              {/* Dates */}
                              <td className="py-3 px-3 text-[11px] font-mono">
                                <div className="text-slate-300">T1: {item.t1Date}</div>
                                <div className="text-emerald-400">T2: {item.t2Date}</div>
                              </td>

                              {/* Layer */}
                              <td className="py-3 px-3">
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-900 border border-slate-700 text-slate-300">
                                  {item.layer}
                                </span>
                              </td>

                              {/* Dominant Change Result */}
                              <td className="py-3 px-3">
                                {item.result ? (
                                  <div>
                                    <span className="font-semibold text-emerald-300 block text-xs">
                                      {item.result.dominantChange}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      Confidence: {Math.round(item.result.confidence * 100)}% · {item.result.processingTimeMs}ms
                                    </span>
                                  </div>
                                ) : item.status === 'error' ? (
                                  <span className="text-red-400 text-[11px]">{item.error || 'Failed'}</span>
                                ) : item.status === 'processing' ? (
                                  <span className="text-emerald-400 text-[11px] animate-pulse">Running agent...</span>
                                ) : (
                                  <span className="text-slate-500 text-[11px]">Queued</span>
                                )}
                              </td>

                              {/* Actions */}
                              <td className="py-3 px-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {item.result && (
                                    <button
                                      type="button"
                                      onClick={() => handleInspect(item)}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold transition cursor-pointer"
                                      title="Load this scene pair into the main dashboard"
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span>Inspect</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                                    className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                                    title={isExpanded ? 'Collapse row details' : 'Expand row details'}
                                  >
                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Expanded Details Row */}
                            {isExpanded && item.result && (
                              <tr className="bg-slate-900/90 border-b border-slate-800/80">
                                <td colSpan={6} className="p-4 space-y-3">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                                    {/* Spectral Shifts */}
                                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                                      <span className="text-slate-400 uppercase font-semibold block text-[10px]">
                                        Spectral Delta Indices
                                      </span>
                                      <div className="grid grid-cols-3 gap-2 font-mono pt-1">
                                        <div>
                                          <span className="text-slate-500 block text-[9px]">ΔNDVI</span>
                                          <span className={item.result.spectralDeltas.meanDeltaNdvi >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                            {item.result.spectralDeltas.meanDeltaNdvi > 0 ? '+' : ''}
                                            {item.result.spectralDeltas.meanDeltaNdvi.toFixed(3)}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-slate-500 block text-[9px]">ΔNDWI</span>
                                          <span className={item.result.spectralDeltas.meanDeltaNdwi >= 0 ? 'text-cyan-400' : 'text-amber-400'}>
                                            {item.result.spectralDeltas.meanDeltaNdwi > 0 ? '+' : ''}
                                            {item.result.spectralDeltas.meanDeltaNdwi.toFixed(3)}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-slate-500 block text-[9px]">ΔNDBI</span>
                                          <span className={item.result.spectralDeltas.meanDeltaNdbi >= 0 ? 'text-indigo-400' : 'text-slate-400'}>
                                            {item.result.spectralDeltas.meanDeltaNdbi > 0 ? '+' : ''}
                                            {item.result.spectralDeltas.meanDeltaNdbi.toFixed(3)}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Geodetic Metadata */}
                                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                                      <span className="text-slate-400 uppercase font-semibold block text-[10px]">
                                        Geodetic Metadata
                                      </span>
                                      <div className="space-y-0.5 text-slate-300 font-mono text-[10px]">
                                        <div>CRS: <span className="text-cyan-400">{item.result.crs}</span> (UTM {item.result.utmZone})</div>
                                        <div>MGRS: <span className="text-slate-300">{item.result.mgrs}</span></div>
                                        <div>Area: <span className="text-emerald-400">{item.result.totalHectares} ha</span></div>
                                      </div>
                                    </div>

                                    {/* Google Maps link & Quick Actions */}
                                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex flex-col justify-between">
                                      <span className="text-slate-400 uppercase font-semibold block text-[10px]">
                                        External Verification
                                      </span>
                                      <a
                                        href={item.result.googleMapsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 mt-2"
                                      >
                                        <Globe2 className="w-3.5 h-3.5" />
                                        <span>Inspect in Google Maps</span>
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </div>
                                  </div>

                                  {/* Land Cover Shift breakdown */}
                                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                                    <span className="text-slate-400 uppercase font-semibold block text-[10px]">
                                      Land Cover Coverage Shift (T1 → T2)
                                    </span>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                      {item.result.coverageChanges.map((cov) => (
                                        <div
                                          key={cov.className}
                                          className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px]"
                                        >
                                          <div className="flex items-center justify-between font-semibold">
                                            <span className="capitalize text-slate-200">{cov.className}</span>
                                            <span
                                              className={
                                                cov.deltaPct > 0
                                                  ? 'text-emerald-400'
                                                  : cov.deltaPct < 0
                                                  ? 'text-red-400'
                                                  : 'text-slate-400'
                                              }
                                            >
                                              {cov.deltaPct > 0 ? '+' : ''}
                                              {cov.deltaPct.toFixed(1)}% ({cov.deltaHectares > 0 ? '+' : ''}
                                              {cov.deltaHectares.toFixed(1)} ha)
                                            </span>
                                          </div>
                                          <p className="text-[10px] text-slate-400 mt-1">{cov.interpretation}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Agent Answer */}
                                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                                    <span className="text-slate-400 uppercase font-semibold block text-[10px] mb-1">
                                      Autonomous Agent Analysis
                                    </span>
                                    <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-line font-sans">
                                      {item.result.agentSummary}
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Aggregate Telemetry & JSON Export Preview */}
          {completedCount > 0 && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    Final Batch Summary Telemetry
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Aggregated geospatial statistics across {completedCount} target locations.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowJsonPreview(!showJsonPreview)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                  >
                    <span>{showJsonPreview ? 'Hide JSON' : 'Preview JSON'}</span>
                    {showJsonPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                  >
                    {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download JSON File</span>
                  </button>
                </div>
              </div>

              {/* Stat HUD Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Total Area Analyzed</span>
                  <span className="text-base font-bold text-emerald-400 font-mono">
                    {currentSummaryData.metadata.aggregateAnalysis.totalHectaresAnalyzed} ha
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Net Vegetation Shift</span>
                  <span
                    className={`text-base font-bold font-mono ${
                      currentSummaryData.metadata.aggregateAnalysis.netVegetationShiftHectares >= 0
                        ? 'text-emerald-400'
                        : 'text-red-400'
                    }`}
                  >
                    {currentSummaryData.metadata.aggregateAnalysis.netVegetationShiftHectares > 0 ? '+' : ''}
                    {currentSummaryData.metadata.aggregateAnalysis.netVegetationShiftHectares} ha
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Net Water Surface Shift</span>
                  <span
                    className={`text-base font-bold font-mono ${
                      currentSummaryData.metadata.aggregateAnalysis.netWaterShiftHectares >= 0
                        ? 'text-cyan-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {currentSummaryData.metadata.aggregateAnalysis.netWaterShiftHectares > 0 ? '+' : ''}
                    {currentSummaryData.metadata.aggregateAnalysis.netWaterShiftHectares} ha
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Avg. Observation Interval</span>
                  <span className="text-base font-bold text-indigo-300 font-mono">
                    {currentSummaryData.metadata.aggregateAnalysis.averageDaysDelta} Days
                  </span>
                </div>
              </div>

              {/* Collapsible JSON Preview */}
              {showJsonPreview && (
                <div className="relative mt-3">
                  <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-300 max-h-72 overflow-y-auto overflow-x-auto leading-relaxed">
                    {JSON.stringify(currentSummaryData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-emerald-400" />
            <span>Co-registered 10m Sentinel-2 Optical & Sentinel-1 SAR Bi-Temporal Pipeline</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
