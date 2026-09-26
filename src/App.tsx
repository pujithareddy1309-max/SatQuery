import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { GalaxyHero } from './components/GalaxyHero';
import { ImagePanel } from './components/ImagePanel';
import { Controls } from './components/Controls';
import { VisualEvidence } from './components/VisualEvidence';
import { AudioExplanation } from './components/AudioExplanation';
import { LiveVoiceConversation } from './components/LiveVoiceConversation';
import { FindingsExport } from './components/FindingsExport';
import { ExecutionTrace } from './components/ExecutionTrace';
import { AppTour } from './components/AppTour';
import { BatchProcessingModal } from './components/BatchProcessingModal';
import { BatchProcessingCard } from './components/BatchProcessingCard';
import { AgentResult, ExplanationComplexity, OperationalTemplate, RasterScene, LocationLockData } from './types';
import { generateDemoScene, generateBiTemporalLocationScenes } from './satquery/demo';
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
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [isGalaxyCollapsed, setIsGalaxyCollapsed] = useState(false);
  const [activeLocationLock, setActiveLocationLock] = useState<LocationLockData | null>(null);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [complexity, setComplexity] = useState<ExplanationComplexity>('simple');

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
    activeGrounding: 'none' | 'search' | 'maps' = groundingType,
    activeComplexity: ExplanationComplexity = complexity
  ) => {
    setIsLoading(true);
    try {
      const res = await runAgent(q, s1, s2, sarPair, tmpl, activeComplexity);

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
    executePipeline(scene1, scene2, isSar, query, template, groundingType, complexity);
  };

  const handleComplexityChange = (newComplexity: ExplanationComplexity) => {
    setComplexity(newComplexity);
    executePipeline(scene1, scene2, isSar, query, template, groundingType, newComplexity);
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

  // Handler for Location Lock and Bi-Temporal Change Detection execution
  const handleExecuteLocationBiTemporal = (
    loc: LocationLockData,
    t1Date: string,
    t2Date: string,
    layer: 'google-maps' | 'osiris-optical' | 'osiris-sar' | 'osiris-ndwi',
    targetTemplate: OperationalTemplate
  ) => {
    setActiveLocationLock(loc);
    const sarEnabled = layer === 'osiris-sar';
    setIsSar(sarEnabled);
    setTemplate(targetTemplate);

    // Generate co-registered bi-temporal scenes with realistic temporal delta
    const { scene1: s1, scene2: s2 } = generateBiTemporalLocationScenes(
      loc.lat,
      loc.lon,
      loc.formattedAddress,
      t1Date,
      t2Date,
      layer
    );

    setScene1(s1);
    setScene2(s2);
    setSample1Key('custom');
    setSample2Key('custom');

    const locQuery = `Bi-temporal change detection at ${loc.formattedAddress} (Coordinates: ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}, CRS: ${loc.crs}) between baseline ${t1Date} (T1) and comparison ${t2Date} (T2) using Google Maps / OSIRIS data layers.`;
    setQuery(locQuery);

    // Auto-switch grounding to Maps
    setGroundingType('maps');

    // Run remote sensing pipeline with newly locked scenes
    executePipeline(s1, s2, sarEnabled, locQuery, targetTemplate, 'maps');

    // Smooth scroll down to visual evidence
    setTimeout(() => {
      const el = document.getElementById('visual-evidence-container');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 400);
  };

  // Handler when inspecting a completed batch item in the main dashboard
  const handleInspectBatchItem = (
    s1: RasterScene,
    s2: RasterScene,
    batchQuery: string,
    batchTemplate: OperationalTemplate,
    locationName: string
  ) => {
    setScene1(s1);
    setScene2(s2);
    setQuery(batchQuery);
    setTemplate(batchTemplate);
    setSample1Key('custom');
    setSample2Key('custom');
    setIsSar(s2.isSar || false);

    // Run agent pipeline for this scene pair in main dashboard
    executePipeline(s1, s2, s2.isSar || false, batchQuery, batchTemplate, groundingType);

    // Smooth scroll down to visual evidence
    setTimeout(() => {
      const el = document.getElementById('visual-evidence-container');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 400);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Astra-Style 3D Three.js Galaxy Hero with Orbiting Earth & Starfield */}
      <GalaxyHero
        onSelectPreset={handleSelectPreset}
        onStartTour={() => {
          setIsGalaxyCollapsed(true);
          setIsTourOpen(true);
        }}
        isCollapsed={isGalaxyCollapsed}
        onToggleCollapse={() => {
          setIsGalaxyCollapsed((prev) => {
            const next = !prev;
            if (!next) {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            return next;
          });
        }}
      />

      <Header
        onSelectPreset={handleSelectPreset}
        activeTemplate={template}
        onStartTour={() => {
          setIsGalaxyCollapsed(true);
          setIsTourOpen(true);
        }}
        isGalaxyCollapsed={isGalaxyCollapsed}
        onToggleGalaxy={() => {
          setIsGalaxyCollapsed((prev) => {
            const next = !prev;
            if (!next) {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            return next;
          });
        }}
        onOpenBatchProcessing={() => setIsBatchModalOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8">
        {/* Two-Column Dashboard Layout: Left = Controls & Imagery, Right = Pinned AI Chatbox */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_460px] gap-6">
          {/* Left Column: Imagery, Controls, Results */}
          <div className="space-y-6 min-w-0">
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
              onOpenBatchProcessing={() => setIsBatchModalOpen(true)}
              onLocationLock={setActiveLocationLock}
              complexity={complexity}
              onComplexityChange={handleComplexityChange}
            />

            {/* Batch Coordinate Bi-Temporal Processing Card */}
            <BatchProcessingCard
              onInspectItemInDashboard={handleInspectBatchItem}
              onOpenModal={() => setIsBatchModalOpen(true)}
            />

            <VisualEvidence
              result={result}
              scene1={scene1}
              scene2={scene2}
              opacity={opacity}
              template={template}
            />

            {/* Audio Explanation with Language and Jargon/Simple Options */}
            <AudioExplanation
              result={result}
              scene1={scene1}
              scene2={scene2}
              query={query}
            />

            <FindingsExport
              result={result}
              scene1={scene1}
              scene2={scene2}
            />

            <ExecutionTrace trace={result?.trace || null} />
          </div>

          {/* Right Column: Pinned AI Chatbox (stays visible while scrolling results) */}
          <div className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <LiveVoiceConversation
              result={result}
              scene1={scene1}
              scene2={scene2}
              query={query}
              onExecuteBiTemporal={handleExecuteLocationBiTemporal}
              activeLocationLock={activeLocationLock}
              onLocationLockChange={setActiveLocationLock}
            />
          </div>
        </div>
      </main>

      {/* App Guided Tour Modal */}
      <AppTour
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        onSelectPreset={handleSelectPreset}
      />

      {/* Batch Processing Fullscreen Modal */}
      <BatchProcessingModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        onInspectItemInDashboard={handleInspectBatchItem}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 px-6 text-center text-xs text-slate-500">
        SatQuery AI — Remote-sensing vision-language assistant · Sentinel-2 MSI & Sentinel-1 SAR Analysis
      </footer>
    </div>
  );
};

export default App;
