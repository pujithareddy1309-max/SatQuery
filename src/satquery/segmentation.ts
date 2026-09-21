import { BoundingBox, CoverageEntry, MaskData, MasksMap, RasterScene } from '../types';
import { computeNdvi, computeNdwi, computeNdbi } from './indices';

export const COLOR_MAP: Record<string, [number, number, number]> = {
  water: [30, 90, 220],
  vegetation: [40, 170, 70],
  'built-up': [210, 80, 50],
  flooding: [0, 140, 255],
  deforestation: [180, 40, 20],
  construction: [240, 180, 40],
  crop_evolution: [180, 220, 60],
  vegetation_loss: [220, 50, 40],
  vegetation_gain: [50, 200, 80],
};

/**
 * 3x3 Morphological opening (erosion followed by dilation)
 */
export function morphClean(mask: Uint8Array, width: number, height: number): Uint8Array {
  const eroded = new Uint8Array(mask.length);
  // Erosion: all 3x3 neighbors must be 1
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      let allOn = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (mask[(y + dy) * width + (x + dx)] === 0) {
            allOn = false;
            break;
          }
        }
        if (!allOn) break;
      }
      eroded[idx] = allOn ? 1 : 0;
    }
  }

  // Dilation: any 3x3 neighbor is 1
  const dilated = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      let anyOn = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (eroded[(y + dy) * width + (x + dx)] === 1) {
            anyOn = true;
            break;
          }
        }
        if (anyOn) break;
      }
      dilated[idx] = anyOn ? 1 : 0;
    }
  }

  return dilated;
}

export function generateSpectralMasks(scene: RasterScene): MasksMap {
  const { width, height, bands } = scene;
  const len = width * height;

  const ndviArr = computeNdvi(bands.B08, bands.B04);
  const ndwiArr = computeNdwi(bands.B03, bands.B08);
  const ndbiArr = computeNdbi(bands.B11, bands.B08);

  const rawWater = new Uint8Array(len);
  const rawVeg = new Uint8Array(len);
  const rawBuilt = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    const isWater = ndwiArr[i] > 0.0;
    const isVeg = ndviArr[i] > 0.2;
    const isBuilt = ndbiArr[i] > 0.1;

    rawWater[i] = isWater ? 1 : 0;
    rawVeg[i] = isVeg && !isWater ? 1 : 0;
    rawBuilt[i] = isBuilt && !isWater && !isVeg ? 1 : 0;
  }

  const cleanWater = morphClean(rawWater, width, height);
  const cleanVeg = morphClean(rawVeg, width, height);
  const cleanBuilt = morphClean(rawBuilt, width, height);

  return {
    water: { width, height, data: cleanWater },
    vegetation: { width, height, data: cleanVeg },
    'built-up': { width, height, data: cleanBuilt },
  };
}

/**
 * Extract connected component bounding boxes for visual evidence
 */
export function extractBoundingBoxes(
  masks: MasksMap,
  targetWidth: number,
  targetHeight: number
): BoundingBox[] {
  const boxes: BoundingBox[] = [];

  for (const [label, maskObj] of Object.entries(masks)) {
    const { width, height, data } = maskObj;
    const visited = new Uint8Array(data.length);
    const minPixelCount = Math.max(25, Math.floor((width * height) / 1000));

    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const idx = y * width + x;
        if (data[idx] === 1 && visited[idx] === 0) {
          // BFS find cluster bounds
          let minX = x,
            maxX = x,
            minY = y,
            maxY = y,
            count = 0;
          const queue = [idx];
          visited[idx] = 1;

          while (queue.length > 0 && count < 8000) {
            const curr = queue.pop()!;
            const cy = Math.floor(curr / width);
            const cx = curr % width;
            count++;

            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;

            // Check 4-way neighbors
            const neighbors = [
              curr - 1,
              curr + 1,
              curr - width,
              curr + width,
            ];

            for (const n of neighbors) {
              if (n >= 0 && n < data.length && data[n] === 1 && visited[n] === 0) {
                visited[n] = 1;
                queue.push(n);
              }
            }
          }

          if (count >= minPixelCount) {
            // Scale to target size
            const sx = targetWidth / width;
            const sy = targetHeight / height;
            boxes.push({
              box: [
                Math.round(minX * sx),
                Math.round(minY * sy),
                Math.round(maxX * sx),
                Math.round(maxY * sy),
              ],
              label,
            });
          }
        }
      }
    }
  }

  // Sort by size and take top 12 representative regions
  return boxes
    .sort((a, b) => {
      const areaA = (a.box[2] - a.box[0]) * (a.box[3] - a.box[1]);
      const areaB = (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]);
      return areaB - areaA;
    })
    .slice(0, 12);
}

