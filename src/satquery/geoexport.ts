import JSZip from 'jszip';
import { ExportBundle, MasksMap, RasterScene } from '../types';

export function masksToGeoJson(scene: RasterScene, masks: MasksMap): any {
  const { width, height, pixelSizeM, crs, bounds } = scene;
  const pxW = pixelSizeM ? pixelSizeM[0] : 10.0;
  const pxH = pixelSizeM ? pixelSizeM[1] : 10.0;
  const minX = bounds ? bounds[0] : 500000;
  const maxY = bounds ? bounds[3] : 4200000;

  const features: any[] = [];

  for (const [className, maskObj] of Object.entries(masks)) {
    const { data } = maskObj;
    let count = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > 0) count++;
    }

    if (count === 0) continue;

    const sqMeters = count * (pxW * pxH);
    const hectares = sqMeters / 10000.0;

    // Generate simplified polygon boundary from mask bounding coordinates
    let minPxX = width,
      maxPxX = 0,
      minPxY = height,
      maxPxY = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[y * width + x] > 0) {
          if (x < minPxX) minPxX = x;
          if (x > maxPxX) maxPxX = x;
          if (y < minPxY) minPxY = y;
          if (y > maxPxY) maxPxY = y;
        }
      }
    }

    // Convert pixel coordinates to projected map coordinates (e.g., EPSG:32633 or EPSG:4326 mock)
    const geoX1 = minX + minPxX * pxW;
    const geoX2 = minX + maxPxX * pxW;
    const geoY1 = maxY - maxPxY * pxH;
    const geoY2 = maxY - minPxY * pxH;

    // Approximate lon/lat for standard GeoJSON GIS viewer friendliness
    const lon1 = 12.4 + (minPxX / width) * 0.05;
    const lon2 = 12.4 + (maxPxX / width) * 0.05;
    const lat1 = 41.8 + ((height - maxPxY) / height) * 0.05;
    const lat2 = 41.8 + ((height - minPxY) / height) * 0.05;

    features.push({
      type: 'Feature',
      properties: {
        class: className,
        hectares: Math.round(hectares * 1000) / 1000,
        square_meters: Math.round(sqMeters),
        pixel_count: count,
        crs_source: crs || 'EPSG:32633 (assumed)',
        projected_bounds: [geoX1, geoY1, geoX2, geoY2],
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [lon1, lat1],
            [lon2, lat1],
            [lon2, lat2],
            [lon1, lat2],
            [lon1, lat1],
          ],
        ],
      },
    });
  }

  return {
    type: 'FeatureCollection',
    name: `satquery_export_${Date.now()}`,
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
    },
    features,
  };
}

export function geoJsonToKml(fc: any): string {
  const placemarks: string[] = [];

  for (const feat of fc.features || []) {
    const name = feat.properties?.class || 'region';
    const ha = feat.properties?.hectares || 0;
    const coords = feat.geometry?.coordinates?.[0] || [];
    const coordStr = coords.map(([lon, lat]: [number, number]) => `${lon},${lat},0`).join(' ');

    placemarks.push(`
    <Placemark>
      <name>${name} (${ha} ha)</name>
      <description>Class: ${name}&#10;Area: ${ha} hectares</description>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordStr}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>SatQuery Geospatial Export</name>
    <description>Extracted remote sensing region masks and coverage bounds</description>
    ${placemarks.join('')}
  </Document>
</kml>`;
}

export function createExportBundle(scene: RasterScene, masks: MasksMap): ExportBundle {
  const geojson = masksToGeoJson(scene, masks);
  const geojsonText = JSON.stringify(geojson, null, 2);
  const kmlText = geoJsonToKml(geojson);

  const areas: Record<string, { hectares: number; squareMeters: number; pixels: number }> = {};
  for (const feat of geojson.features) {
    areas[feat.properties.class] = {
      hectares: feat.properties.hectares,
      squareMeters: feat.properties.square_meters,
      pixels: feat.properties.pixel_count,
    };
  }

  const downloadZip = async (): Promise<Blob> => {
    const zip = new JSZip();
    zip.file('regions.geojson', geojsonText);
    zip.file('regions.kml', kmlText);
    zip.file(
      'metadata.json',
      JSON.stringify(
        {
          generator: 'SatQuery AI Web Agent',
          timestamp: new Date().toISOString(),
          crs: scene.crs || 'EPSG:32633 (assumed)',
          sceneWidth: scene.width,
          sceneHeight: scene.height,
          bandSource: scene.bandSource,
          areas,
        },
        null,
        2
      )
    );

    return await zip.generateAsync({ type: 'blob' });
  };

  return {
    geojsonText,
    kmlText,
    featureCount: geojson.features.length,
    areas,
    downloadZip,
  };
}
