export type OperationalTemplate = 'auto' | 'disaster' | 'agriculture' | 'landcover' | 'change';

export interface BoundingBox {
  box: [number, number, number, number]; // [x1, y1, x2, y2]
  label: string;
}

export interface MaskData {
  width: number;
  height: number;
  data: Uint8Array; // 1 for active, 0 for inactive
}

export interface MasksMap {
  [label: string]: MaskData;
}

export interface CoverageEntry {
  class: string;
  percentage: number;
  pixels: number;
  squareMeters: number;
  hectares: number;
  color: string;
}

export interface RasterScene {
  id: string;
  name: string;
  width: number;
  height: number;
  rgbData: Uint8ClampedArray; // RGBA 4 bytes per pixel
  bands: {
    B02: Float32Array; // Blue
    B03: Float32Array; // Green
    B04: Float32Array; // Red
    B08: Float32Array; // NIR
    B11: Float32Array; // SWIR
  };
  crs?: string;
  bounds?: [number, number, number, number]; // [minX, minY, maxX, maxY]
  pixelSizeM?: [number, number];
  acquisitionDate?: string;
  cloudPct?: number;
  bandSource: 'sentinel2-msi' | 'rgb-proxy' | 'synthetic';
  isSar?: boolean;
}

export interface IndexSummary {
  name: 'NDVI' | 'NDWI' | 'NDBI';
  mean: number;
  positivePct: number;
  threshold: number;
  method: string;
  areaHectares: number;
  colormapDataUrl: string;
  array: Float32Array;
  width: number;
  height: number;
}

export interface TraceStep {
  step: 'validation' | 'plan' | 'tool_call' | 'synthesis';
  tool?: string;
  params?: Record<string, any>;
  result?: any;
  confidence?: number;
  error?: string;
  details?: string;
}

export interface AgentTrace {
  timestamp: string;
  query: string;
  template: OperationalTemplate | null;
  planner: string;
  toolSchemas: string[];
  steps: TraceStep[];
  elapsedSeconds: number;
}

export interface ExportBundle {
  geojsonText: string;
  kmlText: string;
  featureCount: number;
  areas: Record<string, { hectares: number; squareMeters: number; pixels: number }>;
  downloadZip: () => Promise<Blob>;
}

export interface GroundingSource {
  title?: string;
  uri?: string;
}

export interface GroundingData {
  type: 'search' | 'maps';
  text: string;
  model: string;
  sources?: GroundingSource[];
  webSearchQueries?: string[];
  groundingMetadata?: any;
  rateLimited?: boolean;
}

export interface AgentResult {
  answer: string;
  annotatedImageUrl: string;
  masks: MasksMap;
  boxes: BoundingBox[];
  coverage: CoverageEntry[];
  trace: AgentTrace;
  exportBundle: ExportBundle | null;
  rgbT1DataUrl: string;
  rgbT2DataUrl?: string;
  blendDataUrl?: string;
  dominantChange?: string;
  indices?: {
    ndvi?: IndexSummary;
    ndwi?: IndexSummary;
    ndbi?: IndexSummary;
  };
  grounding?: GroundingData | null;
}

export type ExplanationComplexity = 'simple' | 'technical';

export interface ExplanationLanguage {
  code: string;
  name: string;
  nativeName: string;
  speechCode: string;
  flag: string;
}

export interface AudioExplanationData {
  script: string;
  language: string;
  complexity: ExplanationComplexity;
  audioUrl?: string | null;
  voice?: string;
  ttsModel?: string;
  model?: string;
  fallbackToWebSpeech?: boolean;
  rateLimited?: boolean;
}

export interface PresetConfig {
  name: string;
  query: string;
  template: OperationalTemplate;
  isSar: boolean;
  sample1: string;
  sample2?: string;
  description: string;
}

export interface OsirisMetadata {
  satelliteConstellation: string;
  orbitRepeatDays: number;
  sensorModes: string[];
  recommendedWindows: Array<{ t1: string; t2: string; label: string }>;
}

export interface LocationLockData {
  id: string;
  query: string;
  lat: number;
  lon: number;
  formattedAddress: string;
  region?: string;
  country?: string;
  crs: string;
  utmZone: string;
  mgrs: string;
  elevationM: number;
  bounds: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  googleMapsUrl: string;
  osiris: OsirisMetadata;
  t1Date: string;
  t2Date: string;
  selectedLayer: 'google-maps' | 'osiris-optical' | 'osiris-sar' | 'osiris-ndwi';
}

export interface BatchCoordinateItem {
  id: string;
  lat: number;
  lon: number;
  name: string;
  t1Date: string;
  t2Date: string;
  layer: 'osiris-optical' | 'osiris-sar' | 'osiris-ndwi' | 'google-maps';
  template: OperationalTemplate;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  result?: BatchItemResult;
  scene1?: RasterScene;
  scene2?: RasterScene;
}

export interface BatchItemResult {
  id: string;
  locationName: string;
  lat: number;
  lon: number;
  formattedAddress: string;
  crs: string;
  utmZone: string;
  mgrs: string;
  elevationM: number;
  bounds: [number, number, number, number];
  t1Date: string;
  t2Date: string;
  daysDelta: number;
  layerUsed: string;
  dominantChange: string;
  confidence: number;
  headline: string;
  agentSummary: string;
  spectralDeltas: {
    meanDeltaNdvi: number;
    meanDeltaNdwi: number;
    meanDeltaNdbi: number;
  };
  coverageChanges: Array<{
    className: string;
    scene1Pct: number;
    scene2Pct: number;
    deltaPct: number;
    deltaHectares: number;
    direction: 'increase' | 'decrease' | 'stable';
    interpretation: string;
  }>;
  totalHectares: number;
  processingTimeMs: number;
  googleMapsUrl: string;
}

export interface BatchSummaryExport {
  exportVersion: string;
  exportTimestamp: string;
  batchId: string;
  metadata: {
    totalItems: number;
    completedItems: number;
    failedItems: number;
    elapsedSeconds: number;
    pipeline: string;
    satelliteConstellation: string;
    spatialResolutionM: number;
    aggregateAnalysis: {
      totalHectaresAnalyzed: number;
      averageDaysDelta: number;
      dominantChangesCount: Record<string, number>;
      netVegetationShiftHectares: number;
      netWaterShiftHectares: number;
      netBuiltUpShiftHectares: number;
    };
  };
  results: BatchItemResult[];
}
