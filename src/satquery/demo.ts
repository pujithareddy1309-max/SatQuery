import { RasterScene } from '../types';

/**
 * Creates a synthetic Sentinel-2 style raster scene with matching RGB and multispectral bands.
 */
export function generateDemoScene(kind: 'water' | 'forest' | 'cleared' | 'flooded' | 'urban' | 'sar'): RasterScene {
  const width = 256;
  const height = 256;
  const len = width * height;

  const rgba = new Uint8ClampedArray(len * 4);
  const b02 = new Float32Array(len); // Blue
  const b03 = new Float32Array(len); // Green
  const b04 = new Float32Array(len); // Red
  const b08 = new Float32Array(len); // NIR
  const b11 = new Float32Array(len); // SWIR

  // Deterministic PRNG
  let seed = 42;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const cx = 128;
  const cy = 135;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const p = idx * 4;

      const noise = (random() - 0.5) * 0.08;
      const distFromCenter = Math.sqrt((x - cx) ** 2 + ((y - cy) * 1.5) ** 2);

      let r = 0.25;
      let g = 0.45;
      let b = 0.22;
      let nir = 0.65;
      let swir = 0.28;

      if (kind === 'water' || kind === 'flooded') {
        const waterRadius = kind === 'flooded' ? 85 : 55;
        const isLake = distFromCenter < waterRadius + noise * 40;

        if (isLake) {
          // Water spectral signature: absorption in NIR/SWIR, peak in Blue/Green
          r = 0.08 + noise * 0.04;
          g = 0.28 + noise * 0.05;
          b = 0.58 + noise * 0.08;
          nir = 0.04 + noise * 0.02;
          swir = 0.02 + noise * 0.01;
        } else {
          // Surrounding vegetation
          r = 0.22 + noise * 0.05;
          g = 0.52 + noise * 0.08;
          b = 0.18 + noise * 0.04;
          nir = 0.72 + noise * 0.1;
          swir = 0.25 + noise * 0.05;
        }
      } else if (kind === 'forest') {
        // Healthy continuous forest canopy
        r = 0.15 + noise * 0.04;
        g = 0.58 + noise * 0.08;
        b = 0.14 + noise * 0.03;
        nir = 0.85 + noise * 0.1;
        swir = 0.18 + noise * 0.04;
      } else if (kind === 'cleared') {
        // T2 deforestation: a prominent cleared rectangular block
        const inClearedPatch = x >= 60 && x <= 190 && y >= 60 && y <= 180;
        if (inClearedPatch) {
          // Bare soil / cleared logging signature: low NIR, higher Red and SWIR
          r = 0.48 + noise * 0.08;
          g = 0.38 + noise * 0.06;
          b = 0.25 + noise * 0.04;
          nir = 0.22 + noise * 0.05;
          swir = 0.65 + noise * 0.1;
        } else {
          // Remaining forest
          r = 0.16 + noise * 0.04;
          g = 0.56 + noise * 0.08;
          b = 0.14 + noise * 0.03;
          nir = 0.82 + noise * 0.1;
          swir = 0.19 + noise * 0.04;
        }
      } else if (kind === 'urban') {
        // Urban / Built-up grid layout
        const blockX = Math.floor(x / 32) % 2 === 0;
        const blockY = Math.floor(y / 32) % 2 === 0;
        const isRoad = (x % 32 < 4) || (y % 32 < 4);

        if (isRoad) {
          // Asphalt road
          r = 0.3 + noise * 0.04;
          g = 0.3 + noise * 0.04;
          b = 0.32 + noise * 0.04;
          nir = 0.28 + noise * 0.04;
          swir = 0.45 + noise * 0.05;
        } else if (blockX && blockY) {
          // Commercial/industrial rooftops: high SWIR/NDBI
          r = 0.62 + noise * 0.1;
          g = 0.58 + noise * 0.1;
          b = 0.55 + noise * 0.08;
          nir = 0.35 + noise * 0.05;
          swir = 0.78 + noise * 0.1;
        } else {
          // Suburban vegetation mix
          r = 0.32 + noise * 0.06;
          g = 0.48 + noise * 0.08;
          b = 0.28 + noise * 0.05;
          nir = 0.58 + noise * 0.08;
          swir = 0.42 + noise * 0.06;
        }
      } else if (kind === 'sar') {
        // Synthetic Aperture Radar (SAR) backscatter simulation
        // Speckle noise + strong corner reflectors from buildings + low return on calm water
        const radarNoise = (random() + random() + random()) / 3.0; // Multi-look speckle
        const isUrbanCluster = x > 80 && x < 180 && y > 80 && y < 180 && (x + y) % 8 < 3;

        let intensity = radarNoise * 0.35;
        if (isUrbanCluster) {
          // Double-bounce high backscatter
          intensity = Math.min(1.0, 0.75 + radarNoise * 0.3);
        }

        r = intensity;
        g = intensity;
        b = intensity * 1.05; // Slight radar cyan hue
        nir = intensity;
        swir = intensity;
      }

      // Clamp
      const cr = Math.max(0, Math.min(1, r));
      const cg = Math.max(0, Math.min(1, g));
      const cb = Math.max(0, Math.min(1, b));

      rgba[p] = Math.round(cr * 255);
      rgba[p + 1] = Math.round(cg * 255);
      rgba[p + 2] = Math.round(cb * 255);
      rgba[p + 3] = 255;

      b02[idx] = cb;
      b03[idx] = cg;
      b04[idx] = cr;
      b08[idx] = Math.max(0, Math.min(1, nir));
      b11[idx] = Math.max(0, Math.min(1, swir));
    }
  }

  const names: Record<string, string> = {
    water: 'Sentinel-2 Water Body Tile (Lake / Reservoir)',
    forest: 'Sentinel-2 Vegetation Canopy (Acquisition Date: 2024-04-01)',
    cleared: 'Sentinel-2 Cleared / Deforested Patch (Acquisition Date: 2024-10-12)',
    flooded: 'Sentinel-2 Inundated / Flooded Extent (Acquisition Date: 2024-10-12)',
    urban: 'Sentinel-2 Urban / Built-up Mixed Extent',
    sar: 'Sentinel-1 C-band SAR Backscatter Co-registered Tile',
  };

  const dates: Record<string, string> = {
    water: '2024-06-15',
    forest: '2024-04-01',
    cleared: '2024-10-12',
    flooded: '2024-10-12',
    urban: '2024-05-20',
    sar: '2024-05-20',
  };

  return {
    id: `demo_${kind}`,
    name: names[kind],
    width,
    height,
    rgbData: rgba,
    bands: {
      B02: b02,
      B03: b03,
      B04: b04,
      B08: b08,
      B11: b11,
    },
    crs: 'EPSG:32633',
    bounds: [500000, 4200000, 502560, 4202560],
    pixelSizeM: [10, 10],
    acquisitionDate: dates[kind],
    cloudPct: kind === 'forest' ? 2.4 : 4.8,
    bandSource: 'sentinel2-msi',
    isSar: kind === 'sar',
  };
}

export function sceneToDataUrl(scene: RasterScene): string {
  const canvas = document.createElement('canvas');
  canvas.width = scene.width;
  canvas.height = scene.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imgData = ctx.createImageData(scene.width, scene.height);
  imgData.data.set(scene.rgbData);
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}
