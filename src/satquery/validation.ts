import { RasterScene } from '../types';

export interface SpatialValidationReport {
  valid: boolean;
  warnings: string[];
  errors: string[];
  georeferenced: boolean;
  crs: string | null;
  acquisitionDate?: string;
  cloudPct?: number;
  bandSource: string;
  pair?: {
    georeferenced: boolean;
    crs: string | null;
    acquisitionDate?: string;
    cloudPct?: number;
    bandSource: string;
  };
  crsMatch?: boolean;
  spatialOverlap?: boolean;
  overlapRatio?: number;
  dimensionMatch?: boolean;
  dateDeltaDays?: number;
}

export function validateSpatialExtent(
  sceneA: RasterScene,
  sceneB?: RasterScene | null,
  maxCloudPct = 40.0
): SpatialValidationReport {
  const warnings: string[] = [];
  const errors: string[] = [];

  const georeferencedA = !!(sceneA.crs && sceneA.bounds);

  if (sceneA.cloudPct !== undefined && sceneA.cloudPct > maxCloudPct) {
    warnings.push(`Scene A cloud cover ${sceneA.cloudPct.toFixed(1)}% exceeds threshold of ${maxCloudPct}%.`);
  }

  if (!sceneB) {
    if (!georeferencedA) {
      warnings.push('Scene is not georeferenced; area calculation uses assumed 10m Sentinel-2 GSD.');
    }
    return {
      valid: errors.length === 0,
      warnings,
      errors,
      georeferenced: georeferencedA,
      crs: sceneA.crs || null,
      acquisitionDate: sceneA.acquisitionDate,
      cloudPct: sceneA.cloudPct,
      bandSource: sceneA.bandSource,
    };
  }

  const georeferencedB = !!(sceneB.crs && sceneB.bounds);

  const report: SpatialValidationReport = {
    valid: true,
    warnings,
    errors,
    georeferenced: georeferencedA,
    crs: sceneA.crs || null,
    acquisitionDate: sceneA.acquisitionDate,
    cloudPct: sceneA.cloudPct,
    bandSource: sceneA.bandSource,
    pair: {
      georeferenced: georeferencedB,
      crs: sceneB.crs || null,
      acquisitionDate: sceneB.acquisitionDate,
      cloudPct: sceneB.cloudPct,
      bandSource: sceneB.bandSource,
    },
  };

  if (georeferencedA && georeferencedB) {
    const crsMatch = sceneA.crs === sceneB.crs;
    report.crsMatch = crsMatch;
    if (!crsMatch) {
      errors.push(`CRS mismatch: ${sceneA.crs} vs ${sceneB.crs}`);
    }

    if (sceneA.bounds && sceneB.bounds) {
      const a = sceneA.bounds;
      const b = sceneB.bounds;
      const overlap = !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
      report.spatialOverlap = overlap;

      const x0 = Math.max(a[0], b[0]);
      const y0 = Math.max(a[1], b[1]);
      const x1 = Math.min(a[2], b[2]);
      const y1 = Math.min(a[3], b[3]);
      const interArea = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
      const areaA = Math.max(1e-9, (a[2] - a[0]) * (a[3] - a[1]));
      const ratio = interArea / areaA;
      report.overlapRatio = Math.round(ratio * 10000) / 10000;

      if (!overlap) {
        errors.push('Spatial extents of the two scenes do not overlap.');
      } else if (ratio < 0.5) {
        warnings.push(`Only ${(ratio * 100).toFixed(0)}% of Scene A overlaps Scene B.`);
      }
    }
  } else {
    warnings.push('Pair is not fully georeferenced; skipping strict CRS/bounds verification.');
    const sizeOk =
      Math.abs(sceneA.width - sceneB.width) < 4 &&
      Math.abs(sceneA.height - sceneB.height) < 4;
    report.dimensionMatch = sizeOk;
    if (!sizeOk) {
      warnings.push('Raster dimensions differ slightly; change metrics will be resampled.');
    }
  }

  if (sceneA.acquisitionDate && sceneB.acquisitionDate) {
    const da = new Date(sceneA.acquisitionDate).getTime();
    const db = new Date(sceneB.acquisitionDate).getTime();
    if (!isNaN(da) && !isNaN(db)) {
      const deltaDays = Math.round(Math.abs(db - da) / (1000 * 60 * 60 * 24));
      report.dateDeltaDays = deltaDays;
      if (deltaDays === 0) {
        warnings.push('Acquisition dates are identical; detected temporal change may be noise.');
      } else if (deltaDays > 365 * 3) {
        warnings.push(`Acquisitions are ${deltaDays} days apart; phenology/seasonality will dominate.`);
      }
    }
  } else {
    warnings.push('Acquisition dates missing; temporal alignment not enforced.');
  }

  if (sceneB.cloudPct !== undefined && sceneB.cloudPct > maxCloudPct) {
    warnings.push(`Scene B cloud cover ${sceneB.cloudPct.toFixed(1)}% exceeds ${maxCloudPct}%.`);
  }

  report.valid = errors.length === 0;
  return report;
}
