import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Volume2,
  VolumeX,
  Sparkles,
  Radio,
  Sliders,
  Globe2,
  RotateCcw,
  MessageSquare,
  Zap,
  Info,
  Layers,
  ChevronDown,
  ChevronUp,
  Minimize2,
  Maximize2,
  Download,
  Keyboard,
} from 'lucide-react';
import { AgentResult, RasterScene, ExplanationComplexity } from '../types';

interface LiveVoiceConversationProps {
  result: AgentResult | null;
  scene1: RasterScene;
  scene2: RasterScene | null;
  query: string;
}

interface ChatTranscript {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: string;
}

const LIVE_VOICES = [
  { id: 'Zephyr', name: 'Zephyr', label: 'Smooth & Balanced' },
  { id: 'Puck', name: 'Puck', label: 'Crisp & Lively' },
  { id: 'Kore', name: 'Kore', label: 'Warm & Natural' },
  { id: 'Fenrir', name: 'Fenrir', label: 'Deep & Authoritative' },
  { id: 'Charon', name: 'Charon', label: 'Gentle & Calm' },
];

const SUGGESTED_VOICE_PROMPTS = [
  'What is the percentage of water and vegetation in this image?',
  'Explain what the NDVI score means for the crops here.',
  'How does Scene 1 compare to Scene 2 in terms of changes?',
  'Are there any signs of flooding or urban expansion?',
];

