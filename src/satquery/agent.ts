import {
  AgentResult,
  AgentTrace,
  BoundingBox,
  ExplanationComplexity,
  IndexSummary,
  MasksMap,
  OperationalTemplate,
  RasterScene,
  TraceStep,
} from '../types';
import { computeSemanticChange, computeNdviAnomaly } from './change';
import { sceneToDataUrl } from './demo';
import { fuseOpticalSar } from './fusion';
import { createExportBundle } from './geoexport';
import { computeIndex } from './indices';
import {
  computeCoverageEntries,
  extractBoundingBoxes,
  generateSpectralMasks,
  renderAnnotatedImage,
} from './segmentation';
import { validateSpatialExtent } from './validation';

export const TOOL_SCHEMAS = [
  {
    name: 'validate_spatial_extent',
    description: 'CRS, spatial overlap, acquisition dates, and cloud cover pre-flight checks.',
  },
  {
    name: 'calculate_ndvi',
    description: 'Compute Sentinel-2 Normalized Difference Vegetation Index (NDVI) for t1 or t2.',
  },
  {
    name: 'calculate_ndwi',
    description: 'Compute McFeeters Normalized Difference Water Index (NDWI) for water mapping.',
  },
  {
    name: 'calculate_ndbi',
    description: 'Compute Normalized Difference Built-up Index (NDBI) for infrastructure detection.',
  },
  {
    name: 'run_segmentation',
    description: 'Pixel-level spectral classification (water, vegetation, built-up) and coverage %.',
  },
  {
    name: 'run_semantic_change',
    description: 'Bi-temporal semantic change: classify flooding, deforestation, construction, and crop evolution.',
  },
  {
    name: 'track_ndvi_anomaly',
    description: 'Agriculture workflow: detect vegetation loss/stress and vigor gain across dates.',
  },
  {
    name: 'fuse_optical_sar',
    description: 'Cross-attention fusion of Sentinel-2 optical bands with Sentinel-1 SAR radar backscatter.',
  },
  {
    name: 'export_geojson',
    description: 'Generate standard GeoJSON FeatureCollection, KML, and georeferenced export bundle with hectares.',
  },
];

export function heuristicPlan(
  query: string,
  scene1: RasterScene,
  scene2?: RasterScene | null,
  isSarPair = false,
  template?: OperationalTemplate | null
): Array<{ name: string; arguments?: Record<string, any> }> {
  const q = (query || '').toLowerCase();
  const tmpl = (template || 'auto').toLowerCase();
  const two = !!scene2;
  const calls: Array<{ name: string; arguments?: Record<string, any> }> = [];

  if (two) {
    calls.push({ name: 'validate_spatial_extent', arguments: {} });
  }

  if (tmpl === 'disaster' || q.includes('flood') || q.includes('disaster') || q.includes('inundat')) {
    if (two) {
      calls.push({ name: 'calculate_ndwi', arguments: { source: 't1' } });
      calls.push({ name: 'calculate_ndwi', arguments: { source: 't2' } });
      calls.push({ name: 'run_semantic_change', arguments: {} });
    } else {
      calls.push({ name: 'calculate_ndwi', arguments: { source: 't1' } });
    }
    calls.push({ name: 'run_segmentation', arguments: { source: two ? 't2' : 't1' } });
    calls.push({ name: 'export_geojson', arguments: {} });
    return calls;
  }

  if (tmpl === 'agriculture' || q.includes('ndvi') || q.includes('crop') || q.includes('agricult') || q.includes('yield')) {
    if (two) {
      calls.push({ name: 'track_ndvi_anomaly', arguments: {} });
    }
    calls.push({ name: 'calculate_ndvi', arguments: { source: two ? 't2' : 't1' } });
    calls.push({ name: 'export_geojson', arguments: {} });
    return calls;
  }

  if (tmpl === 'change' || (two && !isSarPair)) {
    calls.push({ name: 'run_semantic_change', arguments: {} });
    calls.push({ name: 'export_geojson', arguments: {} });
    return calls;
  }

  if (tmpl === 'landcover' || q.includes('land cover') || q.includes('land-cover') || q.includes('coverage') || q.includes('built-up')) {
    if (q.includes('water') || q.includes('ndwi')) {
      calls.push({ name: 'calculate_ndwi', arguments: { source: 't1' } });
    }
    if (q.includes('ndvi') || q.includes('veget')) {
      calls.push({ name: 'calculate_ndvi', arguments: { source: 't1' } });
    }
    calls.push({ name: 'run_segmentation', arguments: { source: 't1' } });
    calls.push({ name: 'export_geojson', arguments: {} });
    return calls;
  }

  if (isSarPair || tmpl === 'auto' && (q.includes('sar') || q.includes('radar') || q.includes('fusion'))) {
    calls.push({ name: 'fuse_optical_sar', arguments: {} });
    calls.push({ name: 'export_geojson', arguments: {} });
    return calls;
  }

  // General default fallback
  calls.push({ name: 'calculate_ndvi', arguments: { source: 't1' } });
  calls.push({ name: 'calculate_ndwi', arguments: { source: 't1' } });
  calls.push({ name: 'run_segmentation', arguments: { source: 't1' } });
  calls.push({ name: 'export_geojson', arguments: {} });
  return calls;
}

