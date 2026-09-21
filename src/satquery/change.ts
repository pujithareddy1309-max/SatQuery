import { BoundingBox, MasksMap, RasterScene } from '../types';
import { computeNdvi, computeNdwi, computeNdbi } from './indices';
import { extractBoundingBoxes, morphClean } from './segmentation';

export interface SemanticChangeResult {
  answer: string;
  masks: MasksMap;
  boxes: BoundingBox[];
  dominant: string;
  deltas: {
    ndvi_mean: number;
    ndwi_mean: number;
    ndbi_mean: number;
  };
  method: string;
  confidence: number;
}

export function computeSemanticChange(
  t1: RasterScene,
  t2: RasterScene
): SemanticChangeResult {
  const width = Math.min(t1.width, t2.width);
  const height = Math.min(t1.height, t2.height);
  const len = width * height;

  const ndvi1 = computeNdvi(t1.bands.B08, t1.bands.B04);
  const ndvi2 = computeNdvi(t2.bands.B08, t2.bands.B04);
  const ndwi1 = computeNdwi(t1.bands.B03, t1.bands.B08);
  const ndwi2 = computeNdwi(t2.bands.B03, t2.bands.B08);
  const ndbi1 = computeNdbi(t1.bands.B11, t1.bands.B08);
  const ndbi2 = computeNdbi(t2.bands.B11, t2.bands.B08);

  const rawFlooding = new Uint8Array(len);
  const rawDeforestation = new Uint8Array(len);
  const rawConstruction = new Uint8Array(len);
  const rawCrop = new Uint8Array(len);

  let sumDNdvi = 0;
  let sumDNdwi = 0;
  let sumDNdbi = 0;

  for (let i = 0; i < len; i++) {
    const dNdvi = ndvi2[i] - ndvi1[i];
    const dNdwi = ndwi2[i] - ndwi1[i];
    const dNdbi = ndbi2[i] - ndbi1[i];

    sumDNdvi += dNdvi;
    sumDNdwi += dNdwi;
    sumDNdbi += dNdbi;

    const isFlooding = ndwi2[i] > 0.05 && dNdwi > 0.12 && ndvi2[i] < ndvi1[i];
    const isDeforest = dNdvi < -0.15 && ndvi1[i] > 0.25 && ndwi2[i] < 0.1;
    const isConstruct = dNdbi > 0.12 && dNdvi < -0.05 && ndwi2[i] < 0.1;
    const isCrop =
      Math.abs(dNdvi) > 0.12 &&
      ndvi1[i] > 0.15 &&
      ndvi2[i] > 0.05 &&
      ndwi2[i] < 0.15 &&
      !isConstruct &&
      !isDeforest;

    rawFlooding[i] = isFlooding ? 1 : 0;
    rawDeforestation[i] = isDeforest ? 1 : 0;
    rawConstruction[i] = isConstruct ? 1 : 0;
    rawCrop[i] = isCrop ? 1 : 0;
  }

  const cleanFlooding = morphClean(rawFlooding, width, height);
  const cleanDeforestation = morphClean(rawDeforestation, width, height);
  const cleanConstruction = morphClean(rawConstruction, width, height);
  const cleanCrop = morphClean(rawCrop, width, height);

  const masks: MasksMap = {
    flooding: { width, height, data: cleanFlooding },
    deforestation: { width, height, data: cleanDeforestation },
    construction: { width, height, data: cleanConstruction },
    crop_evolution: { width, height, data: cleanCrop },
  };

  const counts: Record<string, number> = {};
  for (const [key, maskObj] of Object.entries(masks)) {
    let c = 0;
    for (let i = 0; i < maskObj.data.length; i++) {
      if (maskObj.data[i] > 0) c++;
    }
    counts[key] = (c / len) * 100;
  }

  let dominant = 'none';
  let maxPct = 0;
  const lines: string[] = [];

  for (const [key, pct] of Object.entries(counts)) {
    if (pct > 0.2) {
      lines.push(`${key.replace('_', ' ')}: ${pct.toFixed(1)}%`);
    }
    if (pct > maxPct && pct > 0.5) {
      maxPct = pct;
      dominant = key;
    }
  }

  const boxes = extractBoundingBoxes(masks, t2.width, t2.height);

  const answer =
    `Semantic change (index-driven): ` +
    (lines.length > 0 ? lines.join(', ') : 'no strong class exceeded detection thresholds') +
    `. Dominant class: ${dominant.replace('_', ' ')}.`;

  return {
    answer,
    masks,
    boxes,
    dominant,
    deltas: {
      ndvi_mean: Math.round((sumDNdvi / len) * 1000) / 1000,
      ndwi_mean: Math.round((sumDNdwi / len) * 1000) / 1000,
      ndbi_mean: Math.round((sumDNdbi / len) * 1000) / 1000,
    },
    method: 'bi-temporal NDVI/NDWI/NDBI decision tree',
    confidence: t1.crs && t2.crs ? 0.78 : 0.65,
  };
}

export function computeNdviAnomaly(
  t1: RasterScene,
  t2: RasterScene
): {
  answer: string;
  masks: MasksMap;
  boxes: BoundingBox[];
  t1Mean: number;
  t2Mean: number;
  deltaMean: number;
} {
  const width = Math.min(t1.width, t2.width);
  const height = Math.min(t1.height, t2.height);
  const len = width * height;

  const ndvi1 = computeNdvi(t1.bands.B08, t1.bands.B04);
  const ndvi2 = computeNdvi(t2.bands.B08, t2.bands.B04);

  const rawLoss = new Uint8Array(len);
  const rawGain = new Uint8Array(len);
  let sumDelta = 0;
  let sum1 = 0;
  let sum2 = 0;

  for (let i = 0; i < len; i++) {
    const d = ndvi2[i] - ndvi1[i];
    sumDelta += d;
    sum1 += ndvi1[i];
    sum2 += ndvi2[i];

    rawLoss[i] = d < -0.1 ? 1 : 0;
    rawGain[i] = d > 0.1 ? 1 : 0;
  }

  const masks: MasksMap = {
    vegetation_loss: { width, height, data: morphClean(rawLoss, width, height) },
    vegetation_gain: { width, height, data: morphClean(rawGain, width, height) },
  };

  let lossCount = 0;
  let gainCount = 0;
  for (let i = 0; i < len; i++) {
    if (masks.vegetation_loss.data[i] > 0) lossCount++;
    if (masks.vegetation_gain.data[i] > 0) gainCount++;
  }

  const lossPct = (lossCount / len) * 100;
  const gainPct = (gainCount / len) * 100;
  const deltaMean = sumDelta / len;
  const t1Mean = sum1 / len;
  const t2Mean = sum2 / len;

  const answer = `NDVI anomaly: mean Δ=${deltaMean.toFixed(3)}. Loss ${lossPct.toFixed(1)}%, gain ${gainPct.toFixed(1)}%.`;

  return {
    answer,
    masks,
    boxes: extractBoundingBoxes(masks, t2.width, t2.height),
    t1Mean: Math.round(t1Mean * 1000) / 1000,
    t2Mean: Math.round(t2Mean * 1000) / 1000,
    deltaMean: Math.round(deltaMean * 1000) / 1000,
  };
}
