import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Volume1,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Globe2,
  Sliders,
  Copy,
  Check,
  Radio,
  BookOpen,
  Microscope,
  Languages,
  CheckCircle2,
  Download,
  FastForward,
  Rewind,
} from 'lucide-react';
import {
  AgentResult,
  ExplanationComplexity,
  ExplanationLanguage,
  AudioExplanationData,
  RasterScene,
} from '../types';

interface AudioExplanationProps {
  result: AgentResult | null;
  scene1: RasterScene;
  scene2: RasterScene | null;
  query: string;
}

const SUPPORTED_LANGUAGES: ExplanationLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English', speechCode: 'en-US', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', speechCode: 'es-ES', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', speechCode: 'fr-FR', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', speechCode: 'de-DE', flag: '🇩🇪' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', speechCode: 'hi-IN', flag: '🇮🇳' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', speechCode: 'zh-CN', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', speechCode: 'ja-JP', flag: '🇯🇵' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', speechCode: 'pt-BR', flag: '🇧🇷' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', speechCode: 'it-IT', flag: '🇮🇹' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', speechCode: 'ar-SA', flag: '🇸🇦' },
];

const GEMINI_VOICES = [
  { id: 'Kore', name: 'Kore', label: 'Warm & Natural' },
  { id: 'Puck', name: 'Puck', label: 'Crisp & Lively' },
  { id: 'Fenrir', name: 'Fenrir', label: 'Deep & Authoritative' },
  { id: 'Zephyr', name: 'Zephyr', label: 'Smooth & Balanced' },
];

