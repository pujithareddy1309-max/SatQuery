# SatQuery AI — Remote-sensing vision-language assistant

Agentic optical/SAR analysis: Sentinel-2 indices, pixel-level coverage, semantic change, spatial validation, and geospatial export.

## Setup

```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```
python app.py
```

Optional:

| Variable | Effect |
| --- | --- |
| `SATQUERY_LLM_API_KEY` / `OPENAI_API_KEY` | LLM function-calling planner |
| `SATQUERY_ENABLE_VLM=1` | Qwen2-VL for free-form multi-image VQA |
| `SATQUERY_ENABLE_CLIP=1` | Frozen CLIP optical encoder (else lightweight CNN) |
| `SATQUERY_ENABLE_SAM=1` | Optional SAM masks |
| `SATQUERY_SHARE=1` | Gradio public link |

## Architecture

```
satquery/
  indices.py        NDVI, NDWI, NDBI (S2 bands or RGB proxy)
  raster.py         MSI ingest, SCL/QA cloud mask
  validation.py     CRS, overlap, dates, cloud pre-flight
  fusion.py         frozen optical encoder + Lee SAR + cross-attention
  segmentation.py   pixel masks + coverage % (spectral / GrabCut / optional SAM)
  change.py         flood, deforestation, construction, crop evolution
  geoexport.py      GeoJSON, KML, shapefile, GeoTIFF masks, hectares
  agent.py          tool registry + autonomous call loop
```

Tools the agent can call: `calculate_ndvi`, `calculate_ndwi`, `calculate_ndbi`, `run_segmentation`, `validate_spatial_extent`, `export_geojson`, plus semantic change, NDVI anomaly, optical–SAR fusion, VQA, captioning, grounding.

## Operational templates (UI buttons)

- **Flood Risk** — NDWI t1/t2, flood class, area in ha, export
- **Land Cover** — water / vegetation / built-up coverage
- **Change Detection** — semantic change classes
- **Agriculture** — NDVI anomaly tracking
- **Optical–SAR Fusion** — speckle-aware SAR + optical cross-attention

PNG/JPEG uploads use an assumed 10 m GSD for area. Real Sentinel-2 GeoTIFFs (B02–B11 descriptions, EPSG) drive CRS-aware hectares and vector export.

## Tests

```
python test_router.py
python test_rs.py
```

## Adaptation proof (optional)

```
python finetune_adaptation.py
```
