import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ImagePanel } from './components/ImagePanel';
import { Controls } from './components/Controls';
import { VisualEvidence } from './components/VisualEvidence';
import { AudioExplanation } from './components/AudioExplanation';
import { LiveVoiceConversation } from './components/LiveVoiceConversation';
import { FindingsExport } from './components/FindingsExport';
import { ExecutionTrace } from './components/ExecutionTrace';
import { AgentResult, OperationalTemplate, RasterScene } from './types';
import { generateDemoScene } from './satquery/demo';
import { runAgent } from './satquery/agent';

export const App: React.FC = () => {
  const [template, setTemplate] = useState<OperationalTemplate>('landcover');
  const [query, setQuery] = useState('Segment water, vegetation, and built-up coverage in this image.');
  const [isSar, setIsSar] = useState(false);
  const [opacity, setOpacity] = useState(0.5);

  const [sample1Key, setSample1Key] = useState<string>('water');
  const [sample2Key, setSample2Key] = useState<string>('none');

  const [scene1, setScene1] = useState<RasterScene>(() => generateDemoScene('water'));
  const [scene2, setScene2] = useState<RasterScene | null>(null);

  const [result, setResult] = useState<AgentResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [groundingType, setGroundingType] = useState<'none' | 'search' | 'maps'>('none');
  const [isGroundingLoading, setIsGroundingLoading] = useState(false);

  // Helper to fetch grounding from server
  const fetchGrounding = async (
    q: string,
    type: 'search' | 'maps',
    location?: string
  ) => {
    try {
      const res = await fetch('/api/grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, type, location }),
      });
      const data = await res.json();
      return data;
    } catch (e) {
      console.error('Failed to fetch grounding:', e);
      return null;
    }
  };

  const handleManualGrounding = async () => {
    if (groundingType === 'none') return;
    setIsGroundingLoading(true);
    try {
      const gData = await fetchGrounding(
        query,
        groundingType,
        scene1.crs || 'EPSG:32633'
      );
      if (gData && result) {
        setResult({
          ...result,
          grounding: gData,
        });
      }
    } finally {
      setIsGroundingLoading(false);
    }
  };

  // Auto-run on first mount
  useEffect(() => {
    executePipeline(scene1, scene2, isSar, query, template, groundingType);
  }, []);

  const executePipeline = async (
    s1: RasterScene,
    s2: RasterScene | null,
    sarPair: boolean,
    q: string,
    tmpl: OperationalTemplate,
    activeGrounding: 'none' | 'search' | 'maps' = groundingType
  ) => {
    setIsLoading(true);
    try {
      const res = await runAgent(q, s1, s2, sarPair, tmpl);

      // If Grounding is active, retrieve real-world Search or Maps context
      if (activeGrounding !== 'none') {
        const gData = await fetchGrounding(
          q,
          activeGrounding,
          s1.crs || 'EPSG:32633'
        );
        if (gData) {
          res.grounding = gData;
        }
      }

      setResult(res);
    } catch (err) {
      console.error('Pipeline execution error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRun = () => {
    executePipeline(scene1, scene2, isSar, query, template, groundingType);
  };

  const handleSelectPreset = (presetName: string) => {
    if (presetName === 'Flood Risk') {
      const s1 = generateDemoScene('water');
      const s2 = generateDemoScene('flooded');
      setScene1(s1);
      setScene2(s2);
      setSample1Key('water');
      setSample2Key('flooded');
      setTemplate('disaster');
      setIsSar(false);
      const newQuery = 'Map flood extent, water coverage, and affected area in hectares.';
      setQuery(newQuery);
      executePipeline(s1, s2, false, newQuery, 'disaster');
    } else if (presetName === 'Land Cover') {
      const s1 = generateDemoScene('water');
      setScene1(s1);
      setScene2(null);
      setSample1Key('water');
      setSample2Key('none');
      setTemplate('landcover');
      setIsSar(false);
      const newQuery = 'Segment water, vegetation, and built-up areas and report coverage percentages.';
      setQuery(newQuery);
      executePipeline(s1, null, false, newQuery, 'landcover');
    } else if (presetName === 'Change Detection') {
      const s1 = generateDemoScene('forest');
      const s2 = generateDemoScene('cleared');
      setScene1(s1);
      setScene2(s2);
      setSample1Key('forest');
      setSample2Key('cleared');
      setTemplate('change');
      setIsSar(false);
      const newQuery = 'Classify construction, flooding, deforestation, and crop evolution between these two dates.';
      setQuery(newQuery);
      executePipeline(s1, s2, false, newQuery, 'change');
    } else if (presetName === 'Agriculture') {
      const s1 = generateDemoScene('forest');
      const s2 = generateDemoScene('cleared');
      setScene1(s1);
      setScene2(s2);
      setSample1Key('forest');
      setSample2Key('cleared');
      setTemplate('agriculture');
      setIsSar(false);
      const newQuery = 'Track NDVI anomalies and vegetation loss/gain between acquisitions.';
      setQuery(newQuery);
      executePipeline(s1, s2, false, newQuery, 'agriculture');
    } else if (presetName === 'Optical–SAR Fusion') {
      const s1 = generateDemoScene('urban');
      const s2 = generateDemoScene('sar');
      setScene1(s1);
      setScene2(s2);
      setSample1Key('urban');
      setSample2Key('sar');
      setTemplate('auto');
      setIsSar(true);
      const newQuery = 'Fuse optical and SAR streams to identify built-up and water-covered regions.';
      setQuery(newQuery);
      executePipeline(s1, s2, true, newQuery, 'auto');
    }
  };

  const handleSample1Select = (key: string) => {
    setSample1Key(key);
    const s = generateDemoScene(key as any);
    setScene1(s);
  };

  const handleSample2Select = (key: string) => {
    setSample2Key(key);
    if (key === 'none') {
      setScene2(null);
    } else {
      const s = generateDemoScene(key as any);
      setScene2(s);
    }
  };

  const handleLoadExample = (idx: number) => {
    if (idx === 0) {
      handleSelectPreset('Land Cover');
    } else if (idx === 1) {
      handleSelectPreset('Change Detection');
    } else if (idx === 2) {
      handleSelectPreset('Optical–SAR Fusion');
    } else if (idx === 3) {
      handleSelectPreset('Flood Risk');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header onSelectPreset={handleSelectPreset} activeTemplate={template} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Top Section: Imagery & Controls */}
        <div className="space-y-4">
          <ImagePanel
            scene1={scene1}
            scene2={scene2}
            onScene1Change={setScene1}
            onScene2Change={setScene2}
            isSar={isSar}
            onSarChange={setIsSar}
            sample1Key={sample1Key}
            sample2Key={sample2Key}
            onSample1Select={handleSample1Select}
            onSample2Select={handleSample2Select}
          />

          <Controls
            template={template}
            onTemplateChange={setTemplate}
            query={query}
            onQueryChange={setQuery}
            opacity={opacity}
            onOpacityChange={setOpacity}
            onRun={handleRun}
            isLoading={isLoading}
            onLoadExample={handleLoadExample}
            groundingType={groundingType}
            onGroundingTypeChange={setGroundingType}
            onFetchGrounding={handleManualGrounding}
            isGroundingLoading={isGroundingLoading}
          />
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          {/* Real-time Voice Conversation with Gemini 3.8 Live */}
          <LiveVoiceConversation
            result={result}
            scene1={scene1}
            scene2={scene2}
            query={query}
          />

          <VisualEvidence
            result={result}
            scene1={scene1}
            scene2={scene2}
            opacity={opacity}
            template={template}
          />

          {/* Audio Explanation with Language and Jargon/Simple Options */}
          {result && (
            <AudioExplanation
              result={result}
              scene1={scene1}
              scene2={scene2}
              query={query}
            />
          )}

          <FindingsExport
            result={result}
            scene1={scene1}
            scene2={scene2}
          />

          <ExecutionTrace trace={result?.trace || null} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 px-6 text-center text-xs text-slate-500">
        SatQuery AI — Remote-sensing vision-language assistant · Sentinel-2 MSI & Sentinel-1 SAR Analysis
      </footer>
    </div>
  );
};

export default App;
