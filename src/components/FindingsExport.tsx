import React, { useState, useMemo } from 'react';
import {
  Download,
  FileJson,
  MapPin,
  Archive,
  CheckCircle2,
  Copy,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Info,
  Globe,
  Compass,
  ExternalLink,
  Volume2,
} from 'lucide-react';
import { AgentResult, RasterScene } from '../types';
import { calculateCoverageTrend, BiTemporalTrendSummary } from '../satquery/trend';

interface FindingsExportProps {
  result: AgentResult | null;
  scene1?: RasterScene | null;
  scene2?: RasterScene | null;
}

export const FindingsExport: React.FC<FindingsExportProps> = ({
  result,
  scene1,
  scene2,
}) => {
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [copiedTrend, setCopiedTrend] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  // Compute trend summary when multiple scenes are present
  const trendSummary: BiTemporalTrendSummary | null = useMemo(() => {
    if (!scene1 || !scene2) return null;
    return calculateCoverageTrend(scene1, scene2);
  }, [scene1, scene2]);

  if (!result) return null;

  const handleCopyAnswer = () => {
    navigator.clipboard.writeText(result.answer);
    setCopiedAnswer(true);
    setTimeout(() => setCopiedAnswer(false), 2000);
  };

  const handleCopyTrend = () => {
    if (!trendSummary) return;
    const lines = [
      `=== SatQuery Bi-Temporal Trend Analysis ===`,
      `Baseline (Scene 1): ${trendSummary.scene1Name}`,
      `Post-Event (Scene 2): ${trendSummary.scene2Name}`,
      `Headline: ${trendSummary.headline}`,
      ``,
      `--- Coverage Deltas ---`,
      ...trendSummary.items.map(
        (it) =>
          `* ${it.className}: ${it.scene1Pct}% (${it.scene1Hectares} ha) -> ${it.scene2Pct}% (${it.scene2Hectares} ha) | Delta: ${it.deltaPct > 0 ? '+' : ''}${it.deltaPct}% (${it.deltaHectares > 0 ? '+' : ''}${it.deltaHectares} ha) [${it.interpretation}]`
      ),
      ``,
      `--- Spectral Shift Deltas ---`,
      `* Mean ΔNDVI: ${trendSummary.spectralDeltas.meanDeltaNdvi > 0 ? '+' : ''}${trendSummary.spectralDeltas.meanDeltaNdvi}`,
      `* Mean ΔNDWI: ${trendSummary.spectralDeltas.meanDeltaNdwi > 0 ? '+' : ''}${trendSummary.spectralDeltas.meanDeltaNdwi}`,
      `* Mean ΔNDBI: ${trendSummary.spectralDeltas.meanDeltaNdbi > 0 ? '+' : ''}${trendSummary.spectralDeltas.meanDeltaNdbi}`,
      ``,
      `Narrative: ${trendSummary.analysisText}`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedTrend(true);
    setTimeout(() => setCopiedTrend(false), 2000);
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTrendCsv = () => {
    if (!trendSummary) return;
    const headers = [
      'Class',
      'Scene_1_Coverage_Pct',
      'Scene_1_Hectares',
      'Scene_2_Coverage_Pct',
      'Scene_2_Hectares',
      'Delta_Coverage_Pct',
      'Relative_Change_Pct',
      'Delta_Hectares',
      'Direction',
      'Interpretation',
    ];
    const rows = trendSummary.items.map((it) => [
      `"${it.className}"`,
      it.scene1Pct,
      it.scene1Hectares,
      it.scene2Pct,
      it.scene2Hectares,
      it.deltaPct,
      it.relativePct,
      it.deltaHectares,
      `"${it.direction}"`,
      `"${it.interpretation}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadFile(csvContent, `trend_summary_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
  };

  const handleDownloadZip = async () => {
    if (!result.exportBundle) return;
    setIsZipping(true);
    try {
      const blob = await result.exportBundle.downloadZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `satquery_export_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Findings / Agent Answer */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <h3 className="text-sm font-semibold text-white">Agent Answer & Findings</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('audio-explanation-card');
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth' });
                  el.classList.add('ring-2', 'ring-violet-500');
                  setTimeout(() => el.classList.remove('ring-2', 'ring-violet-500'), 1500);
                  const playBtn = document.getElementById('audio-explanation-play-btn');
                  if (playBtn) playBtn.focus();
                }
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/30 transition cursor-pointer"
              title="Listen to Audio Explanation in multiple languages and styles"
            >
              <Volume2 className="w-3.5 h-3.5 text-violet-400" />
              <span>Listen to Audio</span>
            </button>
            <button
              type="button"
              onClick={handleCopyAnswer}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              {copiedAnswer ? (
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

        <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800/80 text-sm text-slate-200 leading-relaxed whitespace-pre-line font-sans selection:bg-emerald-500/20">
          {result.answer}
        </div>
      </div>

      {/* Grounded Geospatial & Real-World Evidence (gemini-3.5-flash with Google Search / Google Maps) */}
      {result.grounding && (
        <div
          id="grounding-evidence-card"
          className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div
                className={`p-1.5 rounded-lg border ${
                  result.grounding.type === 'maps'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                }`}
              >
                {result.grounding.type === 'maps' ? (
                  <Compass className="w-4 h-4" />
                ) : (
                  <Globe className="w-4 h-4" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>
                    {result.grounding.type === 'maps'
                      ? 'Google Maps Grounded Geospatial Context'
                      : 'Google Search Grounded Real-World Evidence'}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-teal-300 border border-teal-500/30">
                    {result.grounding.model || 'gemini-3.5-flash'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {result.grounding.type === 'maps'
                    ? 'Verified geographical place details, administrative territory, and coordinate context'
                    : 'Real-time verified factual details, disaster reports, and Earth observation events'}
                </p>
              </div>
            </div>

            {result.grounding.rateLimited ? (
              <span className="text-[11px] px-2.5 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
                Gemini API Rate Limit Reached
              </span>
            ) : (
              <span className="text-[11px] px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Grounding Connected
              </span>
            )}
          </div>

          {/* Grounded narrative */}
          <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-xs text-slate-200 leading-relaxed whitespace-pre-line font-sans">
            {result.grounding.text}
          </div>

          {/* Web Search Queries (if any) */}
          {result.grounding.webSearchQueries && result.grounding.webSearchQueries.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
              <span className="text-slate-500 font-medium">Search Queries:</span>
              {result.grounding.webSearchQueries.map((q, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 font-mono text-[10px]"
                >
                  "{q}"
                </span>
              ))}
            </div>
          )}

          {/* Sources and Citations (if any) */}
          {result.grounding.sources && result.grounding.sources.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80">
              <div className="text-[11px] font-medium text-slate-400 mb-1.5">
                Citations & Verified Sources:
              </div>
              <div className="flex flex-wrap gap-2">
                {result.grounding.sources.map((src, idx) => (
                  <a
                    key={idx}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 hover:text-teal-200 border border-slate-700 text-[11px] transition"
                  >
                    <span className="truncate max-w-[240px]">{src.title || src.uri}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trend Summary Feature (Calculates & Displays Delta in Coverage Percentages between Scene 1 and Scene 2) */}
      {trendSummary && (
        <div
          id="trend-summary-section"
          className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-white">
                  Bi-Temporal Coverage Trend & Delta Analysis
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  Scene 1 vs Scene 2
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                <span className="text-slate-300 font-medium">{trendSummary.scene1Name}</span>
                <ArrowRight className="w-3 h-3 text-slate-500" />
                <span className="text-slate-300 font-medium">{trendSummary.scene2Name}</span>
              </div>
            </div>

            {/* Actions: Copy & CSV Export */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyTrend}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                title="Copy trend summary text to clipboard"
              >
                {copiedTrend ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Trend</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadTrendCsv}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 transition cursor-pointer"
                title="Export trend statistics to CSV format"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Trend CSV</span>
              </button>
            </div>
          </div>

          {/* Trend Headline Callout */}
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 flex items-start gap-3 text-xs">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-slate-200">
                Summary Headline: {trendSummary.headline}
              </div>
              <p className="text-slate-400 leading-relaxed font-sans">
                {trendSummary.analysisText}
              </p>
            </div>
          </div>

          {/* Coverage Delta Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {trendSummary.items.map((item) => {
              const isPos = item.deltaPct > 0;
              const isNeg = item.deltaPct < 0;
              const isStable = Math.abs(item.deltaPct) <= 0.5;

              return (
                <div
                  key={item.className}
                  className="rounded-xl bg-slate-950/60 border border-slate-800/90 p-3.5 flex flex-col justify-between space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full border border-white/20"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-semibold text-xs text-slate-200">
                        {item.className}
                      </span>
                    </div>

                    {/* Delta Badge */}
                    <div
                      className={`flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded-md border ${
                        isStable
                          ? 'bg-slate-800 text-slate-400 border-slate-700'
                          : isPos
                          ? item.className === 'Water'
                            ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      {isPos ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : isNeg ? (
                        <TrendingDown className="w-3.5 h-3.5" />
                      ) : (
                        <Minus className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isPos ? '+' : ''}
                        {item.deltaPct}%
                      </span>
                    </div>
                  </div>

                  {/* Scene 1 vs Scene 2 Bar Graph comparison */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400">
                      <span>Scene 1: {item.scene1Pct}%</span>
                      <span>Scene 2: {item.scene2Pct}%</span>
                    </div>

                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-slate-600 transition-all duration-300"
                        style={{ width: `${Math.min(100, item.scene1Pct)}%` }}
                        title={`Scene 1: ${item.scene1Pct}%`}
                      />
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.abs(item.deltaPct))}%`,
                          backgroundColor: isPos ? '#10b981' : '#f43f5e',
                        }}
                        title={`Delta: ${item.deltaPct}%`}
                      />
                    </div>

                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>{item.scene1Hectares} ha</span>
                      <span className="text-slate-400">
                        Net: {item.deltaHectares > 0 ? '+' : ''}
                        {item.deltaHectares} ha
                      </span>
                      <span>{item.scene2Hectares} ha</span>
                    </div>
                  </div>

                  {/* Physical Interpretation */}
                  <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 leading-snug">
                    {item.interpretation}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Multi-Spectral Index Mean Shift Indicators */}
          <div className="grid grid-cols-3 gap-2.5 pt-1">
            <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80 text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">
                Mean ΔNDVI (Vegetation)
              </span>
              <div
                className={`text-sm font-mono font-bold mt-0.5 ${
                  trendSummary.spectralDeltas.meanDeltaNdvi > 0
                    ? 'text-emerald-400'
                    : trendSummary.spectralDeltas.meanDeltaNdvi < 0
                    ? 'text-rose-400'
                    : 'text-slate-300'
                }`}
              >
                {trendSummary.spectralDeltas.meanDeltaNdvi > 0 ? '+' : ''}
                {trendSummary.spectralDeltas.meanDeltaNdvi}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80 text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">
                Mean ΔNDWI (Water/Moisture)
              </span>
              <div
                className={`text-sm font-mono font-bold mt-0.5 ${
                  trendSummary.spectralDeltas.meanDeltaNdwi > 0
                    ? 'text-cyan-400'
                    : trendSummary.spectralDeltas.meanDeltaNdwi < 0
                    ? 'text-amber-400'
                    : 'text-slate-300'
                }`}
              >
                {trendSummary.spectralDeltas.meanDeltaNdwi > 0 ? '+' : ''}
                {trendSummary.spectralDeltas.meanDeltaNdwi}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80 text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">
                Mean ΔNDBI (Built-Up/Bare)
              </span>
              <div
                className={`text-sm font-mono font-bold mt-0.5 ${
                  trendSummary.spectralDeltas.meanDeltaNdbi > 0
                    ? 'text-amber-400'
                    : trendSummary.spectralDeltas.meanDeltaNdbi < 0
                    ? 'text-cyan-400'
                    : 'text-slate-300'
                }`}
              >
                {trendSummary.spectralDeltas.meanDeltaNdbi > 0 ? '+' : ''}
                {trendSummary.spectralDeltas.meanDeltaNdbi}
              </div>
            </div>
          </div>

          {/* Transitional Event Footprint (if detected) */}
          {trendSummary.transitionClasses.length > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Detected Transitional Event Footprint (Dynamic Change Masks)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {trendSummary.transitionClasses.map((t) => (
                  <div
                    key={t.className}
                    className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800 text-xs"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: t.color }}
                        />
                        <span>{t.className}</span>
                      </div>
                      <span className="font-mono text-cyan-300">{t.percentage}%</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">{t.hectares} ha affected</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">{t.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Coverage & Region Statistics Table */}
      {result.coverage.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">
                Active Analysis Coverage & Spatial Metrics
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Pixel-level classification on target raster (10m GSD Area Estimates)
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">1 px = 100 m²</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-mono">
                  <th className="py-2.5 px-3">Class</th>
                  <th className="py-2.5 px-3">Coverage %</th>
                  <th className="py-2.5 px-3">Area (Hectares)</th>
                  <th className="py-2.5 px-3">Square Meters</th>
                  <th className="py-2.5 px-3">Pixel Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {result.coverage.map((row) => (
                  <tr key={row.class} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-3 flex items-center gap-2 font-sans font-medium text-slate-200">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: row.color }}
                      ></span>
                      <span className="capitalize">{row.class}</span>
                    </td>
                    <td className="py-2 px-3 text-emerald-300 font-semibold">{row.percentage}%</td>
                    <td className="py-2 px-3 text-slate-200">{row.hectares} ha</td>
                    <td className="py-2 px-3 text-slate-400">
                      {row.squareMeters.toLocaleString()} m²
                    </td>
                    <td className="py-2 px-3 text-slate-500">{row.pixels.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Geospatial Export Section */}
      {result.exportBundle && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Geospatial Vector & Raster Export</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Standard GIS formats for QGIS, ArcGIS, Google Earth, and web maps.
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 text-emerald-400 border border-slate-700">
              {result.exportBundle.featureCount} Features
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            {/* Download GeoJSON */}
            <button
              type="button"
              onClick={() =>
                downloadFile(
                  result.exportBundle!.geojsonText,
                  'regions.geojson',
                  'application/geo+json'
                )
              }
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer active:scale-95 shadow-sm"
            >
              <FileJson className="w-4 h-4 text-emerald-400" />
              <span>Download GeoJSON</span>
            </button>

            {/* Download KML */}
            <button
              type="button"
              onClick={() =>
                downloadFile(
                  result.exportBundle!.kmlText,
                  'regions.kml',
                  'application/vnd.google-earth.kml+xml'
                )
              }
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer active:scale-95 shadow-sm"
            >
              <MapPin className="w-4 h-4 text-cyan-400" />
              <span>Download KML</span>
            </button>

            {/* Download ZIP Package */}
            <button
              type="button"
              onClick={handleDownloadZip}
              disabled={isZipping}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600/90 hover:bg-emerald-500 text-slate-950 transition cursor-pointer active:scale-95 shadow-sm disabled:opacity-50"
            >
              <Archive className="w-4 h-4 fill-current" />
              <span>{isZipping ? 'Generating...' : 'Download Full Bundle (ZIP)'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