export function computeCoverageEntries(
  scene: RasterScene,
  masks: MasksMap
): CoverageEntry[] {
  const { pixelSizeM } = scene;
  const pxAreaM2 = pixelSizeM ? pixelSizeM[0] * pixelSizeM[1] : 100.0;
  const entries: CoverageEntry[] = [];

  for (const [name, maskObj] of Object.entries(masks)) {
    const { data } = maskObj;
    let count = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > 0) count++;
    }

    const pct = data.length > 0 ? (count / data.length) * 100 : 0;
    const m2 = count * pxAreaM2;
    const ha = m2 / 10000.0;
    const rgb = COLOR_MAP[name] || [160, 160, 160];

    entries.push({
      class: name.replace('_', ' '),
      percentage: Math.round(pct * 10) / 10,
      pixels: count,
      squareMeters: Math.round(m2),
      hectares: Math.round(ha * 100) / 100,
      color: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
    });
  }

  return entries.sort((a, b) => b.percentage - a.percentage);
}

export function renderAnnotatedImage(
  scene: RasterScene,
  masks: MasksMap,
  boxes: BoundingBox[],
  options: {
    showMasks?: boolean;
    showBoxes?: boolean;
    opacity?: number;
    activeClasses?: Set<string>;
  } = {}
): string {
  const {
    showMasks = true,
    showBoxes = true,
    opacity = 0.45,
    activeClasses = null,
  } = options;

  const canvas = document.createElement('canvas');
  canvas.width = scene.width;
  canvas.height = scene.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Base RGB
  const imgData = ctx.createImageData(scene.width, scene.height);
  imgData.data.set(scene.rgbData);

  if (showMasks) {
    const data = imgData.data;
    for (const [name, maskObj] of Object.entries(masks)) {
      if (activeClasses && !activeClasses.has(name)) continue;

      const color = COLOR_MAP[name] || [200, 200, 200];
      const maskData = maskObj.data;

      for (let i = 0; i < maskData.length; i++) {
        if (maskData[i] > 0) {
          const idx = i * 4;
          data[idx] = Math.round(data[idx] * (1 - opacity) + color[0] * opacity);
          data[idx + 1] = Math.round(data[idx + 1] * (1 - opacity) + color[1] * opacity);
          data[idx + 2] = Math.round(data[idx + 2] * (1 - opacity) + color[2] * opacity);
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Overlay bounding boxes if enabled
  if (showBoxes && boxes.length > 0) {
    ctx.lineWidth = 2;
    ctx.font = 'bold 12px "JetBrains Mono", monospace';

    for (const b of boxes) {
      if (activeClasses && !activeClasses.has(b.label)) continue;

      const [x1, y1, x2, y2] = b.box;
      const w = x2 - x1;
      const h = y2 - y1;
      const colorArr = COLOR_MAP[b.label] || [255, 255, 255];
      const strokeStyle = `rgb(${colorArr[0]}, ${colorArr[1]}, ${colorArr[2]})`;

      ctx.strokeStyle = strokeStyle;
      ctx.fillStyle = `rgba(${colorArr[0]}, ${colorArr[1]}, ${colorArr[2]}, 0.15)`;
      ctx.strokeRect(x1, y1, w, h);
      ctx.fillRect(x1, y1, w, h);

      // Label badge
      const labelText = b.label.replace('_', ' ');
      const textWidth = ctx.measureText(labelText).width;
      ctx.fillStyle = strokeStyle;
      ctx.fillRect(x1, Math.max(0, y1 - 18), textWidth + 8, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, x1 + 4, Math.max(13, y1 - 4));
    }
  }

  return canvas.toDataURL('image/png');
}
