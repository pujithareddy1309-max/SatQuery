import { BatchCoordinateItem, BatchItemResult } from '../types';
import { generateBiTemporalLocationScenes } from './demo';
import { runAgent } from './agent';
import { calculateCoverageTrend } from './trend';
import { computeUtmCRS, computeMGRS } from './geocoder';

/**
 * Executes the full bi-temporal change detection pipeline for a single batch coordinate item.
 */
export async function executeBatchItemPipeline(
  item: BatchCoordinateItem
): Promise<{
  result: BatchItemResult;
  scene1: any;
  scene2: any;
}> {
  const startTime = performance.now();

  // 1. Generate co-registered multi-spectral bi-temporal scenes
  const isSar = item.layer === 'osiris-sar';
  const { scene1, scene2 } = generateBiTemporalLocationScenes(
    item.lat,
    item.lon,
    item.name,
    item.t1Date,
    item.t2Date,
    item.layer
  );

  // 2. Formulate remote sensing query
  const query = `Bi-temporal change detection at ${item.name} (${item.lat.toFixed(4)}°, ${item.lon.toFixed(4)}°) between ${item.t1Date} (T1) and ${item.t2Date} (T2) using ${item.layer.toUpperCase()} data layer.`;

  // 3. Run autonomous agent pipeline
  const agentResult = await runAgent(query, scene1, scene2, isSar, item.template);

  // 4. Calculate bi-temporal pixel coverage and spectral delta trend
  const trend = calculateCoverageTrend(scene1, scene2);

  // 5. Geographic projection calculation
  const { utmZone, crs } = computeUtmCRS(item.lat, item.lon);
  const mgrs = computeMGRS(item.lat, item.lon);

  // 6. Days delta calculation
  const t1Millis = new Date(item.t1Date).getTime();
  const t2Millis = new Date(item.t2Date).getTime();
  const daysDelta = Math.max(1, Math.round(Math.abs(t2Millis - t1Millis) / (1000 * 60 * 60 * 24)));

  // Total hectares across scene (256 * 256 pixels at 10m GSD = 65,536 * 100m² = 655.36 hectares)
  const totalHectares = 655.36;

  const processingTimeMs = Math.round(performance.now() - startTime);

  const dominantChange =
    agentResult.dominantChange ||
    (trend.items.find((i) => Math.abs(i.deltaPct) > 5)?.interpretation || 'Surface Spectral Shift');

  const batchResult: BatchItemResult = {
    id: item.id,
    locationName: item.name,
    lat: item.lat,
    lon: item.lon,
    formattedAddress: `${item.name} (${item.lat.toFixed(4)}°, ${item.lon.toFixed(4)}°)`,
    crs,
    utmZone,
    mgrs,
    elevationM: Math.floor(Math.abs(Math.sin(item.lat * 10) * 120) + 15),
    bounds: scene1.bounds || [item.lon - 0.012, item.lat - 0.012, item.lon + 0.012, item.lat + 0.012],
    t1Date: item.t1Date,
    t2Date: item.t2Date,
    daysDelta,
    layerUsed: item.layer,
    dominantChange,
    confidence: +(0.85 + Math.random() * 0.12).toFixed(2),
    headline: trend.headline,
    agentSummary: agentResult.answer || trend.analysisText,
    spectralDeltas: trend.spectralDeltas,
    coverageChanges: trend.items.map((i) => ({
      className: i.className,
      scene1Pct: i.scene1Pct,
      scene2Pct: i.scene2Pct,
      deltaPct: i.deltaPct,
      deltaHectares: i.deltaHectares,
      direction: i.direction,
      interpretation: i.interpretation,
    })),
    totalHectares,
    processingTimeMs,
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lon}`,
  };

  return {
    result: batchResult,
    scene1,
    scene2,
  };
}
