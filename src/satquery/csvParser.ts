import { BatchCoordinateItem, BatchItemResult, BatchSummaryExport, OperationalTemplate } from '../types';

/**
 * Splits a single CSV line honoring double quotes.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === ',' || char === ';' || char === '\t') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses CSV text containing coordinate sets and bi-temporal parameters.
 */
export function parseCoordinatesCSV(csvText: string): {
  items: BatchCoordinateItem[];
  errors: string[];
} {
  const items: BatchCoordinateItem[] = [];
  const errors: string[] = [];

  const rawLines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

  if (rawLines.length === 0) {
    return { items: [], errors: ['CSV content is empty or contains only comments.'] };
  }

  // Parse header
  const firstRow = parseCSVLine(rawLines[0]);
  const lowerHeader = firstRow.map((h) => h.toLowerCase().replace(/[\s_-]+/g, ''));

  let latIdx = lowerHeader.findIndex((h) => ['lat', 'latitude', 'y', 'geolat'].includes(h));
  let lonIdx = lowerHeader.findIndex((h) => ['lon', 'lng', 'long', 'longitude', 'x', 'geolon'].includes(h));
  let coordsIdx = lowerHeader.findIndex((h) => ['coord', 'coords', 'coordinates', 'coordinate', 'locationcoords'].includes(h));
  let nameIdx = lowerHeader.findIndex((h) => ['name', 'label', 'location', 'site', 'description', 'address', 'place', 'target'].includes(h));
  let t1Idx = lowerHeader.findIndex((h) => ['t1', 't1date', 'date1', 'baselinedate', 'startdate'].includes(h));
  let t2Idx = lowerHeader.findIndex((h) => ['t2', 't2date', 'date2', 'comparisondate', 'enddate'].includes(h));
  let layerIdx = lowerHeader.findIndex((h) => ['layer', 'sensor', 'mode', 'satellitelayer', 'sensormode'].includes(h));
  let templateIdx = lowerHeader.findIndex((h) => ['template', 'task', 'mode', 'analysismode', 'analysistype'].includes(h));

  let startRowIdx = 1;

  // If no identifiable header, check if row 0 is already raw coordinates (e.g. 37.422, -122.084)
  if (latIdx === -1 && lonIdx === -1 && coordsIdx === -1) {
    const num0 = parseFloat(firstRow[0]);
    const num1 = parseFloat(firstRow[1]);
    if (!isNaN(num0) && !isNaN(num1) && Math.abs(num0) <= 90 && Math.abs(num1) <= 180) {
      latIdx = 0;
      lonIdx = 1;
      nameIdx = firstRow.length > 2 ? 2 : -1;
      startRowIdx = 0;
    } else {
      errors.push(
        'Could not detect "lat" and "lon" or "coordinates" headers. Expecting headers like: lat, lon, name, t1_date, t2_date, layer'
      );
      return { items: [], errors };
    }
  }

  for (let i = startRowIdx; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line) continue;
    const cells = parseCSVLine(line);

    let lat: number | null = null;
    let lon: number | null = null;

    // Check individual lat / lon columns
    if (latIdx !== -1 && lonIdx !== -1 && cells[latIdx] !== undefined && cells[lonIdx] !== undefined) {
      const pLat = parseFloat(cells[latIdx]);
      const pLon = parseFloat(cells[lonIdx]);
      if (!isNaN(pLat) && !isNaN(pLon)) {
        lat = pLat;
        lon = pLon;
      }
    }

    // Check combined coords column if lat/lon not found
    if ((lat === null || lon === null) && coordsIdx !== -1 && cells[coordsIdx]) {
      const combo = cells[coordsIdx].replace(/[()]/g, '');
      const parts = combo.split(/[,;\s]+/).map((s) => parseFloat(s.trim()));
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        lat = parts[0];
        lon = parts[1];
      }
    }

    if (lat === null || lon === null) {
      errors.push(`Row ${i + 1}: Unable to parse valid latitude and longitude.`);
      continue;
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      errors.push(`Row ${i + 1}: Coordinates out of bounds (lat: ${lat}, lon: ${lon}). Lat must be [-90, 90], Lon [-180, 180].`);
      continue;
    }

    const defaultName = `AOI Target (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`;
    const name = nameIdx !== -1 && cells[nameIdx] ? cells[nameIdx] : defaultName;
    const t1Date = t1Idx !== -1 && cells[t1Idx] && /^\d{4}-\d{2}-\d{2}$/.test(cells[t1Idx]) ? cells[t1Idx] : '2023-08-15';
    const t2Date = t2Idx !== -1 && cells[t2Idx] && /^\d{4}-\d{2}-\d{2}$/.test(cells[t2Idx]) ? cells[t2Idx] : '2024-04-20';

    let layer: 'osiris-optical' | 'osiris-sar' | 'osiris-ndwi' | 'google-maps' = 'osiris-optical';
    if (layerIdx !== -1 && cells[layerIdx]) {
      const lStr = cells[layerIdx].toLowerCase();
      if (lStr.includes('sar') || lStr.includes('radar')) layer = 'osiris-sar';
      else if (lStr.includes('ndwi') || lStr.includes('water')) layer = 'osiris-ndwi';
      else if (lStr.includes('map') || lStr.includes('google')) layer = 'google-maps';
    }

    let template: OperationalTemplate = 'change';
    if (templateIdx !== -1 && cells[templateIdx]) {
      const tStr = cells[templateIdx].toLowerCase();
      if (tStr.includes('disaster') || tStr.includes('flood')) template = 'disaster';
      else if (tStr.includes('landcover') || tStr.includes('cover')) template = 'landcover';
      else if (tStr.includes('agri') || tStr.includes('ndvi')) template = 'agriculture';
    }

    items.push({
      id: `batch_${Date.now()}_${i}_${Math.floor(Math.random() * 1000)}`,
      lat,
      lon,
      name,
      t1Date,
      t2Date,
      layer,
      template,
      status: 'pending',
    });
  }

  return { items, errors };
}

