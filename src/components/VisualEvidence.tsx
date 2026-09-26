import React, { useState, useEffect } from 'react';
import { Eye, Layers, Sliders, Activity, Maximize2, Minimize2, Crosshair, Split, X, ChevronDown, ChevronUp } from 'lucide-react';
import { AgentResult, OperationalTemplate, RasterScene } from '../types';
import { renderAnnotatedImage, COLOR_MAP } from '../satquery/segmentation';
import { SemanticLegend } from './SemanticLegend';
import { motion, AnimatePresence } from 'framer-motion';

interface VisualEvidenceProps {
  result: AgentResult | null;
  scene1: RasterScene;
  scene2: RasterScene | null;
  opacity: number;
  template?: OperationalTemplate;
}

export const VisualEvidence: React.FC<VisualEvidenceProps> = ({
  result,
  scene1,
  scene2,
  opacity,
  template = 'auto',
}) => {
  const [activeTab, setActiveTab] = useState<'evidence' | 'blend' | 'indices'>('evidence');
  const [showMasks, setShowMasks] = useState(true);
  const [showBoxes, setShowBoxes] = useState(true);
  const [activeClasses, setActiveClasses] = useState<Set<string>>(new Set());
  const [blendValue, setBlendValue] = useState(opacity);
  const [dynamicVisualUrl, setDynamicVisualUrl] = useState<string>('');

  // Interactive Refinements: Pixel Inspection, Swipe Curtain & Fullscreen
  const [hoverPixel, setHoverPixel] = useState<{
    x: number;
    y: number;
    cls: string;
    color: string;
    isDetected: boolean;
  } | null>(null);
  const [blendMode, setBlendMode] = useState<'opacity' | 'swipe'>('swipe');
  const [swipePosition, setSwipePosition] = useState<number>(50);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  useEffect(() => {
    setBlendValue(opacity);
  }, [opacity]);

  // Initialize all active classes when new result arrives
  useEffect(() => {
    if (result && result.masks) {
      setActiveClasses(new Set(Object.keys(result.masks)));
    }
  }, [result]);

  // Re-render visual when layer toggles change
  useEffect(() => {
    if (!result) return;
    const targetScene = scene2 || scene1;
    const url = renderAnnotatedImage(targetScene, result.masks, result.boxes, {
      showMasks,
      showBoxes,
      opacity,
      activeClasses: activeClasses.size > 0 ? activeClasses : undefined,
    });
    setDynamicVisualUrl(url);
  }, [result, showMasks, showBoxes, activeClasses, opacity, scene1, scene2]);

  const toggleClass = (name: string) => {
    const next = new Set(activeClasses);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setActiveClasses(next);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const px = Math.floor((clientX / rect.width) * 256);
    const py = Math.floor((clientY / rect.height) * 256);

    if (px >= 0 && px < 256 && py >= 0 && py < 256 && result) {
      const idx = py * 256 + px;
      let detectedClass = 'Background / Unclassified';
      let detectedColor = '#64748b';
      let isDetected = false;

      if (result.masks) {
        for (const [clsName, maskData] of Object.entries(result.masks)) {
          if (maskData[idx] > 0) {
            detectedClass = clsName;
            const rgb = COLOR_MAP[clsName];
            detectedColor = rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : '#10b981';
            isDetected = true;
            break;
          }
        }
      }

      setHoverPixel({
        x: px,
        y: py,
        cls: detectedClass,
        color: detectedColor,
        isDetected,
      });
    }
  };

  const handleMouseLeave = () => {
    setHoverPixel(null);
  };

  if (!result) {
    return (
      <div id="visual-evidence-container" className="bg-slate-900/80 border border-slate-800 rounded-xl p-8 text-center text-slate-500 shadow-sm">
        <Activity className="w-10 h-10 mx-auto text-slate-600 mb-3" />
        <h3 className="text-sm font-semibold text-slate-400">No Visual Evidence Generated Yet</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Configure inputs and click "Run SatQuery Agent" to execute the autonomous tool-calling pipeline.
        </p>
      </div>
    );
  }

  const availableClasses = Object.keys(result.masks);

  return (
    <div id="visual-evidence-container" className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      {/* Header Tabs */}
      <div className="border-b border-slate-800 bg-slate-950/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('evidence')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'evidence'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Visual Evidence (Masks & Boxes)</span>
          </button>

          {scene2 && (
            <button
              onClick={() => setActiveTab('blend')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'blend'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Temporal Blend</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('indices')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'indices'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Spectral Indices (NDVI/NDWI/NDBI)</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Global toggles for evidence tab */}
          {activeTab === 'evidence' && !isCollapsed && (
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showMasks}
                  onChange={(e) => setShowMasks(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 bg-slate-800"
                />
                <span>Masks</span>
              </label>
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBoxes}
                  onChange={(e) => setShowBoxes(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 bg-slate-800"
                />
                <span>Boxes</span>
              </label>
            </div>
          )}

          {/* Chevron Collapse Toggle (keyboard_arrow_up / keyboard_arrow_down) */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-expanded={!isCollapsed}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
              isCollapsed
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-emerald-400'
                : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/80 text-slate-400 hover:text-white'
            }`}
            title={
              isCollapsed
                ? 'Expand visual evidence (keyboard_arrow_down)'
                : 'Collapse visual evidence (keyboard_arrow_up)'
            }
          >
            {isCollapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
              transition: {
                height: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.2, ease: 'easeOut' },
              },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: {
                height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.15, ease: 'easeIn' },
              },
            }}
            className="overflow-hidden"
          >
            {/* Main Tab Content */}
            <div className="p-4">
        {activeTab === 'evidence' && (
          <div>
            {/* Visual Canvas Container with Real-Time Pixel Inspector */}
            <div
              className="relative aspect-video max-h-[460px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800/80 flex items-center justify-center cursor-crosshair group"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <img
                src={dynamicVisualUrl || result.annotatedImageUrl}
                alt="Visual Evidence"
                className="w-full h-full object-contain pointer-events-none"
              />

              {/* Real-Time Hover Pixel Inspector HUD */}
              {hoverPixel && (
                <div className="absolute top-3 left-3 pointer-events-none z-10 flex items-center gap-2 bg-slate-950/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/80 text-[11px] font-mono text-slate-200 shadow-xl">
                  <Crosshair className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    X: <strong className="text-white">{hoverPixel.x}</strong> Y:{' '}
                    <strong className="text-white">{hoverPixel.y}</strong>
                  </span>
                  <span className="text-slate-600">|</span>
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block shrink-0 shadow-sm"
                    style={{ backgroundColor: hoverPixel.color }}
                  />
                  <span className="text-white font-semibold truncate max-w-[140px]">
                    {hoverPixel.cls}
                  </span>
                </div>
              )}

              {/* Regions Badge & Fullscreen Expand */}
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <div className="px-2.5 py-1 rounded bg-slate-900/90 text-xs font-mono text-slate-300 border border-slate-700/80 shadow">
                  {result.boxes.length} regions detected
                </div>
                <button
                  type="button"
                  onClick={() => setIsFullscreen(true)}
                  className="p-1.5 rounded bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 shadow transition cursor-pointer"
                  title="Expand Fullscreen"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Collapsible Semantic Legend tailored to the Operational Template */}
            <SemanticLegend
              template={template}
              masks={result.masks}
              activeClasses={activeClasses}
              onToggleClass={toggleClass}
              coverage={result.coverage}
              defaultCollapsed={false}
            />
          </div>
        )}

        {activeTab === 'blend' && scene2 && (
          <div className="space-y-4">
            {/* Blend Mode Switcher */}
            <div className="flex items-center justify-between bg-slate-950/60 p-2 rounded-xl border border-slate-800/80 text-xs">
              <span className="text-slate-400 font-medium px-2">Comparison Mode:</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setBlendMode('swipe')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer font-medium ${
                    blendMode === 'swipe'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Split className="w-3.5 h-3.5" />
                  <span>Interactive Swipe Curtain</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBlendMode('opacity')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer font-medium ${
                    blendMode === 'opacity'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Opacity Fade</span>
                </button>
              </div>
            </div>

            {blendMode === 'swipe' ? (
              /* Interactive Split-Screen Swipe Curtain */
              <div
                className="relative aspect-video max-h-[460px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800/80 select-none cursor-ew-resize group"
                onMouseMove={(e) => {
                  if (e.buttons === 1) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                    setSwipePosition(pct);
                  }
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                  setSwipePosition(pct);
                }}
              >
                {/* T1 Optical (Left Base) */}
                <img
                  src={result.rgbT1DataUrl}
                  alt="T1 base"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />

                {/* T2 / SAR (Right Overlay clipped by swipePosition) */}
                <div
                  className="absolute inset-0 overflow-hidden pointer-events-none"
                  style={{ clipPath: `inset(0 0 0 ${swipePosition}%)` }}
                >
                  <img
                    src={result.rgbT2DataUrl}
                    alt="T2 overlay"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                </div>

                {/* Draggable Vertical Divider Bar */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-2xl pointer-events-none flex items-center justify-center"
                  style={{ left: `${swipePosition}%` }}
                >
                  <div className="w-7 h-7 rounded-full bg-slate-900 border-2 border-white shadow-lg flex items-center justify-center text-[10px] text-white font-bold">
                    ↔
                  </div>
                </div>

                <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-slate-900/90 text-xs font-mono text-slate-200 border border-slate-700/80 pointer-events-none">
                  T1 Base ({Math.round(swipePosition)}%)
                </div>
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded bg-slate-900/90 text-xs font-mono text-slate-200 border border-slate-700/80 pointer-events-none">
                  T2 Overlay ({Math.round(100 - swipePosition)}%)
                </div>

                <div className="absolute bottom-3 inset-x-0 mx-auto w-max px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur-sm text-[11px] text-slate-400 border border-slate-800 pointer-events-none">
                  Drag or click anywhere horizontally to swipe before/after
                </div>
              </div>
            ) : (
              /* Opacity Fade View */
              <div className="relative aspect-video max-h-[460px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800/80 flex items-center justify-center">
                <img
                  src={result.rgbT1DataUrl}
                  alt="T1 base"
                  className="absolute inset-0 w-full h-full object-contain"
                />
                <img
                  src={result.rgbT2DataUrl}
                  alt="T2 overlay"
                  className="absolute inset-0 w-full h-full object-contain transition-opacity duration-75"
                  style={{ opacity: blendValue }}
                />
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-slate-900/90 text-xs font-mono text-slate-200 border border-slate-700/80">
                  T1 Optical (Base)
                </div>
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded bg-slate-900/90 text-xs font-mono text-slate-200 border border-slate-700/80">
                  T2 / SAR ({Math.round(blendValue * 100)}%)
                </div>
              </div>
            )}

            {/* Slider / Preset Controls */}
            {blendMode === 'opacity' ? (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center gap-4">
                <span className="text-xs text-slate-300 font-medium whitespace-nowrap">
                  Before / After Blend:
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={blendValue}
                  onChange={(e) => setBlendValue(parseFloat(e.target.value))}
                  className="flex-1 accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
                <span className="text-xs font-mono text-emerald-400 w-12 text-right">
                  {Math.round(blendValue * 100)}%
                </span>
              </div>
            ) : (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400">Curtain Presets:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSwipePosition(100)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer"
                  >
                    100% T1 Base
                  </button>
                  <button
                    type="button"
                    onClick={() => setSwipePosition(50)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer"
                  >
                    50 / 50 Split
                  </button>
                  <button
                    type="button"
                    onClick={() => setSwipePosition(0)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer"
                  >
                    100% T2 Overlay
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'indices' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {result.indices?.ndvi && (
                <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-emerald-400">NDVI (Vegetation)</h4>
                      <span className="text-[10px] font-mono text-slate-400">NIR - Red</span>
                    </div>
                    <div className="aspect-square rounded-lg overflow-hidden bg-slate-900 border border-slate-800">
                      <img
                        src={result.indices.ndvi.colormapDataUrl}
                        alt="NDVI"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-slate-800 text-xs space-y-1 text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Mean Index:</span>
                      <span className="font-mono">{result.indices.ndvi.mean}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Positive Vigor:</span>
                      <span className="font-mono">{result.indices.ndvi.positivePct}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Vigorous Area:</span>
                      <span className="font-mono text-emerald-300">
                        {result.indices.ndvi.areaHectares} ha
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {result.indices?.ndwi && (
                <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-cyan-400">NDWI (Water Bodies)</h4>
                      <span className="text-[10px] font-mono text-slate-400">Green - NIR</span>
                    </div>
                    <div className="aspect-square rounded-lg overflow-hidden bg-slate-900 border border-slate-800">
                      <img
                        src={result.indices.ndwi.colormapDataUrl}
                        alt="NDWI"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-slate-800 text-xs space-y-1 text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Mean Index:</span>
                      <span className="font-mono">{result.indices.ndwi.mean}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Water Coverage:</span>
                      <span className="font-mono">{result.indices.ndwi.positivePct}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Water Area:</span>
                      <span className="font-mono text-cyan-300">
                        {result.indices.ndwi.areaHectares} ha
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {result.indices?.ndbi && (
                <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-amber-400">NDBI (Built-Up)</h4>
                      <span className="text-[10px] font-mono text-slate-400">SWIR - NIR</span>
                    </div>
                    <div className="aspect-square rounded-lg overflow-hidden bg-slate-900 border border-slate-800">
                      <img
                        src={result.indices.ndbi.colormapDataUrl}
                        alt="NDBI"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-slate-800 text-xs space-y-1 text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Mean Index:</span>
                      <span className="font-mono">{result.indices.ndbi.mean}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Built Coverage:</span>
                      <span className="font-mono">{result.indices.ndbi.positivePct}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Built Area:</span>
                      <span className="font-mono text-amber-300">
                        {result.indices.ndbi.areaHectares} ha
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen High-Resolution Inspection Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col p-4 sm:p-6 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">
                Full-Resolution Visual Evidence Inspection
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                ({result.boxes.length} detections)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden my-4 bg-black/60 rounded-xl border border-slate-800 cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <img
              src={dynamicVisualUrl || result.annotatedImageUrl}
              alt="Visual Evidence Fullscreen"
              className="max-w-full max-h-full object-contain pointer-events-none"
            />

            {hoverPixel && (
              <div className="absolute top-4 left-4 pointer-events-none z-10 flex items-center gap-2 bg-slate-950/90 backdrop-blur-md px-3.5 py-2 rounded-lg border border-slate-700/80 text-xs font-mono text-slate-200 shadow-2xl">
                <Crosshair className="w-4 h-4 text-indigo-400" />
                <span>
                  X: <strong className="text-white">{hoverPixel.x}</strong> Y:{' '}
                  <strong className="text-white">{hoverPixel.y}</strong>
                </span>
                <span className="text-slate-600">|</span>
                <span
                  className="w-3 h-3 rounded-full inline-block shrink-0 shadow-sm"
                  style={{ backgroundColor: hoverPixel.color }}
                />
                <span className="text-white font-semibold">{hoverPixel.cls}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
            <span>Hover anywhere to inspect pixel coordinates and segmentation class.</span>
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
            >
              Close Viewer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