export const AudioExplanation: React.FC<AudioExplanationProps> = ({
  result,
  scene1,
  scene2,
  query,
}) => {
  // User Configuration
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');
  const [complexity, setComplexity] = useState<ExplanationComplexity>('simple');
  const [selectedVoice, setSelectedVoice] = useState<string>('Kore');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

  // Audio & Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioData, setAudioData] = useState<AudioExplanationData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState<number>(1.0);
  const [hasCopied, setHasCopied] = useState(false);
  const [playbackEngine, setPlaybackEngine] = useState<'gemini' | 'webspeech'>('gemini');

  // Cache for generated explanations across languages and styles to make playback instant
  const audioCacheRef = useRef<Map<string, AudioExplanationData>>(new Map());

  // DOM & Audio Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechIntervalRef = useRef<any>(null);

  // Stop any playing audio on unmount
  useEffect(() => {
    return () => {
      stopAllPlayback();
    };
  }, []);

  // Update audio speed whenever changed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Update volume whenever changed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const stopAllPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (speechIntervalRef.current) {
      clearInterval(speechIntervalRef.current);
      speechIntervalRef.current = null;
    }
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Generate Audio Explanation from Server with Instant Memory Caching
  const generateExplanation = async (forcePlay = true) => {
    if (!result) return;
    stopAllPlayback();

    const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === selectedLanguage) || SUPPORTED_LANGUAGES[0];
    const cacheKey = `${scene1.id}_${selectedLanguage}_${complexity}_${selectedVoice}`;

    // Instant Cache Hit Check
    if (audioCacheRef.current.has(cacheKey)) {
      const cached = audioCacheRef.current.get(cacheKey)!;
      setAudioData(cached);
      if (forcePlay) {
        if (cached.audioUrl) {
          setPlaybackEngine('gemini');
          playGeminiAudio(cached.audioUrl);
        } else {
          setPlaybackEngine('webspeech');
          playWebSpeech(cached.script, langObj.speechCode);
        }
      }
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch('/api/audio-explanation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query || 'Satellite scene analysis',
          answer: result.answer || '',
          coverage: result.coverage || [],
          trendSummary: (result as any).trendSummary || null,
          indices: result.indices || null,
          language: langObj.code,
          languageName: langObj.name,
          complexity,
          voice: selectedVoice,
          synthesizeAudio: true,
        }),
      });

      const data = await response.json();
      if (data && data.success) {
        audioCacheRef.current.set(cacheKey, data);
        setAudioData(data);

        // If Gemini TTS audio is available
        if (data.audioUrl) {
          setPlaybackEngine('gemini');
          if (forcePlay) {
            playGeminiAudio(data.audioUrl);
          }
        } else {
          // Fallback to Web Speech API
          setPlaybackEngine('webspeech');
          if (forcePlay) {
            playWebSpeech(data.script, langObj.speechCode);
          }
        }
      }
    } catch (err) {
      console.error('Failed to generate audio explanation:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Playback via Gemini WAV Audio
  const playGeminiAudio = (url: string) => {
    stopAllPlayback();
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    audio.src = url;
    audio.playbackRate = playbackSpeed;
    audio.muted = isMuted;

    audio.onloadedmetadata = () => {
      setDuration(audio.duration || 0);
    };

    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.onerror = (e) => {
      console.warn('HTMLAudio error, falling back to Web Speech:', e);
      if (audioData?.script) {
        const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === selectedLanguage);
        playWebSpeech(audioData.script, langObj?.speechCode || 'en-US');
      }
    };

    audio
      .play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch((err) => {
        console.warn('Audio play auto-block:', err);
        setIsPlaying(false);
      });
  };

  // Playback via Browser SpeechSynthesis
  const playWebSpeech = (text: string, speechCode: string) => {
    stopAllPlayback();
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported in this browser.');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechCode;
    utterance.rate = playbackSpeed;
    synthRef.current = utterance;

    // Pick best matching voice
    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = voices.find(
      (v) => v.lang.startsWith(speechCode) || v.lang.replace('_', '-').startsWith(speechCode.slice(0, 2))
    );
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    // Estimate duration for progress bar (rough: 150 words per min = 2.5 words/sec)
    const words = text.split(/\s+/).length;
    const estDuration = Math.max(3, (words / 2.5) / playbackSpeed);
    setDuration(estDuration);

    const startTime = Date.now();
    speechIntervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed >= estDuration) {
        clearInterval(speechIntervalRef.current);
      } else {
        setCurrentTime(elapsed);
      }
    }, 200);

    utterance.onstart = () => {
      setIsPlaying(true);
    };

    utterance.onend = () => {
      if (speechIntervalRef.current) clearInterval(speechIntervalRef.current);
      setIsPlaying(false);
      setCurrentTime(0);
    };

    utterance.onerror = () => {
      if (speechIntervalRef.current) clearInterval(speechIntervalRef.current);
      setIsPlaying(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Play / Pause Toggle
  const handleTogglePlay = () => {
    if (!audioData) {
      generateExplanation(true);
      return;
    }

    if (isPlaying) {
      if (playbackEngine === 'gemini' && audioRef.current) {
        audioRef.current.pause();
      } else if (window.speechSynthesis) {
        window.speechSynthesis.pause();
      }
      setIsPlaying(false);
    } else {
      if (playbackEngine === 'gemini' && audioRef.current && audioData.audioUrl) {
        audioRef.current.playbackRate = playbackSpeed;
        audioRef.current.play();
        setIsPlaying(true);
      } else if (audioData.script) {
        const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === selectedLanguage);
        playWebSpeech(audioData.script, langObj?.speechCode || 'en-US');
      }
    }
  };

  const handleReplay = () => {
    if (!audioData) return;
    stopAllPlayback();
    if (playbackEngine === 'gemini' && audioData.audioUrl) {
      playGeminiAudio(audioData.audioUrl);
    } else if (audioData.script) {
      const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === selectedLanguage);
      playWebSpeech(audioData.script, langObj?.speechCode || 'en-US');
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (playbackEngine === 'gemini' && audioRef.current && duration > 0) {
      audioRef.current.currentTime = val;
    }
  };

  const handleSkip = (delta: number) => {
    if (playbackEngine === 'gemini' && audioRef.current && duration > 0) {
      const next = Math.max(0, Math.min(duration, audioRef.current.currentTime + delta));
      audioRef.current.currentTime = next;
      setCurrentTime(next);
    }
  };

  const handleDownloadAudio = () => {
    if (!audioData?.audioUrl) return;
    const a = document.createElement('a');
    a.href = audioData.audioUrl;
    a.download = `SatQuery_${scene1.name.replace(/\s+/g, '_')}_${selectedLanguage}_${complexity}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (audioRef.current) {
      audioRef.current.muted = nextMute;
    }
  };

  const handleCopyScript = () => {
    if (!audioData?.script) return;
    navigator.clipboard.writeText(audioData.script);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const currentLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === selectedLanguage) || SUPPORTED_LANGUAGES[0];

  return (
    <div
      id="audio-explanation-card"
      className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-400">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Audio Explanation of Result</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                AI Voice Synthesis
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Listen to the satellite findings in your preferred language and chosen level of detail.
            </p>
          </div>
        </div>

        {/* Quick Language & Jargon Status Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800/90 text-slate-300 text-xs border border-slate-700">
            <span>{currentLangObj.flag}</span>
            <span className="font-medium">{currentLangObj.nativeName}</span>
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border ${
              complexity === 'simple'
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
            }`}
          >
            {complexity === 'simple' ? (
              <>
                <BookOpen className="w-3 h-3" />
                Simple (No Jargon)
              </>
            ) : (
              <>
                <Microscope className="w-3 h-3" />
                Technical (With Jargon)
              </>
            )}
          </span>
        </div>
      </div>

      {/* Control Panel: Language Selector & Jargon / Style Option */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
        {/* Language Selection */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
            <Globe2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Explanation Language</span>
          </label>
          <div className="relative">
            <select
              id="audio-language-select"
              value={selectedLanguage}
              onChange={(e) => {
                setSelectedLanguage(e.target.value);
                setAudioData(null);
                stopAllPlayback();
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer appearance-none pr-8"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name} ({lang.nativeName})
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
              <Languages className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Translates and speaks the explanation natively in {currentLangObj.name}.
          </p>
        </div>

        {/* Complexity / Jargon Level Toggle */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span>Explanation Style & Complexity</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              id="complexity-simple-btn"
              onClick={() => {
                setComplexity('simple');
                setAudioData(null);
                stopAllPlayback();
              }}
              className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition cursor-pointer ${
                complexity === 'simple'
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-1.5 w-full">
                <BookOpen
                  className={`w-3.5 h-3.5 ${
                    complexity === 'simple' ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                />
                <span className="text-xs font-semibold">Very Simple</span>
                {complexity === 'simple' && (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 ml-auto" />
                )}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                Easy words, no jargon
              </span>
            </button>

            <button
              type="button"
              id="complexity-technical-btn"
              onClick={() => {
                setComplexity('technical');
                setAudioData(null);
                stopAllPlayback();
              }}
              className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition cursor-pointer ${
                complexity === 'technical'
                  ? 'bg-indigo-500/15 border-indigo-500/50 text-white shadow-sm'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-1.5 w-full">
                <Microscope
                  className={`w-3.5 h-3.5 ${
                    complexity === 'technical' ? 'text-indigo-400' : 'text-slate-400'
                  }`}
                />
                <span className="text-xs font-semibold">With Jargon</span>
                {complexity === 'technical' && (
                  <CheckCircle2 className="w-3 h-3 text-indigo-400 ml-auto" />
                )}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                Spectral & remote sensing
              </span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            {complexity === 'simple'
              ? 'Plain conversational language describing water, greenery, and buildings in intuitive terms.'
              : 'Full scientific briefing with NDVI/NDWI thresholds, radiometric backscatter, and spatial metrics.'}
          </p>
        </div>
      </div>

      {/* Voice, Speed & Playback Preferences */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-t border-slate-800/60 pt-3">
        {/* Voice Selector */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-xs">AI Voice:</span>
          <div className="flex items-center gap-1">
            {GEMINI_VOICES.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setSelectedVoice(v.id);
                  if (audioData) {
                    setAudioData(null);
                    stopAllPlayback();
                  }
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  selectedVoice === v.id
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title={v.label}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>

        {/* Speed Selector */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-xs">Speed:</span>
          <div className="flex items-center gap-1">
            {[0.8, 1.0, 1.25, 1.5].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  playbackSpeed === spd
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Audio Player Bar & Equalizer */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Play / Pause / Replay Buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              id="audio-explanation-play-btn"
              onClick={handleTogglePlay}
              disabled={isGenerating || !result}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs shadow-md transition cursor-pointer ${
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold'
                  : 'bg-violet-600 hover:bg-violet-500 text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isGenerating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Generating Audio...</span>
                </>
              ) : isPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  <span>Pause Explanation</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                  <span>
                    {audioData ? 'Play Explanation' : 'Generate & Listen'}
                  </span>
                </>
              )}
            </button>

            {audioData && (
              <>
                <button
                  type="button"
                  onClick={() => handleSkip(-5)}
                  disabled={isGenerating || duration === 0}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                  title="Rewind 5 seconds"
                >
                  <Rewind className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => handleSkip(5)}
                  disabled={isGenerating || duration === 0}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                  title="Forward 5 seconds"
                >
                  <FastForward className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleReplay}
                  disabled={isGenerating}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                  title="Restart from beginning"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </>
            )}

            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5">
              <button
                type="button"
                onClick={handleToggleMute}
                className="text-slate-400 hover:text-slate-200 transition cursor-pointer"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-4 h-4 text-slate-300" />
                ) : (
                  <Volume2 className="w-4 h-4 text-slate-300" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setVolume(val);
                  if (isMuted && val > 0) setIsMuted(false);
                }}
                className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                title={`Volume: ${Math.round(volume * 100)}%`}
              />
            </div>

            {audioData?.audioUrl && (
              <button
                type="button"
                onClick={handleDownloadAudio}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition cursor-pointer shadow-sm"
                title="Download spoken briefing (.wav)"
              >
                <Download className="w-3.5 h-3.5 text-violet-400" />
                <span className="hidden md:inline">Download WAV</span>
              </button>
            )}
          </div>

          {/* Equalizer Visualizer */}
          <div className="flex items-center gap-3">
            <div className="flex items-end gap-1 h-6 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800">
              {[40, 75, 100, 60, 85, 45, 90, 65, 35, 80, 50, 95].map((h, i) => (
                <span
                  key={i}
                  className={`w-1 rounded-full transition-all duration-150 ${
                    isPlaying
                      ? 'bg-gradient-to-t from-violet-500 to-emerald-400 animate-pulse'
                      : 'bg-slate-700'
                  }`}
                  style={{
                    height: isPlaying ? `${Math.max(20, (h * (Math.sin(currentTime * 4 + i) + 1.2)) / 2.2)}%` : '20%',
                  }}
                />
              ))}
            </div>

            {/* Time display */}
            <span className="font-mono text-xs text-slate-400 min-w-[70px] text-right">
              {formatTime(currentTime)} / {formatTime(duration || 0)}
            </span>
          </div>
        </div>

        {/* Progress Bar / Scrubber */}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="0"
            max={duration || 1}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            disabled={!audioData || duration === 0}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500 disabled:opacity-40"
          />
        </div>

        {/* Status / Model Info */}
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Radio
              className={`w-3 h-3 ${
                isPlaying ? 'text-emerald-400 animate-ping' : 'text-slate-500'
              }`}
            />
            <span>
              {isGenerating
                ? `Synthesizing ${complexity === 'simple' ? 'simple words' : 'technical jargon'} in ${currentLangObj.name}...`
                : isPlaying
                ? `Playing in ${currentLangObj.name} (${complexity === 'simple' ? 'Simple, No Jargon' : 'Technical Remote Sensing'})`
                : audioData
                ? `Ready to play in ${currentLangObj.name}`
                : 'Click to generate spoken audio summary'}
            </span>
          </div>

          {audioData && (
            <span className="text-slate-500">
              {audioData.audioUrl
                ? 'High-Fidelity AI Voice · gemini-3.1-flash-tts'
                : 'Browser Speech Engine · Web Speech API'}
            </span>
          )}
        </div>
      </div>

      {/* Spoken Script & Transcript */}
      {audioData?.script && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
              <span>Spoken Transcript ({currentLangObj.nativeName})</span>
            </div>
            <button
              type="button"
              onClick={handleCopyScript}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              {hasCopied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy Script</span>
                </>
              )}
            </button>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200 leading-relaxed font-sans select-text">
            {audioData.script}
          </div>
        </div>
      )}
    </div>
  );
};
