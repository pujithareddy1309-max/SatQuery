import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Sliders,
  Sparkles,
  Mic,
  MicOff,
  Square,
  Loader2,
  Search,
  MapPin,
  Globe2,
  AlertCircle,
  CheckCircle2,
  X,
  CornerDownLeft,
} from 'lucide-react';
import { OperationalTemplate } from '../types';

interface ControlsProps {
  template: OperationalTemplate;
  onTemplateChange: (template: OperationalTemplate) => void;
  query: string;
  onQueryChange: (q: string) => void;
  opacity: number;
  onOpacityChange: (val: number) => void;
  onRun: () => void;
  isLoading: boolean;
  onLoadExample: (idx: number) => void;
  groundingType: 'none' | 'search' | 'maps';
  onGroundingTypeChange: (type: 'none' | 'search' | 'maps') => void;
  onFetchGrounding: () => void;
  isGroundingLoading: boolean;
}

export const Controls: React.FC<ControlsProps> = ({
  template,
  onTemplateChange,
  query,
  onQueryChange,
  opacity,
  onOpacityChange,
  onRun,
  isLoading,
  onLoadExample,
  groundingType,
  onGroundingTypeChange,
  onFetchGrounding,
  isGroundingLoading,
}) => {
  // Audio transcription state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioFeedback, setAudioFeedback] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    setAudioFeedback(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setAudioFeedback('Audio recording is not supported in this browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // Prefer audio/webm, fallback to browser default
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = '';
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // Stop audio tracks to release microphone
        stream.getTracks().forEach((track) => track.stop());

        const recordedBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });

        if (recordedBlob.size === 0) {
          setAudioFeedback('No audio recorded. Please try again.');
          return;
        }

        // Convert blob to base64
        setIsTranscribing(true);
        setAudioFeedback('Transcribing with gemini-3.5-transcribe...');

        try {
          const reader = new FileReader();
          reader.readAsDataURL(recordedBlob);
          reader.onloadend = async () => {
            const dataUrl = reader.result as string;
            const base64Audio = dataUrl.split(',')[1];
            const mime = recordedBlob.type || 'audio/webm';

            const res = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64: base64Audio, mimeType: mime }),
            });

            const data = await res.json();
            if (data.success && data.transcription) {
              const transcribedText = data.transcription.trim();
              onQueryChange(
                query.trim() ? `${query.trim()} ${transcribedText}` : transcribedText
              );
              setAudioFeedback(`Transcribed: "${transcribedText}"`);
              setTimeout(() => setAudioFeedback(null), 4000);
            } else if (data.rateLimited) {
              setAudioFeedback('Gemini transcription rate limit reached. Type your query directly.');
            } else {
              setAudioFeedback(data.error || 'Transcription failed.');
            }
            setIsTranscribing(false);
          };
        } catch (err: any) {
          console.error('Audio processing error:', err);
          setAudioFeedback('Error preparing audio for transcription.');
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250); // collect 250ms slices
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((sec) => sec + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access denied or error:', err);
      setAudioFeedback('Microphone access denied. Check browser permissions.');
    }
  };

  const stopRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const templates: Array<{ id: OperationalTemplate; label: string; desc: string }> = [
    { id: 'auto', label: 'Auto / Agent', desc: 'Autonomous heuristic routing' },
    { id: 'disaster', label: 'Disaster / Flood', desc: 'NDWI inundation & hazard zones' },
    { id: 'agriculture', label: 'Agriculture', desc: 'NDVI vegetation vigor & stress' },
    { id: 'landcover', label: 'Land Cover', desc: 'Water, vegetation, built-up masks' },
    { id: 'change', label: 'Change Detection', desc: 'Bi-temporal deforestation & construction' },
  ];

  const quickExamples = [
    {
      title: 'Land Cover & Water',
      query: 'Segment water, vegetation, and built-up coverage in this image.',
      template: 'landcover' as OperationalTemplate,
    },
    {
      title: 'Deforestation & Change',
      query: 'Classify deforestation and construction between these two dates.',
      template: 'change' as OperationalTemplate,
    },
    {
      title: 'Optical–SAR Fusion',
      query: 'Fuse optical and SAR to identify built-up and water regions.',
      template: 'auto' as OperationalTemplate,
    },
    {
      title: 'Flood Hazard Inundation',
      query: 'Map flood extent, water coverage, and affected area in hectares.',
      template: 'disaster' as OperationalTemplate,
    },
  ];

  return (
    <div id="controls-container" className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      {/* Template Radio Bar */}
      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
          Operational Template
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => onTemplateChange(t.id)}
              className={`text-left px-3 py-2 rounded-lg border text-xs transition cursor-pointer flex flex-col justify-between ${
                template === t.id
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-white ring-1 ring-emerald-500/30'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="font-medium text-emerald-300">{t.label}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Query Input with Microphone Transcription & Grounding Options */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Natural Language Query
            </label>
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
              gemini-3.5-transcribe ready
            </span>
          </div>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Speak or type geospatial questions
          </span>
        </div>

        <div className="relative">
          <textarea
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (!isLoading) {
                  onRun();
                }
              }
            }}
            rows={2}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-4 pr-32 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition resize-none font-sans"
            placeholder="E.g., Segment water, vegetation, and built-up coverage, or compute flood extent... (Press ⌘+Enter to run)"
          />

          {/* Right Action Buttons: Clear & Mic Voice Input */}
          <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
            {query && !isLoading && (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition cursor-pointer"
                title="Clear query input"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {isRecording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow-md shadow-rose-950/40 animate-pulse transition cursor-pointer"
                title="Stop recording and transcribe"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span className="font-mono">{formatTimer(recordingSeconds)}</span>
              </button>
            ) : isTranscribing ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                <span>Transcribing...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-medium transition cursor-pointer active:scale-95"
                title="Voice Input: Speak and transcribe using gemini-3.5-transcribe"
              >
                <Mic className="w-3.5 h-3.5 text-emerald-400" />
                <span>Voice</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick query chips */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="text-[10px] uppercase font-semibold text-slate-500">Quick Prompts:</span>
          {[
            {
              label: 'NDVI Vegetation',
              text: 'Segment all vegetation classes and calculate healthy canopy coverage.',
            },
            {
              label: 'Water Extent',
              text: 'Isolate open water bodies, rivers, and evaluate inundation perimeter.',
            },
            {
              label: 'Built Infrastructure',
              text: 'Highlight urban buildings, paved roadways, and human settlements.',
            },
            {
              label: 'Change Detection',
              text: 'Compare T1 and T2 images to identify areas of significant land surface change.',
            },
          ].map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onQueryChange(chip.text)}
              className="text-[11px] px-2 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition cursor-pointer"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Audio feedback notice */}
        {audioFeedback && (
          <div className="mt-1.5 text-xs flex items-center gap-1.5 text-slate-300 bg-slate-950/70 px-3 py-1 rounded-lg border border-slate-800">
            <AlertCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">{audioFeedback}</span>
          </div>
        )}
      </div>

      {/* Grounding Controls Bar (Google Search & Google Maps Grounding with gemini-3.5-flash) */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1">
            <Globe2 className="w-3.5 h-3.5 text-teal-400" />
            Grounding (gemini-3.5-flash):
          </span>

          {/* None */}
          <button
            type="button"
            onClick={() => onGroundingTypeChange('none')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
              groundingType === 'none'
                ? 'bg-slate-800 text-slate-100 border border-slate-600'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Off
          </button>

          {/* Search Grounding */}
          <button
            type="button"
            onClick={() => onGroundingTypeChange('search')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition cursor-pointer ${
              groundingType === 'search'
                ? 'bg-blue-500/20 border-blue-500/60 text-blue-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Ground with Google Search for recent events, climate reports, and real-world facts"
          >
            <Search className="w-3 h-3 text-blue-400" />
            <span>Google Search</span>
          </button>

          {/* Maps Grounding */}
          <button
            type="button"
            onClick={() => onGroundingTypeChange('maps')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition cursor-pointer ${
              groundingType === 'maps'
                ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Ground with Google Maps for accurate place boundaries, coordinates, and physical geography"
          >
            <MapPin className="w-3 h-3 text-amber-400" />
            <span>Google Maps</span>
          </button>
        </div>

        {/* Instant Ground Query Button */}
        {groundingType !== 'none' && (
          <button
            type="button"
            onClick={onFetchGrounding}
            disabled={isGroundingLoading}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-medium transition cursor-pointer disabled:opacity-50"
          >
            {isGroundingLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Grounding...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                <span>Fetch Grounding Context</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Opacity Slider & Quick Examples */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center pt-1">
        {/* Opacity Slider */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
          <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
            <div className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>Mask & Temporal Blend Opacity</span>
            </div>
            <span className="font-mono text-emerald-400">{Math.round(opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
            className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>

        {/* Quick Examples */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 flex items-center gap-1 whitespace-nowrap">
            <Sparkles className="w-3 h-3 text-emerald-400" />
            Examples:
          </span>
          {quickExamples.map((ex, i) => (
            <button
              key={i}
              onClick={() => onLoadExample(i)}
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 whitespace-nowrap text-[11px] transition cursor-pointer active:scale-95"
            >
              {ex.title}
            </button>
          ))}
        </div>
      </div>

      {/* Run Button */}
      <div className="pt-2">
        <button
          id="run-agent-btn"
          onClick={onRun}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 transition shadow-lg shadow-emerald-950/40 cursor-pointer active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
              <span>Executing Autonomous SatQuery Agent Loop...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Run SatQuery Agent</span>
              {groundingType !== 'none' && (
                <span className="text-xs bg-slate-950/40 text-emerald-950 px-2 py-0.5 rounded font-mono font-normal">
                  + {groundingType === 'search' ? 'Google Search' : 'Google Maps'} Grounded
                </span>
              )}
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-black/20 text-emerald-950 ml-1">
                <CornerDownLeft className="w-3 h-3" />
                <span>⌘+Enter</span>
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
