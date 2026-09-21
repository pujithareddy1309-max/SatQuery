import React from 'react';
import { Satellite, Layers, Droplets, TreePine, RefreshCw, Cpu, Radio, Compass } from 'lucide-react';
import { OperationalTemplate } from '../types';

interface HeaderProps {
  onSelectPreset: (presetName: string) => void;
  activeTemplate: OperationalTemplate;
  onStartTour?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onSelectPreset, activeTemplate, onStartTour }) => {
  const presets = [
    { name: 'Flood Risk', icon: Droplets, desc: 'NDWI t1/t2 & flood area' },
    { name: 'Land Cover', icon: Layers, desc: 'Water / vegetation / built-up' },
    { name: 'Change Detection', icon: RefreshCw, desc: 'Flooding & deforestation' },
    { name: 'Agriculture', icon: TreePine, desc: 'NDVI anomaly tracking' },
    { name: 'Optical–SAR Fusion', icon: Radio, desc: 'Radar backscatter fusion' },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur-md px-4 py-4 md:px-8 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-sm">
              <Satellite className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">SatQuery AI</h1>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Remote-Sensing Agent
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Sentinel-2 multispectral indices, pixel-level coverage, bi-temporal change & geospatial export
              </p>
            </div>
          </div>
        </div>

        {/* Runtime info badges & Floating Take Tour Button */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {onStartTour && (
            <button
              type="button"
              id="take-app-tour-btn"
              onClick={onStartTour}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-500/25 to-teal-500/25 hover:from-emerald-500/35 hover:to-teal-500/35 border border-emerald-500/50 text-emerald-300 text-xs font-semibold shadow-md shadow-emerald-950/40 hover:scale-105 active:scale-95 transition-all cursor-pointer ring-1 ring-emerald-400/40"
              title="Start step-by-step interactive guided walkthrough of all app features"
            >
              <Compass className="w-3.5 h-3.5 text-emerald-400" />
              <span>Take Tour</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('live-voice-conversation-card');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
                el.classList.add('ring-2', 'ring-indigo-500');
                setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-500'), 1500);
                const btn = document.getElementById('start-live-voice-call-btn');
                if (btn) btn.focus();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-indigo-600/30 to-violet-600/30 hover:from-indigo-600/50 hover:to-violet-600/50 border border-indigo-500/50 text-indigo-200 text-xs font-semibold shadow-sm transition cursor-pointer"
            title="Start real-time voice conversation with Gemini 3.8 Live"
          >
            <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span>Voice Call (gemini-3.8-live)</span>
          </button>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span>Structured Tool Planner</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>10m Sentinel-2 GSD</span>
          </div>
        </div>
      </div>

      {/* Preset Operation Buttons */}
      <div id="header-presets" className="max-w-7xl mx-auto mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">Presets:</span>
        {presets.map((preset) => {
          const Icon = preset.icon;
          return (
            <button
              key={preset.name}
              id={`preset-${preset.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
              onClick={() => onSelectPreset(preset.name)}
              className="group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/90 hover:bg-slate-700 hover:text-white text-slate-200 border border-slate-700/70 hover:border-slate-600 transition-all cursor-pointer shadow-sm active:scale-95"
              title={preset.desc}
            >
              <Icon className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span>{preset.name}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
