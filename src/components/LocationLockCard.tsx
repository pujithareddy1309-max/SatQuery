import React, { useState } from 'react';
import {
  MapPin,
  Crosshair,
  Calendar,
  Layers,
  Globe2,
  Radio,
  ExternalLink,
  CheckCircle2,
  Activity,
  ArrowRight,
  Maximize2,
  Sparkles,
  Compass,
  Droplets,
  Satellite,
  Info,
  X,
  Clock,
  Sliders,
  Copy,
  Check
} from 'lucide-react';
import { LocationLockData, OperationalTemplate } from '../types';

interface LocationLockCardProps {
  locationData: LocationLockData;
  onExecute: (
    location: LocationLockData,
    t1Date: string,
    t2Date: string,
    layer: 'google-maps' | 'osiris-optical' | 'osiris-sar' | 'osiris-ndwi',
    template: OperationalTemplate
  ) => void;
  onDismiss?: () => void;
  isExecuting?: boolean;
}

export const LocationLockCard: React.FC<LocationLockCardProps> = ({
  locationData,
  onExecute,
  onDismiss,
  isExecuting = false,
}) => {
  // Sensor comparison mode
  const [comparisonMode, setComparisonMode] = useState<'optical-sar' | 'optical-optical' | 'sar-sar'>(
    locationData.selectedLayer === 'osiris-sar' ? 'optical-sar' : 'optical-sar'
  );
  const [activeLayer, setActiveLayer] = useState<'google-maps' | 'osiris-optical' | 'osiris-sar' | 'osiris-ndwi'>(
    'osiris-sar'
  );
  const [t1Date, setT1Date] = useState<string>(locationData.t1Date || '2023-08-15');
  const [t2Date, setT2Date] = useState<string>(locationData.t2Date || '2024-04-20');
  const [selectedTemplate, setSelectedTemplate] = useState<OperationalTemplate>('change');
  const [copiedCoords, setCopiedCoords] = useState(false);

  const handleCopyCoords = () => {
    navigator.clipboard.writeText(`${locationData.lat.toFixed(6)}, ${locationData.lon.toFixed(6)}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const handleRun = () => {
    const layer = comparisonMode === 'optical-sar' || comparisonMode === 'sar-sar' ? 'osiris-sar' : 'osiris-optical';
    onExecute(locationData, t1Date, t2Date, layer, selectedTemplate);
  };

  return (
    <div className="rounded-xl border border-emerald-500/50 bg-slate-900/95 shadow-2xl shadow-emerald-950/40 overflow-hidden text-slate-100 my-3">
      {/* 1. Target Confirmation Pin Top Banner */}
      <div className="px-4 py-3 bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border-b border-emerald-500/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-400 shadow-lg shadow-emerald-950/60">
            <MapPin className="w-5 h-5 text-emerald-400 animate-bounce" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider uppercase text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Confirmation Pin Placed
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold uppercase tracking-wider">
                TARGET PINNED & LOCKED
              </span>
            </div>
            <p className="text-sm text-slate-100 font-semibold truncate max-w-lg">
              {locationData.formattedAddress}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyCoords}
            className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 rounded-md transition cursor-pointer"
            title="Copy Latitude & Longitude"
          >
            {copiedCoords ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
            <span className="hidden sm:inline">{copiedCoords ? 'Copied' : 'Coords'}</span>
          </button>

          <a
            href={locationData.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 bg-cyan-950/60 border border-cyan-800/80 px-2.5 py-1 rounded-md transition"
            title="Open in Google Maps"
          >
            <Globe2 className="w-3 h-3" />
            <span className="hidden sm:inline">Google Maps</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Dismiss location lock"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Geospatial Telemetry HUD Chips */}
      <div className="px-4 py-2.5 bg-slate-950/90 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
        <div className="text-slate-400">
          <span className="text-[10px] text-slate-500 block uppercase font-sans">Pin Coordinates</span>
          <span className="text-emerald-400 font-semibold">
            {locationData.lat.toFixed(5)}°, {locationData.lon.toFixed(5)}°
          </span>
        </div>
        <div className="text-slate-400">
          <span className="text-[10px] text-slate-500 block uppercase font-sans">UTM Zone & CRS</span>
          <span className="text-cyan-400 font-semibold">
            {locationData.utmZone} ({locationData.crs})
          </span>
        </div>
        <div className="text-slate-400">
          <span className="text-[10px] text-slate-500 block uppercase font-sans">MGRS Grid Ref</span>
          <span className="text-slate-200">{locationData.mgrs}</span>
        </div>
        <div className="text-slate-400">
          <span className="text-[10px] text-slate-500 block uppercase font-sans">Sensor Bounding Box</span>
          <span className="text-indigo-300 font-semibold truncate block">
            {locationData.bounds[0]}, {locationData.bounds[1]}
          </span>
        </div>
      </div>

      {/* Main Card Content */}
      <div className="p-4 space-y-4">
        {/* Interactive Google Maps / Satellite Preview with Pin */}
        <div className="relative w-full h-44 sm:h-52 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-inner">
          <iframe
            title="Google Maps Location View"
            width="100%"
            height="100%"
            frameBorder="0"
            scrolling="no"
            marginHeight={0}
            marginWidth={0}
            src={`https://maps.google.com/maps?q=${locationData.lat},${locationData.lon}&t=k&z=16&ie=UTF8&iwloc=&output=embed`}
            className="w-full h-full opacity-90 contrast-105"
          />

          {/* Overlaid Target Crosshairs & Confirmation Pin Marker */}
          <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none bg-slate-950/85 backdrop-blur-md border border-emerald-500/50 px-2.5 py-1.5 rounded-lg text-xs font-mono text-emerald-300 flex items-center gap-1.5 shadow-lg">
            <MapPin className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="font-semibold">PINNED:</span>
            <span>{locationData.lat.toFixed(4)}°, {locationData.lon.toFixed(4)}°</span>
          </div>

          <div className="absolute bottom-2.5 right-2.5 z-10 pointer-events-none bg-slate-950/85 backdrop-blur-md border border-slate-800 px-2.5 py-1 rounded text-[10px] font-mono text-cyan-300 flex items-center gap-1">
            <Satellite className="w-3 h-3 text-cyan-400" />
            <span>Sentinel-2 (10m Optical) + Sentinel-1 (SAR Radar)</span>
          </div>
        </div>

        {/* 3. Automatic Prompt: Select or Input Two Time Periods */}
        <div className="bg-slate-950/80 p-4 rounded-xl border border-emerald-500/30 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-emerald-500/20 text-emerald-400">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-100 uppercase tracking-wider block">
                  Select Two Time Periods for Bi-Temporal Change Detection
                </span>
                <span className="text-[11px] text-slate-400">
                  Compare T1 baseline pre-event against T2 post-event comparison rasters
                </span>
              </div>
            </div>
            <span className="text-xs text-emerald-400 font-mono font-semibold bg-emerald-950/60 px-2.5 py-1 rounded-md border border-emerald-800/60">
              Delta: {t1Date} ➔ {t2Date}
            </span>
          </div>

          {/* Dual Date Pickers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* T1 Baseline Period */}
            <div className="space-y-1.5 bg-slate-900/70 p-3 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Time Period 1 (T1 Baseline):</span>
                </label>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 font-mono">
                  Pre-Event / Reference
                </span>
              </div>
              <input
                type="date"
                value={t1Date}
                onChange={(e) => setT1Date(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { label: '1 Year Ago', date: '2023-08-15' },
                  { label: '6 Mos Ago', date: '2023-11-20' },
                  { label: 'Pre-Monsoon', date: '2024-01-10' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setT1Date(preset.date)}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* T2 Comparison Period */}
            <div className="space-y-1.5 bg-slate-900/70 p-3 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Time Period 2 (T2 Comparison):</span>
                </label>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 font-mono">
                  Post-Event / Assessment
                </span>
              </div>
              <input
                type="date"
                value={t2Date}
                onChange={(e) => setT2Date(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { label: 'Recent Pass', date: '2024-04-20' },
                  { label: 'Peak Shift', date: '2024-06-15' },
                  { label: 'Latest Cycle', date: '2024-09-20' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setT2Date(preset.date)}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Comparison Sensor Configuration: Sentinel-2 Optical & Sentinel-1 SAR Comparison */}
          <div className="pt-2 border-t border-slate-800">
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
              <Satellite className="w-3.5 h-3.5 text-amber-400" />
              Comparison Rasters Sensor Configuration:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                {
                  id: 'optical-sar',
                  label: 'Sentinel-2 Optical ↔ Sentinel-1 SAR',
                  badge: 'Recommended',
                  badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                  desc: 'T1: 10m Optical MSI · T2: C-Band Radar Backscatter (Cloud-penetrating)',
                  icon: Radio,
                },
                {
                  id: 'optical-optical',
                  label: 'Sentinel-2 Optical ↔ Sentinel-2 Optical',
                  badge: 'Optical Pair',
                  badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
                  desc: 'T1: 10m Multi-spectral · T2: 10m Multi-spectral (NDVI & RGB)',
                  icon: Layers,
                },
                {
                  id: 'sar-sar',
                  label: 'Sentinel-1 SAR ↔ Sentinel-1 SAR',
                  badge: 'Dual Radar',
                  badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                  desc: 'T1: C-Band Radar · T2: C-Band Radar (Coherence & Structure)',
                  icon: Radio,
                },
              ].map((opt) => {
                const Icon = opt.icon;
                const isSelected = comparisonMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setComparisonMode(opt.id as any);
                      setActiveLayer(opt.id === 'optical-optical' ? 'osiris-optical' : 'osiris-sar');
                    }}
                    className={`p-2.5 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-slate-800/90 border-emerald-500/60 ring-1 ring-emerald-500/40 text-white shadow-sm'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`} />
                        <span className="text-xs font-semibold text-slate-200">{opt.label}</span>
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold ${opt.badgeColor}`}>
                        {opt.badge}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 leading-tight block mt-1">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Analysis Goal / Operational Template */}
          <div className="pt-2 border-t border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 block mb-1.5 uppercase">
              Operational Detection Template:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'change', label: 'Bi-Temporal Change', icon: Activity },
                { id: 'disaster', label: 'Flood Inundation', icon: Droplets },
                { id: 'landcover', label: 'Land Cover Shift', icon: Layers },
                { id: 'agriculture', label: 'Vegetation Stress', icon: Sparkles },
              ].map((tmpl) => {
                const Icon = tmpl.icon;
                const isSelected = selectedTemplate === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => setSelectedTemplate(tmpl.id as OperationalTemplate)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{tmpl.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 5. Primary Action Button */}
        <div className="pt-1 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              Will lock onto {locationData.formattedAddress}, fetch co-registered {t1Date} (T1) & {t2Date} (T2) Sentinel rasters, and execute change algorithms.
            </span>
          </div>

          <button
            type="button"
            onClick={handleRun}
            disabled={isExecuting}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-950/50 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer disabled:opacity-60"
          >
            {isExecuting ? (
              <>
                <Activity className="w-4 h-4 animate-spin text-slate-950" />
                <span>Loading Comparison Rasters & Running Detection...</span>
              </>
            ) : (
              <>
                <Crosshair className="w-4 h-4 text-slate-950" />
                <span>Lock & Execute Bi-Temporal Detection</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-950" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
