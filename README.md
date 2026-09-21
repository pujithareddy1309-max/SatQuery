# SatQuery AI — Remote-Sensing Vision-Language Assistant

Autonomous remote-sensing assistant for Sentinel-2 indices, pixel-level coverage, semantic change, optical-SAR fusion, and geospatial vector export.

## Features

- **Sentinel-2 Indices**: NDVI (Vegetation), NDWI (Water), and NDBI (Built-up) with colormaps and coverage statistics.
- **Pixel-Level Segmentation**: Morphologically cleaned masks for water bodies, vegetation canopies, and built-up infrastructure.
- **Bi-Temporal Semantic Change**: Classifies flooding inundation, deforestation, construction, and crop evolution between acquisitions.
- **Optical–SAR Fusion**: Speckle-filtered Sentinel-1 radar backscatter fused with Sentinel-2 optical bands.
- **Pre-flight Spatial Validation**: CRS consistency, bounding box spatial overlap calculation, and acquisition delta verification.
- **GIS Export**: Standard GeoJSON FeatureCollection, Google Earth KML, and full `.zip` bundle with area metrics in hectares (10m Sentinel-2 GSD).
- **Autonomous Tool Execution Trace**: Structured planner logging intermediate tool invocations, parameters, and confidence scores.

## Operational Templates

- **Flood Risk**: NDWI t1/t2, inundation expansion mapping, and affected area in hectares.
- **Land Cover**: Water, vegetation canopy, and urban built-up spectral segmentation.
- **Change Detection**: Multi-class bi-temporal deforestation, construction, and flood changes.
- **Agriculture**: NDVI anomaly and vegetation vigor loss/gain tracking.
- **Optical–SAR Fusion**: Cross-modal microwave radar and optical composite.

## Development & Build

```bash
npm install
npm run dev
npm run build
```