export async function runAgent(
  query: string,
  scene1: RasterScene,
  scene2?: RasterScene | null,
  isSarPair = false,
  template?: OperationalTemplate | null,
  complexity: ExplanationComplexity = 'simple'
): Promise<AgentResult> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  const trace: AgentTrace = {
    timestamp,
    query,
    template: template || 'auto',
    planner: 'heuristic-function-calling',
    toolSchemas: TOOL_SCHEMAS.map((s) => s.name),
    steps: [],
    elapsedSeconds: 0,
  };

  const plan = heuristicPlan(query, scene1, scene2, isSarPair, template);
  trace.steps.push({
    step: 'plan',
    params: { plan },
    confidence: 0.88,
    details: `Generated autonomous execution sequence of ${plan.length} tools.`,
  });

  let currentMasks: MasksMap = {};
  let currentBoxes: BoundingBox[] = [];
  const answers: string[] = [];
  const indices: AgentResult['indices'] = {};
  let dominantChange: string | undefined;

  for (const call of plan) {
    const { name, arguments: args = {} } = call;
    const sourceScene = args.source === 't2' && scene2 ? scene2 : scene1;
    const step: TraceStep = {
      step: 'tool_call',
      tool: name,
      params: args,
    };

    try {
      if (name === 'validate_spatial_extent') {
        const val = validateSpatialExtent(scene1, scene2);
        step.result = val;
        step.confidence = val.valid ? 0.95 : 0.6;
        answers.push(
          `Spatial validation valid=${val.valid}, CRS=${val.crs || 'unspecified'}${
            val.warnings.length > 0 ? ` (${val.warnings.join('; ')})` : ''
          }.`
        );
      } else if (name === 'calculate_ndvi') {
        const res = computeIndex(sourceScene, 'ndvi');
        indices.ndvi = res;
        step.result = {
          mean: res.mean,
          positive_pct: res.positivePct,
          threshold: res.threshold,
          area_ha: res.areaHectares,
        };
        step.confidence = 0.9;
        answers.push(
          `NDVI: Mean=${res.mean.toFixed(3)}, Vegetation coverage=${res.positivePct.toFixed(
            1
          )}% (${res.areaHectares} ha).`
        );
      } else if (name === 'calculate_ndwi') {
        const res = computeIndex(sourceScene, 'ndwi');
        indices.ndwi = res;
        step.result = {
          mean: res.mean,
          positive_pct: res.positivePct,
          threshold: res.threshold,
          area_ha: res.areaHectares,
        };
        step.confidence = 0.9;
        answers.push(
          `NDWI: Mean=${res.mean.toFixed(3)}, Water coverage=${res.positivePct.toFixed(1)}% (${
            res.areaHectares
          } ha).`
        );
      } else if (name === 'calculate_ndbi') {
        const res = computeIndex(sourceScene, 'ndbi');
        indices.ndbi = res;
        step.result = {
          mean: res.mean,
          positive_pct: res.positivePct,
          threshold: res.threshold,
          area_ha: res.areaHectares,
        };
        step.confidence = 0.85;
        answers.push(
          `NDBI: Mean=${res.mean.toFixed(3)}, Built-up coverage=${res.positivePct.toFixed(1)}% (${
            res.areaHectares
          } ha).`
        );
      } else if (name === 'run_segmentation') {
        currentMasks = generateSpectralMasks(sourceScene);
        currentBoxes = extractBoundingBoxes(currentMasks, sourceScene.width, sourceScene.height);
        const coverage = computeCoverageEntries(sourceScene, currentMasks);
        step.result = {
          coverage: coverage.map((c) => `${c.class}: ${c.percentage}% (${c.hectares} ha)`),
          detected_regions: currentBoxes.length,
        };
        step.confidence = 0.92;
        const covSummary = coverage.map((c) => `${c.class}: ${c.percentage}%`).join(', ');
        answers.push(`Pixel-level spectral segmentation: ${covSummary}.`);
      } else if (name === 'run_semantic_change') {
        if (!scene2) {
          step.error = 'Semantic change requires two acquisitions (t1 and t2).';
        } else {
          const changeRes = computeSemanticChange(scene1, scene2);
          currentMasks = changeRes.masks;
          currentBoxes = changeRes.boxes;
          dominantChange = changeRes.dominant;
          step.result = {
            dominant_class: changeRes.dominant,
            deltas: changeRes.deltas,
            confidence: changeRes.confidence,
          };
          step.confidence = changeRes.confidence;
          answers.push(changeRes.answer);
        }
      } else if (name === 'track_ndvi_anomaly') {
        if (!scene2) {
          step.error = 'NDVI anomaly requires two acquisitions (t1 and t2).';
        } else {
          const anomaly = computeNdviAnomaly(scene1, scene2);
          currentMasks = anomaly.masks;
          currentBoxes = anomaly.boxes;
          step.result = {
            t1_mean: anomaly.t1Mean,
            t2_mean: anomaly.t2Mean,
            delta_mean: anomaly.deltaMean,
          };
          step.confidence = 0.85;
          answers.push(anomaly.answer);
        }
      } else if (name === 'fuse_optical_sar') {
        if (!scene2) {
          step.error = 'Fusion requires optical + SAR co-registered pair.';
        } else {
          const fusion = fuseOpticalSar(scene1, scene2);
          currentMasks = fusion.masks;
          currentBoxes = fusion.boxes;
          step.result = {
            embedding_norm: fusion.embeddingNorm,
            confidence: fusion.confidence,
          };
          step.confidence = fusion.confidence;
          answers.push(fusion.answer);
        }
      } else if (name === 'export_geojson') {
        if (Object.keys(currentMasks).length === 0) {
          currentMasks = generateSpectralMasks(scene1);
        }
        const activeScene = scene2 || scene1;
        const bundle = createExportBundle(activeScene, currentMasks);
        step.result = {
          feature_count: bundle.featureCount,
          classes: Object.keys(bundle.areas),
        };
        step.confidence = 0.98;
        answers.push(
          `Geospatial export generated: ${bundle.featureCount} spatial features, GeoJSON, KML, and metadata ready for download.`
        );
      }
    } catch (err: any) {
      step.error = err.message || 'Error executing tool';
    }

    trace.steps.push(step);
  }

  trace.elapsedSeconds = Math.round((performance.now() - startTime) / 10) / 100;

  // Render annotated visual
  const targetScene = scene2 || scene1;
  const annotatedImageUrl = renderAnnotatedImage(targetScene, currentMasks, currentBoxes, {
    showMasks: true,
    showBoxes: true,
    opacity: 0.45,
  });

  const rgbT1DataUrl = sceneToDataUrl(scene1);
  const rgbT2DataUrl = scene2 ? sceneToDataUrl(scene2) : undefined;

  // Temporal blend image (default 50% opacity)
  let blendDataUrl: string | undefined;
  if (scene2) {
    const blendCanvas = document.createElement('canvas');
    blendCanvas.width = targetScene.width;
    blendCanvas.height = targetScene.height;
    const ctx = blendCanvas.getContext('2d');
    if (ctx) {
      const imgData = ctx.createImageData(targetScene.width, targetScene.height);
      const d = imgData.data;
      const len = targetScene.width * targetScene.height;
      for (let i = 0; i < len; i++) {
        const p = i * 4;
        d[p] = Math.round(scene1.rgbData[p] * 0.5 + scene2.rgbData[p] * 0.5);
        d[p + 1] = Math.round(scene1.rgbData[p + 1] * 0.5 + scene2.rgbData[p + 1] * 0.5);
        d[p + 2] = Math.round(scene1.rgbData[p + 2] * 0.5 + scene2.rgbData[p + 2] * 0.5);
        d[p + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      blendDataUrl = blendCanvas.toDataURL('image/png');
    }
  }

  const coverage = computeCoverageEntries(targetScene, currentMasks);
  const exportBundle = createExportBundle(targetScene, currentMasks);

  // Guarantee that all three standard spectral indices exist for targetScene
  if (!indices.ndvi) indices.ndvi = computeIndex(targetScene, 'ndvi');
  if (!indices.ndwi) indices.ndwi = computeIndex(targetScene, 'ndwi');
  if (!indices.ndbi) indices.ndbi = computeIndex(targetScene, 'ndbi');

  // Synthesize final answer based on complexity mode
  const rawAnswer = answers.join('\n\n');
  const finalAnswer = synthesizeAnswer(rawAnswer, complexity, coverage, indices, dominantChange, scene2, isSarPair);

  return {
    answer: finalAnswer,
    annotatedImageUrl,
    masks: currentMasks,
    boxes: currentBoxes,
    coverage,
    trace,
    exportBundle,
    rgbT1DataUrl,
    rgbT2DataUrl,
    blendDataUrl,
    dominantChange,
    indices,
    complexity,
  };
}

// ---------------------------------------------------------------------------
// Synthesize complexity-aware answer text
// ---------------------------------------------------------------------------
function synthesizeAnswer(
  rawAnswer: string,
  complexity: ExplanationComplexity,
  coverage: { class: string; percentage: number; hectares: number; color: string }[],
  indices: { ndvi?: IndexSummary; ndwi?: IndexSummary; ndbi?: IndexSummary },
  dominantChange?: string,
  hasScene2?: boolean,
  isSarPair?: boolean
): string {
  if (complexity === 'technical') {
    const lines: string[] = [];

    // Spectral indices breakdown
    if (indices.ndvi) {
      lines.push(
        `NDVI (Sentinel-2, NIR-SWIR normalized): mean=${indices.ndvi.mean.toFixed(4)}, positive pixel fraction=${indices.ndvi.positivePct.toFixed(1)}%, threshold=${indices.ndvi.threshold.toFixed(2)}, vegetated area=${indices.ndvi.areaHectares} ha. Method: ${indices.ndvi.method}.`
      );
    }
    if (indices.ndwi) {
      lines.push(
        `NDWI (McFeeters, Green-NIR): mean=${indices.ndwi.mean.toFixed(4)}, water pixel fraction=${indices.ndwi.positivePct.toFixed(1)}%, threshold=${indices.ndwi.threshold.toFixed(2)}, water surface area=${indices.ndwi.areaHectares} ha. Method: ${indices.ndwi.method}.`
      );
    }
    if (indices.ndbi) {
      lines.push(
        `NDBI (SWIR-NIR normalized): mean=${indices.ndbi.mean.toFixed(4)}, built-up pixel fraction=${indices.ndbi.positivePct.toFixed(1)}%, threshold=${indices.ndbi.threshold.toFixed(2)}, impervious surface area=${indices.ndbi.areaHectares} ha. Method: ${indices.ndbi.method}.`
      );
    }

    // Quantitative pixel breakdown
    const pixelLines = coverage.map(
      (c) => `  • ${c.class}: ${c.percentage}% (${c.pixels} px, ${c.hectares} ha)`
    );
    if (pixelLines.length > 0) {
      lines.push(`Pixel-level spectral classification breakdown:\n${pixelLines.join('\n')}`);
    }

    // SAR backscatter metrics
    if (isSarPair) {
      lines.push(
        `SAR radar backscatter: Sentinel-1 C-band (5.405 GHz, VV+VH polarization). Cross-attention fusion of optical MSI bands (B02/B03/B04/B08/B11) with SAR intensity channels. Backscatter variance computed over co-registered slant-range geometry.`
      );
    }

    // Bi-temporal change
    if (hasScene2 && dominantChange) {
      lines.push(`Dominant bi-temporal change class: ${dominantChange}. Co-registered T1→T2 semantic shift computed via per-class delta of spectral masks.`);
    }

    // Include raw tool trace
    lines.push(`\nTool execution trace:\n${rawAnswer}`);

    return lines.join('\n\n');
  } else {
    // Simple mode: plain language, no jargon
    const lines: string[] = [];

    const waterPct = coverage.find((c) => c.class.toLowerCase().includes('water'))?.percentage;
    const vegPct = coverage.find((c) => c.class.toLowerCase().includes('veget') || c.class.toLowerCase().includes('forest'))?.percentage;
    const builtPct = coverage.find((c) => c.class.toLowerCase().includes('built') || c.class.toLowerCase().includes('urban'))?.percentage;

    const parts: string[] = [];
    if (waterPct !== undefined) parts.push(`water covers about ${waterPct}%`);
    if (vegPct !== undefined) parts.push(`green vegetation covers about ${vegPct}%`);
    if (builtPct !== undefined) parts.push(`built-up areas cover about ${builtPct}%`);

    if (parts.length > 0) {
      lines.push(`Here's what I found in this satellite image: ${parts.join(', ')}.`);
    }

    if (hasScene2 && dominantChange) {
      lines.push(`Comparing the two time periods, the biggest change I detected is ${dominantChange}.`);
    }

    if (isSarPair) {
      lines.push(`I also combined the regular camera image with radar data to get a clearer picture through clouds and at night.`);
    }

    lines.push(`\n${rawAnswer.split('\n\n')[0]}`);

    return lines.join('\n\n');
  }
}
