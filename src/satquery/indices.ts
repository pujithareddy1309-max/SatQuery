import { IndexSummary, RasterScene } from '../types';

export function normalizedDifference(
  a: Float32Array,
  b: Float32Array,
  eps = 1e-6
): Float32Array {
  const len = a.length;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const va = a[i];
    const vb = b[i];
    out[i] = (va - vb) / (va + vb + eps);
  }
  return out;
}

export function computeNdvi(nir: Float32Array, red: Float32Array): Float32Array {
  return normalizedDifference(nir, red);
}

export function computeNdwi(green: Float32Array, nir: Float32Array): Float32Array {
  return normalizedDifference(green, nir);
}

export function computeNdbi(swir: Float32Array, nir: Float32Array): Float32Array {
  return normalizedDifference(swir, nir);
}

/**
 * Jet Colormap generator for continuous indices [-1, 1]
 */
export function indexToJetRgb(val: number): [number, number, number] {
  // Normalize -1..1 to 0..1
  const t = Math.max(0, Math.min(1, (val + 1) / 2));
  const r = Math.max(0, Math.min(1, 1.5 - Math.abs(t * 4 - 3)));
  const g = Math.max(0, Math.min(1, 1.5 - Math.abs(t * 4 - 2)));
  const b = Math.max(0, Math.min(1, 1.5 - Math.abs(t * 4 - 1)));
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Viridis Colormap generator for vegetation/water
 */
export function indexToViridisRgb(val: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (val + 1) / 2));
  // Simple polynomial approximation of viridis
  const r = Math.round((0.267 + 0.004 * t + 2.81 * t * t - 2.08 * t * t * t) * 255);
  const g = Math.round((0.004 + 1.4 * t - 0.5 * t * t) * 255);
  const b = Math.round((0.329 + 1.4 * t - 2.8 * t * t + 1.3 * t * t * t) * 255);
  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b)),
  ];
}

export function renderIndexColormap(
  arr: Float32Array,
  width: number,
  height: number,
  mode: 'jet' | 'viridis' = 'jet'
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;
  const len = arr.length;

  for (let i = 0; i < len; i++) {
    const val = arr[i];
    const [r, g, b] = mode === 'jet' ? indexToJetRgb(val) : indexToViridisRgb(val);
    const p = i * 4;
    data[p] = r;
    data[p + 1] = g;
    data[p + 2] = b;
    data[p + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function computeIndex(
  scene: RasterScene,
  name: 'ndvi' | 'ndwi' | 'ndbi'
): IndexSummary {
  const { width, height, bands, pixelSizeM } = scene;
  const pxSize = pixelSizeM ? pixelSizeM[0] * pixelSizeM[1] : 100.0; // 10m GSD -> 100 m²

  let array: Float32Array;
  let threshold: number;
  let method: string;
  let colormapMode: 'jet' | 'viridis' = 'jet';

  if (name === 'ndvi') {
    array = computeNdvi(bands.B08, bands.B04);
    threshold = 0.2;
    method = 'Sentinel-2 NDVI (NIR-Red)';
    colormapMode = 'viridis';
  } else if (name === 'ndwi') {
    array = computeNdwi(bands.B03, bands.B08);
    threshold = 0.0;
    method = 'McFeeters NDWI (Green-NIR)';
    colormapMode = 'jet';
  } else {
    array = computeNdbi(bands.B11, bands.B08);
    threshold = 0.1;
    method = 'NDBI (SWIR-NIR)';
    colormapMode = 'jet';
  }

  let sum = 0;
  let posCount = 0;
  const len = array.length;

  for (let i = 0; i < len; i++) {
    const v = array[i];
    sum += v;
    if (v > threshold) posCount++;
  }

  const mean = len > 0 ? sum / len : 0;
  const positivePct = len > 0 ? (posCount / len) * 100 : 0;
  const areaHectares = (posCount * pxSize) / 10000.0;

  const colormapDataUrl = renderIndexColormap(array, width, height, colormapMode);

  return {
    name: name.toUpperCase() as 'NDVI' | 'NDWI' | 'NDBI',
    mean: Math.round(mean * 10000) / 10000,
    positivePct: Math.round(positivePct * 100) / 100,
    threshold,
    method,
    areaHectares: Math.round(areaHectares * 100) / 100,
    colormapDataUrl,
    array,
    width,
    height,
  };
}

export function extractBandsFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): RasterScene['bands'] {
  const len = width * height;
  const b02 = new Float32Array(len);
  const b03 = new Float32Array(len);
  const b04 = new Float32Array(len);
  const b08 = new Float32Array(len);
  const b11 = new Float32Array(len);

  for (let i = 0; i < len; i++) {
    const idx = i * 4;
    const r = rgba[idx] / 255.0;
    const g = rgba[idx + 1] / 255.0;
    const b = rgba[idx + 2] / 255.0;

    b02[i] = b;
    b03[i] = g;
    b04[i] = r;
    // Proxy NIR from green & spectral vegetation response
    b08[i] = Math.min(1.0, g * 1.25);
    // Proxy SWIR from red & blue soil/mineral reflectance
    b11[i] = Math.min(1.0, r * 0.85 + b * 0.15);
  }

  return {
    B02: b02,
    B03: b03,
    B04: b04,
    B08: b08,
    B11: b11,
  };
}
