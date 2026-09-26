import React, { useRef } from 'react';
import { Upload, Calendar, Cloud, Globe, Sparkles, Radio, Eye } from 'lucide-react';
import { RasterScene } from '../types';
import { extractBandsFromRgba } from '../satquery/indices';
import { generateDemoScene, sceneToDataUrl } from '../satquery/demo';
import { CollapsibleCard } from './CollapsibleCard';

interface ImagePanelProps {
  scene1: RasterScene;
  scene2: RasterScene | null;
  onScene1Change: (scene: RasterScene) => void;
  onScene2Change: (scene: RasterScene | null) => void;
  isSar: boolean;
  onSarChange: (val: boolean) => void;
  sample1Key: string;
  sample2Key: string;
  onSample1Select: (key: any) => void;
  onSample2Select: (key: any) => void;
}

export const ImagePanel: React.FC<ImagePanelProps> = ({
  scene1,
  scene2,
  onScene1Change,
  onScene2Change,
  isSar,
  onSarChange,
  sample1Key,
  sample2Key,
  onSample1Select,
  onSample2Select,
}) => {
  const fileInput1Ref = useRef<HTMLInputElement>(null);
  const fileInput2Ref = useRef<HTMLInputElement>(null);
  const [isDragging1, setIsDragging1] = React.useState(false);
  const [isDragging2, setIsDragging2] = React.useState(false);

  const demoOptions = [
    { key: 'water', label: 'Water Body (Lake / Reservoir)' },
    { key: 'forest', label: 'Forest / Vegetation (t1)' },
    { key: 'cleared', label: 'Cleared / Deforestation (t2)' },
    { key: 'flooded', label: 'Flooded / Inundated (t2)' },
    { key: 'urban', label: 'Urban / Built-up Grid' },
    { key: 'sar', label: 'SAR Microwave Tile (Sentinel-1)' },
  ];

  const processFile = (file: File, target: 'scene1' | 'scene2') => {
    if (!file) return;

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const width = Math.min(512, Math.max(128, img.naturalWidth || 256));
      const height = Math.min(512, Math.max(128, img.naturalHeight || 256));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, width, height);
      const imgData = ctx.getImageData(0, 0, width, height);
      const bands = extractBandsFromRgba(imgData.data, width, height);

      const customScene: RasterScene = {
        id: `uploaded_${Date.now()}`,
        name: file.name,
        width,
        height,
        rgbData: imgData.data,
        bands,
        crs: 'EPSG:32633',
        bounds: [500000, 4200000, 500000 + width * 10, 4200000 + height * 10],
        pixelSizeM: [10, 10],
        acquisitionDate: new Date().toISOString().split('T')[0],
        cloudPct: 0.0,
        bandSource: 'rgb-proxy',
        isSar: target === 'scene2' && isSar,
      };

      if (target === 'scene1') {
        onScene1Change(customScene);
      } else {
        onScene2Change(customScene);
      }
      URL.revokeObjectURL(url);
    };

    img.src = url;
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'scene1' | 'scene2'
  ) => {
    const file = e.target.files?.[0];
    if (file) processFile(file, target);
  };

  const scene1Url = sceneToDataUrl(scene1);
  const scene2Url = scene2 ? sceneToDataUrl(scene2) : null;

  return (
    <CollapsibleCard
      id="image-panels-container"
      title="Dual-Scene Satellite Imagery"
      subtitle="Sentinel-2 MSI optical (T1), temporal post-event (T2), and Sentinel-1 SAR microwave radar pairs"
      icon={Eye}
      iconColor="text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
      badge={
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 font-mono text-emerald-300">
            T1: {scene1.width}×{scene1.height}px
          </span>
          {scene2 && (
            <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 font-mono text-cyan-300">
              T2: {isSar ? 'SAR C-Band' : 'Optical'}
            </span>
          )}
        </div>
      }
      collapsedSummary={
        <span className="text-slate-400 text-xs">
          Scene 1: {scene1.crs || 'EPSG:32633'} ({scene1.acquisitionDate || '2024-04-01'})
          {scene2 ? ` · Scene 2: ${isSar ? 'Sentinel-1 SAR' : 'Sentinel-2 MSI'}` : ''}
        </span>
      }
      bodyClassName="p-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Scene 1 Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <h2 className="text-sm font-semibold text-white">Image 1 (Optical / T1)</h2>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              Primary Scene
            </span>
          </div>

          {/* Image Display with Drag & Drop */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging1(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging1(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging1(false);
              const f = e.dataTransfer.files?.[0];
              if (f) processFile(f, 'scene1');
            }}
            className={`relative aspect-video max-h-56 bg-slate-950 rounded-lg overflow-hidden border transition flex items-center justify-center group ${
              isDragging1
                ? 'border-emerald-400 ring-2 ring-emerald-500/40 bg-emerald-950/30'
                : 'border-slate-800'
            }`}
          >
            <img
              src={scene1Url}
              alt="Optical T1"
              className="w-full h-full object-contain"
            />
            <div className="absolute top-2 right-2 px-2 py-1 rounded bg-slate-900/80 backdrop-blur text-[10px] text-slate-300 font-mono border border-slate-700/60">
              {scene1.width} × {scene1.height} px
            </div>
            {isDragging1 && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-emerald-400 font-medium text-xs gap-1.5 pointer-events-none">
                <Upload className="w-6 h-6 animate-bounce" />
                <span>Drop image here to load Scene 1</span>
              </div>
            )}
          </div>

          {/* Sample Selector & Custom Upload */}
          <div className="mt-3 flex items-center gap-2">
            <select
              value={sample1Key}
              onChange={(e) => onSample1Select(e.target.value)}
              className="flex-1 text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              {demoOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              onClick={() => fileInput1Ref.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
              title="Upload custom PNG / JPEG / GeoTIFF proxy"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload</span>
            </button>
            <input
              ref={fileInput1Ref}
              type="file"
              accept="image/*,.tif,.tiff"
              className="hidden"
              onChange={(e) => handleFileUpload(e, 'scene1')}
            />
          </div>
        </div>

        {/* Metadata Footer */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-1">
            <Globe className="w-3 h-3 text-slate-500" />
            <span className="truncate">{scene1.crs || 'EPSG:32633'}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-slate-500" />
            <span>{scene1.acquisitionDate || '2024-04-01'}</span>
          </div>
          <div className="flex items-center gap-1 justify-end">
            <Cloud className="w-3 h-3 text-slate-500" />
            <span>{scene1.cloudPct !== undefined ? `${scene1.cloudPct}% cloud` : 'Clear'}</span>
          </div>
        </div>
      </div>

      {/* Scene 2 Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  scene2 ? (isSar ? 'bg-amber-400' : 'bg-cyan-400') : 'bg-slate-600'
                }`}
              ></span>
              <h2 className="text-sm font-semibold text-white">Image 2 (T2 or SAR Pair)</h2>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSar}
                  onChange={(e) => onSarChange(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-400 focus:ring-offset-slate-900 bg-slate-800"
                />
                <span className="flex items-center gap-1">
                  <Radio className="w-3 h-3 text-amber-400" />
                  <span>SAR Pair</span>
                </span>
              </label>
            </div>
          </div>

          {/* Image Display with Drag & Drop */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging2(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging2(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging2(false);
              const f = e.dataTransfer.files?.[0];
              if (f) processFile(f, 'scene2');
            }}
            className={`relative aspect-video max-h-56 bg-slate-950 rounded-lg overflow-hidden border transition flex items-center justify-center group ${
              isDragging2
                ? 'border-cyan-400 ring-2 ring-cyan-500/40 bg-cyan-950/30'
                : 'border-slate-800'
            }`}
          >
            {scene2Url ? (
              <>
                <img
                  src={scene2Url}
                  alt="T2 / SAR Scene"
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-2 right-2 px-2 py-1 rounded bg-slate-900/80 backdrop-blur text-[10px] text-slate-300 font-mono border border-slate-700/60">
                  {scene2?.width} × {scene2?.height} px
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <p className="text-xs">No second image selected</p>
                <button
                  onClick={() => onSample2Select('cleared')}
                  className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Load change pair
                </button>
              </div>
            )}
            {isDragging2 && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-cyan-400 font-medium text-xs gap-1.5 pointer-events-none">
                <Upload className="w-6 h-6 animate-bounce" />
                <span>Drop image here to load Scene 2</span>
              </div>
            )}
          </div>

          {/* Sample Selector & Custom Upload */}
          <div className="mt-3 flex items-center gap-2">
            <select
              value={sample2Key}
              onChange={(e) => onSample2Select(e.target.value)}
              className="flex-1 text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              <option value="none">-- No Second Image --</option>
              {demoOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              onClick={() => fileInput2Ref.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload</span>
            </button>
            <input
              ref={fileInput2Ref}
              type="file"
              accept="image/*,.tif,.tiff"
              className="hidden"
              onChange={(e) => handleFileUpload(e, 'scene2')}
            />
          </div>
        </div>

        {/* Metadata Footer */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-1">
            <Globe className="w-3 h-3 text-slate-500" />
            <span className="truncate">{scene2?.crs || 'EPSG:32633'}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-slate-500" />
            <span>{scene2?.acquisitionDate || '2024-10-12'}</span>
          </div>
          <div className="flex items-center gap-1 justify-end">
            <Cloud className="w-3 h-3 text-slate-500" />
            <span>{scene2 ? `${scene2.cloudPct || 0}% cloud` : 'N/A'}</span>
          </div>
        </div>
      </div>
    </div>
  </CollapsibleCard>
);
};
