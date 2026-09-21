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