/**
 * Returns a ready-to-test sample CSV string with diverse real-world locations.
 */
export function generateSampleCSV(): string {
  return `name,lat,lon,t1_date,t2_date,layer,template
"Lake Mead Reservoir, NV",36.1425,-114.7377,2023-08-15,2024-04-20,osiris-ndwi,disaster
"1600 Amphitheatre Pkwy, Mountain View, CA",37.4220,-122.0841,2023-07-01,2024-05-15,osiris-optical,change
"Suez Canal Maritime Corridor, Egypt",30.5852,32.2654,2023-09-10,2024-03-25,osiris-sar,change
"Miami Beach Coastal Perimeter, FL",25.7907,-80.1300,2023-06-15,2024-04-10,osiris-ndwi,disaster
"San Francisco Downtown Urban Grid, CA",37.7749,-122.4194,2023-08-01,2024-05-01,osiris-optical,landcover
"Dubai Marina Coastal Development, UAE",25.0805,55.1403,2023-05-12,2024-06-18,osiris-sar,change`;
}

/**
 * Converts processed batch items into a structured BatchSummaryExport object.
 */
export function exportBatchToJSON(
  batchItems: BatchCoordinateItem[],
  elapsedSeconds: number
): BatchSummaryExport {
  const completedResults: BatchItemResult[] = batchItems
    .filter((item) => item.status === 'completed' && item.result)
    .map((item) => item.result!);

  const failedCount = batchItems.filter((item) => item.status === 'error').length;
  const completedCount = completedResults.length;

  let totalHectaresAnalyzed = 0;
  let totalDaysDelta = 0;
  let netVegShift = 0;
  let netWaterShift = 0;
  let netBuiltUpShift = 0;
  const dominantChangesCount: Record<string, number> = {};

  for (const r of completedResults) {
    totalHectaresAnalyzed += r.totalHectares || 0;
    totalDaysDelta += r.daysDelta || 0;

    const dom = r.dominantChange || 'Surface Spectral Shift';
    dominantChangesCount[dom] = (dominantChangesCount[dom] || 0) + 1;

    for (const cov of r.coverageChanges || []) {
      const cName = cov.className.toLowerCase();
      if (cName.includes('vegetation')) {
        netVegShift += cov.deltaHectares || 0;
      } else if (cName.includes('water')) {
        netWaterShift += cov.deltaHectares || 0;
      } else if (cName.includes('built')) {
        netBuiltUpShift += cov.deltaHectares || 0;
      }
    }
  }

  const averageDaysDelta = completedCount > 0 ? Math.round(totalDaysDelta / completedCount) : 0;

  return {
    exportVersion: 'SatQuery-OSIRIS-Batch-v2.0',
    exportTimestamp: new Date().toISOString(),
    batchId: `batch_${Date.now()}`,
    metadata: {
      totalItems: batchItems.length,
      completedItems: completedCount,
      failedItems: failedCount,
      elapsedSeconds: +elapsedSeconds.toFixed(2),
      pipeline: 'SatQuery Remote-Sensing Vision-Language Bi-Temporal Agent (gemini-3.8 / OSIRIS)',
      satelliteConstellation: 'Sentinel-2 MSI Optical (10m) + Sentinel-1 SAR Radar (C-Band)',
      spatialResolutionM: 10,
      aggregateAnalysis: {
        totalHectaresAnalyzed: +totalHectaresAnalyzed.toFixed(2),
        averageDaysDelta,
        dominantChangesCount,
        netVegetationShiftHectares: +netVegShift.toFixed(2),
        netWaterShiftHectares: +netWaterShift.toFixed(2),
        netBuiltUpShiftHectares: +netBuiltUpShift.toFixed(2),
      },
    },
    results: completedResults,
  };
}

/**
 * Triggers a browser download of a JSON object.
 */
export function downloadJSONFile(data: any, filename: string): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