export const LiveVoiceConversation: React.FC<LiveVoiceConversationProps> = ({
  result,
  scene1,
  scene2,
  query,
}) => {
  // Connection & Session State
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isOutputMuted, setIsOutputMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('Ready to connect');
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [micVolume, setMicVolume] = useState<number>(0);
  const [transcripts, setTranscripts] = useState<ChatTranscript[]>([]);
  const [showFullTranscript, setShowFullTranscript] = useState(true);
  const [isDocked, setIsDocked] = useState(false);

  // Configuration
  const [selectedVoice, setSelectedVoice] = useState<string>('Zephyr');
  const [complexity, setComplexity] = useState<ExplanationComplexity>('simple');
  const [languageName, setLanguageName] = useState<string>('English');

  // Audio References & Optimization Flags
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentFramesCountRef = useRef<number>(0);
  const audioPlaybackStateRef = useRef<{
    nextStartTime: number;
    activeSources: AudioBufferSourceNode[];
  }>({
    nextStartTime: 0,
    activeSources: [],
  });

  const currentModelTranscriptRef = useRef<string>('');
  const currentUserTranscriptRef = useRef<string>('');
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Spacebar keyboard shortcut for Quick Mute / Push-to-Talk
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }
      if (e.code === 'Space' && isConnected) {
        e.preventDefault();
        setIsMicMuted((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnected]);

  // Auto-scroll transcript on update
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcripts, isModelSpeaking]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      endVoiceSession();
    };
  }, []);

  // Update ongoing session when scene context changes
  useEffect(() => {
    if (isConnected && wsRef.current?.readyState === WebSocket.OPEN && result) {
      wsRef.current.send(
        JSON.stringify({
          type: 'context_update',
          context: {
            query,
            scene1Name: scene1.name,
            coverage: result.coverage || [],
            indices: result.indices || {},
            trendSummary: (result as any).trendSummary || null,
          },
        })
      );
    }
  }, [result, scene1, scene2, query, isConnected]);

  // Decode 16-bit linear PCM little-endian to Float32Array
  const base64ToFloat32Array = (base64: string): Float32Array => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 32768 : 32767);
    }
    return float32;
  };

  // Schedule audio chunks precisely at 24kHz for gapless streaming playback
  const playModelAudioChunk = (base64: string) => {
    if (isOutputMuted) return;

    if (!outputAudioCtxRef.current) {
      outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
    }

    const audioCtx = outputAudioCtxRef.current;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const float32 = base64ToFloat32Array(base64);
    const buffer = audioCtx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);

    const state = audioPlaybackStateRef.current;
    const now = audioCtx.currentTime;
    if (state.nextStartTime < now) {
      state.nextStartTime = now;
    }

    source.start(state.nextStartTime);
    state.nextStartTime += buffer.duration;
    state.activeSources.push(source);
    setIsModelSpeaking(true);

    source.onended = () => {
      const idx = state.activeSources.indexOf(source);
      if (idx !== -1) {
        state.activeSources.splice(idx, 1);
      }
      if (state.activeSources.length === 0) {
        setIsModelSpeaking(false);
      }
    };
  };

  // Immediate interruption handling: stop audio playback, clear buffer queue
  const handleModelInterrupted = () => {
    const state = audioPlaybackStateRef.current;
    for (const src of state.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    }
    state.activeSources = [];
    state.nextStartTime = 0;
    setIsModelSpeaking(false);

    // Finalize any in-progress transcript
    if (currentModelTranscriptRef.current) {
      setTranscripts((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          role: 'model',
          text: currentModelTranscriptRef.current + ' [interrupted]',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      currentModelTranscriptRef.current = '';
    }
  };

  // Start live voice session
  const startVoiceSession = async () => {
    try {
      setIsConnecting(true);
      setConnectionStatus('Accessing microphone...');

      // 1. Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // 2. Setup 16kHz audio input context
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });
      inputAudioCtxRef.current = inputCtx;

      const source = inputCtx.createMediaStreamSource(stream);
      // ScriptProcessor with 4096 buffer length
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // 3. Connect to server WebSocket at /api/live
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live`;
      setConnectionStatus('Connecting to Gemini 3.8 Live API...');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('Initializing Gemini Live session...');
        // Send init message with scene context
        ws.send(
          JSON.stringify({
            type: 'init',
            voice: selectedVoice,
            complexity,
            languageName,
            sendGreeting: true,
            sceneContext: {
              query,
              scene1Name: scene1.name,
              coverage: result?.coverage || [],
              indices: result?.indices || {},
              trendSummary: (result as any)?.trendSummary || null,
            },
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'connected') {
            setIsConnected(true);
            setIsConnecting(false);
            setConnectionStatus(`Connected to Gemini 3.8 Live (${msg.voice})`);
            setTranscripts((prev) => [
              ...prev,
              {
                id: String(Date.now()),
                role: 'system',
                text: `Live voice conversation connected with Gemini 3.8 Live. Voice: ${selectedVoice} · Style: ${
                  complexity === 'simple' ? 'Simple' : 'Technical'
                }.`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              },
            ]);
          } else if (msg.type === 'audio') {
            playModelAudioChunk(msg.audio);
          } else if (msg.type === 'output_transcript') {
            currentModelTranscriptRef.current += msg.text;
            // Update latest transcript item or append
            setTranscripts((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'model') {
                return [
                  ...prev.slice(0, -1),
                  { ...last, text: currentModelTranscriptRef.current },
                ];
              } else {
                return [
                  ...prev,
                  {
                    id: String(Date.now()),
                    role: 'model',
                    text: currentModelTranscriptRef.current,
                    timestamp: new Date().toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  },
                ];
              }
            });
          } else if (msg.type === 'input_transcript') {
            currentUserTranscriptRef.current += msg.text;
            setTranscripts((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'user') {
                return [
                  ...prev.slice(0, -1),
                  { ...last, text: currentUserTranscriptRef.current },
                ];
              } else {
                return [
                  ...prev,
                  {
                    id: String(Date.now()),
                    role: 'user',
                    text: currentUserTranscriptRef.current,
                    timestamp: new Date().toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  },
                ];
              }
            });
          } else if (msg.type === 'interrupted') {
            handleModelInterrupted();
          } else if (msg.type === 'turn_complete') {
            currentModelTranscriptRef.current = '';
            currentUserTranscriptRef.current = '';
          } else if (msg.type === 'error') {
            setConnectionStatus(`Error: ${msg.error}`);
            setTranscripts((prev) => [
              ...prev,
              {
                id: String(Date.now()),
                role: 'system',
                text: `Live API Notice: ${msg.error}`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              },
            ]);
          } else if (msg.type === 'closed') {
            setConnectionStatus('Live session closed');
            setIsConnected(false);
          }
        } catch (err) {
          console.error('WS message handling error:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket connection error:', err);
        setConnectionStatus('WebSocket error occurred');
        setIsConnecting(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        setConnectionStatus('Session disconnected');
      };

      // 4. Hook microphone capture processor with VAD Silence Gate
      processor.onaudioprocess = (e) => {
        if (isMicMuted || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          setMicVolume(0);
          return;
        }

        const inputBuffer = e.inputBuffer.getChannelData(0);

        // Calculate input volume for visualizer
        let sum = 0;
        for (let i = 0; i < inputBuffer.length; i++) {
          sum += inputBuffer[i] * inputBuffer[i];
        }
        const rms = Math.sqrt(sum / inputBuffer.length);
        const vol = Math.min(100, Math.round(rms * 400));
        setMicVolume(vol);

        // VAD / Silence suppression gate:
        // If microphone volume is below 2.5 (ambient silence / room fan), wait 3 frames then suppress sending
        // This cuts WebSocket transmission bandwidth by over 70% during pauses and avoids false interruptions!
        if (vol < 2.5) {
          silentFramesCountRef.current += 1;
          if (silentFramesCountRef.current > 3) {
            return;
          }
        } else {
          silentFramesCountRef.current = 0;
        }

        // Convert Float32 to 16-bit PCM little endian
        const pcm16 = new Int16Array(inputBuffer.length);
        for (let i = 0; i < inputBuffer.length; i++) {
          const s = Math.max(-1, Math.min(1, inputBuffer[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Convert Int16Array to Base64
        const bytes = new Uint8Array(pcm16.buffer);
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        wsRef.current.send(
          JSON.stringify({
            type: 'audio',
            audio: base64,
          })
        );
      };

      source.connect(processor);
      // Dummy destination to keep audio processing pipeline active without echoing mic to speakers
      const dummyGain = inputCtx.createGain();
      dummyGain.gain.value = 0;
      processor.connect(dummyGain);
      dummyGain.connect(inputCtx.destination);
    } catch (err: any) {
      console.error('Failed to start voice session:', err);
      setIsConnecting(false);
      setIsConnected(false);
      setConnectionStatus(`Microphone error: ${err.message || 'Access denied'}`);
      alert(`Could not start live voice session: ${err.message || 'Microphone access denied'}`);
    }
  };

  // End live voice session
  const endVoiceSession = () => {
    handleModelInterrupted();

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }

    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setIsModelSpeaking(false);
    setMicVolume(0);
    setConnectionStatus('Session ended');
  };

  // Send a quick prompt text into the live conversation
  const handleSendPromptText = (prompt: string) => {
    if (!isConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      // Connect first and send prompt
      startVoiceSession().then(() => {
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'text', text: prompt }));
            setTranscripts((prev) => [
              ...prev,
              {
                id: String(Date.now()),
                role: 'user',
                text: prompt,
                timestamp: new Date().toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              },
            ]);
          }
        }, 1200);
      });
      return;
    }

    wsRef.current.send(JSON.stringify({ type: 'text', text: prompt }));
    setTranscripts((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        role: 'user',
        text: prompt,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  // Export full transcript as a downloadable text log
  const handleExportTranscript = () => {
    if (transcripts.length === 0) return;
    const content = [
      `=== SatQuery Live Voice Conversation Log ===`,
      `Date: ${new Date().toLocaleString()}`,
      `Scene: ${scene1.name}`,
      `Voice: ${selectedVoice} | Complexity: ${complexity} | Language: ${languageName}`,
      `--------------------------------------------------`,
      ...transcripts.map((t) => `[${t.timestamp}] ${t.role.toUpperCase()}: ${t.text}`),
      `--------------------------------------------------`,
      `End of Transcript`,
    ].join('\n\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SatQuery_Live_Transcript_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Render Compact Floating Dock Mode if minimized
  if (isDocked) {
    return (
      <div
        id="live-voice-floating-dock"
        className="fixed bottom-5 right-5 z-50 w-80 md:w-96 rounded-2xl bg-slate-950/95 backdrop-blur-md border border-indigo-500/50 shadow-2xl p-3.5 space-y-2.5 text-xs animate-in fade-in slide-in-from-bottom-5 duration-200"
      >
        {/* Floating Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <span
                className={`w-2.5 h-2.5 rounded-full block ${
                  isConnected ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
              />
              {isConnected && (
                <span className="w-2.5 h-2.5 rounded-full absolute inset-0 bg-emerald-400 animate-ping opacity-75" />
              )}
            </div>
            <span className="font-semibold text-white">Live Voice Call</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
              {selectedVoice}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsDocked(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Expand to Full View"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Audio & Waveform */}
        <div className="flex items-center justify-between gap-2 bg-slate-900/80 border border-slate-800/80 rounded-xl px-3 py-2">
          <span className="text-[11px] text-slate-300">
            {isModelSpeaking ? 'Gemini Speaking...' : isConnected ? 'Listening to You...' : 'Idle'}
          </span>

          {/* Mini Waveform */}
          <div className="flex items-center gap-0.5 h-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <span
                key={n}
                className={`w-1 rounded-full transition-all duration-150 ${
                  isModelSpeaking
                    ? 'bg-indigo-400 animate-pulse'
                    : isConnected && micVolume > 5
                    ? 'bg-emerald-400'
                    : 'bg-slate-700'
                }`}
                style={{
                  height: isModelSpeaking
                    ? `${20 + (n % 4) * 25}%`
                    : isConnected && micVolume > 5
                    ? `${Math.min(100, 20 + micVolume * 0.8)}%`
                    : '25%',
                }}
              />
            ))}
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsMicMuted(!isMicMuted)}
              disabled={!isConnected}
              className={`p-2 rounded-xl border text-xs transition cursor-pointer ${
                isMicMuted
                  ? 'bg-red-500/20 border-red-500/50 text-red-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
              title={isMicMuted ? 'Unmute Mic (Spacebar)' : 'Mute Mic (Spacebar)'}
            >
              {isMicMuted ? (
                <MicOff className="w-3.5 h-3.5" />
              ) : (
                <Mic className="w-3.5 h-3.5 text-emerald-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsOutputMuted(!isOutputMuted)}
              className={`p-2 rounded-xl border text-xs transition cursor-pointer ${
                isOutputMuted
                  ? 'bg-red-500/20 border-red-500/50 text-red-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
              title={isOutputMuted ? 'Unmute Gemini' : 'Mute Gemini'}
            >
              {isOutputMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>

            {isModelSpeaking && (
              <button
                type="button"
                onClick={handleModelInterrupted}
                className="px-2 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-medium transition cursor-pointer"
              >
                Interrupt
              </button>
            )}
          </div>

          <div>
            {!isConnected ? (
              <button
                type="button"
                onClick={startVoiceSession}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow transition cursor-pointer"
              >
                <PhoneCall className="w-3 h-3" />
                <span>Call</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={endVoiceSession}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-xs shadow transition cursor-pointer"
              >
                <PhoneOff className="w-3 h-3" />
                <span>End</span>
              </button>
            )}
          </div>
        </div>

        {/* Latest transcript snippet */}
        {transcripts.length > 0 && (
          <div className="bg-slate-900/90 rounded-lg p-2 border border-slate-800/80 text-[11px] text-slate-300 line-clamp-2">
            <span className="font-semibold text-slate-400 mr-1">
              {transcripts[transcripts.length - 1].role === 'user' ? 'You:' : 'Gemini:'}
            </span>
            {transcripts[transcripts.length - 1].text}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      id="live-voice-conversation-card"
      className="bg-slate-900/95 border border-indigo-500/40 rounded-xl p-5 shadow-lg space-y-5 relative overflow-hidden"
    >
      {/* Background visual glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none -z-10"></div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl border transition ${
              isConnected
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-sm'
                : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
            }`}
          >
            <Radio className={`w-5 h-5 ${isConnected ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                Live Voice Conversation
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-indigo-500/20 to-violet-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-indigo-300" />
                gemini-3.8-live
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Talk directly with Gemini Live in real-time. Discuss satellite imagery, ask questions,
              and interrupt naturally.
            </p>
          </div>
        </div>

        {/* Live Call & Dock Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsDocked(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium border border-slate-700 transition cursor-pointer"
            title="Dock to bottom right corner so you can explore other panels while speaking"
          >
            <Minimize2 className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Mini Dock</span>
          </button>

          {!isConnected ? (
            <button
              type="button"
              id="start-live-voice-call-btn"
              onClick={startVoiceSession}
              disabled={isConnecting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-md transition cursor-pointer disabled:opacity-50"
            >
              {isConnecting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <PhoneCall className="w-4 h-4" />
                  <span>Start Live Call</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              id="end-live-voice-call-btn"
              onClick={endVoiceSession}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md transition cursor-pointer"
            >
              <PhoneOff className="w-4 h-4" />
              <span>End Call</span>
            </button>
          )}
        </div>
      </div>

      {/* Voice & Complexity Configuration Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 text-xs">
        {/* Voice Selection */}
        <div className="space-y-1">
          <span className="text-slate-400 font-medium flex items-center gap-1">
            <Volume2 className="w-3.5 h-3.5 text-slate-400" />
            Live Voice
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {LIVE_VOICES.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={isConnected}
                onClick={() => setSelectedVoice(v.id)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  selectedVoice === v.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                } disabled:cursor-not-allowed`}
                title={v.label}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>

        {/* Complexity Mode */}
        <div className="space-y-1">
          <span className="text-slate-400 font-medium flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            Detail Level
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={isConnected}
              onClick={() => setComplexity('simple')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                complexity === 'simple'
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
              } disabled:cursor-not-allowed`}
            >
              Simple (Everyday)
            </button>
            <button
              type="button"
              disabled={isConnected}
              onClick={() => setComplexity('technical')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                complexity === 'technical'
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
              } disabled:cursor-not-allowed`}
            >
              Technical Jargon
            </button>
          </div>
        </div>

        {/* Language Selection */}
        <div className="space-y-1">
          <span className="text-slate-400 font-medium flex items-center gap-1">
            <Globe2 className="w-3.5 h-3.5 text-slate-400" />
            Spoken Language
          </span>
          <select
            value={languageName}
            disabled={isConnected}
            onChange={(e) => setLanguageName(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
          >
            <option value="English">English</option>
            <option value="Spanish">Español (Spanish)</option>
            <option value="French">Français (French)</option>
            <option value="German">Deutsch (German)</option>
            <option value="Hindi">हिन्दी (Hindi)</option>
            <option value="Chinese">中文 (Chinese)</option>
            <option value="Japanese">日本語 (Japanese)</option>
            <option value="Portuguese">Português (Portuguese)</option>
            <option value="Italian">Italiano (Italian)</option>
            <option value="Arabic">العربية (Arabic)</option>
          </select>
        </div>
      </div>

      {/* Active Call Live Control Console */}
      {isConnected && (
        <div className="bg-slate-950/90 border border-indigo-500/30 rounded-xl p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Status Indicator */}
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div>
                <span className="text-xs font-semibold text-slate-200 block">
                  {isModelSpeaking ? 'Gemini is speaking...' : 'Listening to you...'}
                </span>
                <span className="text-[11px] text-slate-400">{connectionStatus}</span>
              </div>
            </div>

            {/* Quick In-Call Controls: Mute Mic, Mute Speaker, Interrupt */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMicMuted(!isMicMuted)}
                className={`p-2 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  isMicMuted
                    ? 'bg-red-500/20 text-red-300 border-red-500/40'
                    : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                }`}
                title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              >
                {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
                <span>{isMicMuted ? 'Mic Muted' : 'Mic Live'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsOutputMuted(!isOutputMuted)}
                className={`p-2 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  isOutputMuted
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                }`}
                title={isOutputMuted ? 'Unmute Audio Playback' : 'Mute Audio Playback'}
              >
                {isOutputMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{isOutputMuted ? 'Muted' : 'Audio On'}</span>
              </button>

              {isModelSpeaking && (
                <button
                  type="button"
                  onClick={handleModelInterrupted}
                  className="px-2.5 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-xs font-medium transition cursor-pointer flex items-center gap-1"
                  title="Interrupt Gemini and speak immediately"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Interrupt</span>
                </button>
              )}
            </div>
          </div>

          {/* Dual Dynamic Waveform Visualizer (Mic + Gemini Voice) */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {/* Mic Input Meter */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Mic className="w-3 h-3 text-emerald-400" />
                  Your Microphone
                </span>
                <span className="font-mono text-[10px]">{isMicMuted ? 'MUTED' : `${micVolume}%`}</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-75"
                  style={{ width: `${isMicMuted ? 0 : micVolume}%` }}
                ></div>
              </div>
            </div>

            {/* AI Speech Output Meter */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Volume2 className="w-3 h-3 text-indigo-400" />
                  Gemini Live Output
                </span>
                <span className="font-mono text-[10px]">
                  {isModelSpeaking ? '24kHz AUDIO' : 'IDLE'}
                </span>
              </div>
              <div className="flex items-center gap-0.5 h-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                  <div
                    key={n}
                    className={`flex-1 rounded-full h-full transition-all duration-150 ${
                      isModelSpeaking
                        ? 'bg-gradient-to-r from-indigo-500 to-violet-400 animate-pulse'
                        : 'bg-slate-800'
                    }`}
                    style={{
                      opacity: isModelSpeaking ? 0.3 + (n % 4) * 0.2 : 0.4,
                    }}
                  ></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suggested Spoken Queries */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
          <Zap className="w-3 h-3 text-amber-400" />
          Suggested Voice Questions:
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {SUGGESTED_VOICE_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendPromptText(prompt)}
              className="px-2.5 py-1 text-xs rounded-lg bg-slate-950/80 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition cursor-pointer text-left"
            >
              "{prompt}"
            </button>
          ))}
        </div>
      </div>

      {/* Real-time Conversation Transcript */}
      <div className="space-y-2 border-t border-slate-800/80 pt-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowFullTranscript(!showFullTranscript)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
            <span>Real-Time Voice Transcript</span>
            <span className="text-[11px] text-slate-500 font-normal">
              ({transcripts.length} exchanges)
            </span>
            {showFullTranscript ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1 text-[11px] text-slate-500 mr-1">
              <Keyboard className="w-3 h-3 text-slate-400" />
              <span>Space to mute/unmute</span>
            </span>

            {transcripts.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportTranscript}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 transition cursor-pointer flex items-center gap-1 bg-indigo-500/10 hover:bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30"
                  title="Download transcript log as text"
                >
                  <Download className="w-3 h-3" />
                  <span>Export</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTranscripts([])}
                  className="text-[11px] text-slate-500 hover:text-slate-300 transition cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </>
            )}
          </div>
        </div>

        {showFullTranscript && (
          <div className="max-h-56 overflow-y-auto space-y-2.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
            {transcripts.length === 0 ? (
              <div className="text-center py-6 text-slate-500 space-y-1">
                <Radio className="w-6 h-6 mx-auto text-slate-600 stroke-1" />
                <p>No voice exchanges yet.</p>
                <p className="text-[11px] text-slate-600">
                  Click "Start Live Call" or pick a suggested question to converse with Gemini 3.8 Live.
                </p>
              </div>
            ) : (
              transcripts.map((t) => (
                <div
                  key={t.id}
                  className={`flex flex-col ${
                    t.role === 'user'
                      ? 'items-end'
                      : t.role === 'model'
                      ? 'items-start'
                      : 'items-center'
                  }`}
                >
                  {t.role === 'system' ? (
                    <span className="text-[11px] text-slate-500 italic bg-slate-900/60 px-2 py-0.5 rounded-full border border-slate-800">
                      {t.text}
                    </span>
                  ) : (
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                        t.role === 'user'
                          ? 'bg-indigo-600/25 border border-indigo-500/40 text-indigo-100 rounded-tr-none'
                          : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5 text-[10px] text-slate-400 font-semibold">
                        <span>{t.role === 'user' ? 'You' : 'Gemini 3.8 Live'}</span>
                        <span className="font-normal opacity-70">{t.timestamp}</span>
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap">{t.text}</p>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};
