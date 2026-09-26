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

/**
 * Generates co-registered bi-temporal raster scenes for a specific locked location,
 * matching T1 baseline and T2 comparison dates with OSIRIS data layer characteristics.
 */
export function generateBiTemporalLocationScenes(
  lat: number,
  lon: number,
  locationName: string,
  t1Date: string,
  t2Date: string,
  layer: 'google-maps' | 'osiris-optical' | 'osiris-sar' | 'osiris-ndwi' = 'osiris-optical'
): { scene1: RasterScene; scene2: RasterScene } {
  const width = 256;
  const height = 256;
  const len = width * height;

  const isSarLayer = layer === 'osiris-sar';
  const isWaterTheme = Math.abs(lat) < 30 || locationName.toLowerCase().includes('water') || locationName.toLowerCase().includes('canal') || locationName.toLowerCase().includes('beach') || locationName.toLowerCase().includes('lake');
  const isUrbanTheme = locationName.toLowerCase().includes('amphitheatre') || locationName.toLowerCase().includes('ave') || locationName.toLowerCase().includes('st') || locationName.toLowerCase().includes('san francisco') || locationName.toLowerCase().includes('york') || locationName.toLowerCase().includes('tokyo') || locationName.toLowerCase().includes('london');

  // Helper to generate a raster buffer with custom noise seed and temporal change
  const buildScene = (isT2: boolean, isSar: boolean): RasterScene => {
    const rgba = new Uint8ClampedArray(len * 4);
    const b02 = new Float32Array(len);
    const b03 = new Float32Array(len);
    const b04 = new Float32Array(len);
    const b08 = new Float32Array(len);
    const b11 = new Float32Array(len);

    let seed = Math.floor(Math.abs(lat * 1000) + Math.abs(lon * 1000)) + (isT2 ? 9999 : 1111);
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const cx = 128;
    const cy = 128;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const p = idx * 4;
        const noise = (random() - 0.5) * 0.08;
        const distFromCenter = Math.sqrt((x - cx) ** 2 + ((y - cy) * 1.2) ** 2);

        let r = 0.25;
        let g = 0.45;
        let b = 0.22;
        let nir = 0.65;
        let swir = 0.28;

        if (isSar) {
          // SAR Radar backscatter
          const radarNoise = (random() + random() + random()) / 3.0;
          let intensity = radarNoise * 0.4;
          if (isUrbanTheme && (x % 24 < 6 || y % 24 < 6)) {
            intensity = 0.75 + radarNoise * 0.25;
          }
          if (isT2 && x > 70 && x < 185 && y > 70 && y < 185) {
            intensity = 0.85 + radarNoise * 0.15; // New structural development or radar difference
          }
          r = intensity;
          g = intensity;
          b = intensity * 1.06;
          nir = intensity;
          swir = intensity;
        } else if (isWaterTheme) {
          // Water / Coastal / Lake with Inundation change
          const waterRadius = isT2 ? 92 : 60; // T2 reveals expanded water / flood inundation
          const isWater = distFromCenter < waterRadius + noise * 35;
          if (isWater) {
            r = 0.08 + noise * 0.04;
            g = 0.29 + noise * 0.05;
            b = 0.62 + noise * 0.07;
            nir = 0.03 + noise * 0.02;
            swir = 0.02 + noise * 0.01;
          } else {
            r = 0.26 + noise * 0.05;
            g = 0.54 + noise * 0.08;
            b = 0.20 + noise * 0.04;
            nir = 0.74 + noise * 0.1;
            swir = 0.24 + noise * 0.05;
          }
        } else if (isUrbanTheme) {
          // Urban development & infrastructure expansion
          const isRoad = (x % 32 < 4) || (y % 32 < 4);
          const inNewCluster = isT2 && x >= 70 && x <= 180 && y >= 70 && y <= 180;

          if (isRoad || inNewCluster) {
            r = 0.55 + noise * 0.08;
            g = 0.52 + noise * 0.08;
            b = 0.50 + noise * 0.07;
            nir = 0.32 + noise * 0.05;
            swir = 0.75 + noise * 0.1;
          } else {
            r = 0.28 + noise * 0.05;
            g = 0.50 + noise * 0.08;
            b = 0.24 + noise * 0.04;
            nir = 0.68 + noise * 0.09;
            swir = 0.32 + noise * 0.06;
          }
        } else {
          // Vegetation / Deforestation / Seasonal shift
          const inCleared = isT2 && x >= 65 && x <= 185 && y >= 65 && y <= 185;
          if (inCleared) {
            r = 0.46 + noise * 0.07;
            g = 0.36 + noise * 0.06;
            b = 0.24 + noise * 0.04;
            nir = 0.24 + noise * 0.05;
            swir = 0.68 + noise * 0.09;
          } else {
            r = 0.16 + noise * 0.04;
            g = 0.56 + noise * 0.08;
            b = 0.15 + noise * 0.03;
            nir = 0.84 + noise * 0.1;
            swir = 0.18 + noise * 0.04;
          }
        }

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

    const shortLoc = locationName.split(',')[0].trim();
    const zoneNum = Math.floor((lon + 180) / 6) + 1;
    const crs = `EPSG:${lat >= 0 ? 32600 + zoneNum : 32700 + zoneNum}`;

    return {
      id: `loc_${isT2 ? 't2' : 't1'}_${Date.now()}`,
      name: isT2
        ? `${shortLoc} — OSIRIS ${isSar ? 'Sentinel-1 SAR' : 'Sentinel-2 MSI'} (T2: ${t2Date})`
        : `${shortLoc} — OSIRIS Sentinel-2 MSI Optical (T1: ${t1Date})`,
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
      crs,
      bounds: [
        +(lon - 0.012).toFixed(5),
        +(lat - 0.012).toFixed(5),
        +(lon + 0.012).toFixed(5),
        +(lat + 0.012).toFixed(5),
      ],
      pixelSizeM: [10, 10],
      acquisitionDate: isT2 ? t2Date : t1Date,
      cloudPct: isT2 ? 1.8 : 3.2,
      bandSource: 'sentinel2-msi',
      isSar: isT2 && isSar,
    };
  };

  return {
    scene1: buildScene(false, false),
    scene2: buildScene(true, isSarLayer),
  };
}
