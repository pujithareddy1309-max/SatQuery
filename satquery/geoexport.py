"""Georeferenced area calculation and vector/raster export."""

from __future__ import annotations

import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

from satquery.raster import RasterScene


def pixel_area_m2(scene: RasterScene) -> float:
    if scene.pixel_size_m:
        return abs(scene.pixel_size_m[0] * scene.pixel_size_m[1])
    if scene.transform is not None:
        return abs(float(scene.transform.a) * float(scene.transform.e))
    return 100.0  # assumed Sentinel-2 10 m GSD


def mask_area(scene: RasterScene, mask: np.ndarray) -> dict:
    if mask.shape[:2] != (scene.height, scene.width) and scene.height and scene.width:
        from PIL import Image as PILImage

        mask = np.array(
            PILImage.fromarray((mask > 0).astype(np.uint8) * 255).resize((scene.width, scene.height), resample=0)
        )
    count = int((mask > 0).sum())
    m2 = count * pixel_area_m2(scene)
    return {
        "pixels": count,
        "square_meters": round(m2, 2),
        "hectares": round(m2 / 10000.0, 4),
        "assumed_gsd": not scene.georeferenced,
        "crs": str(scene.crs) if scene.crs else "EPSG:32633 (assumed for area only)",
    }


def _shapes(mask: np.ndarray, transform) -> list:
    import rasterio.features
    from rasterio.transform import Affine, from_origin

    if transform is None:
        transform = from_origin(0, mask.shape[0], 1, 1)
        if not isinstance(transform, Affine):
            pass
    geoms = []
    for geom, value in rasterio.features.shapes((mask > 0).astype(np.uint8), mask=(mask > 0), transform=transform):
        if value == 1:
            geoms.append(geom)
    return geoms


def _reproject_geoms(geoms: list, src_crs, dst_crs="EPSG:4326") -> list:
    if src_crs is None:
        return geoms
    try:
        from rasterio.warp import transform_geom

        return [transform_geom(src_crs, dst_crs, geom) for geom in geoms]
    except Exception:
        return geoms


def masks_to_geojson(scene: RasterScene, masks: dict[str, np.ndarray], extra_props: dict | None = None) -> dict:
    features = []
    for label, mask in masks.items():
        geoms = _shapes(mask, scene.transform)
        geoms = _reproject_geoms(geoms, scene.crs)
        area = mask_area(scene, mask)
        for geom in geoms:
            props = {
                "class": label,
                "hectares": area["hectares"],
                "square_meters": area["square_meters"],
                "crs_source": str(scene.crs) if scene.crs else None,
            }
            if extra_props:
                props.update(extra_props)
            features.append({"type": "Feature", "geometry": geom, "properties": props})
    return {"type": "FeatureCollection", "features": features}


def geojson_to_kml(fc: dict) -> str:
    def ring_to_coords(ring):
        return " ".join(f"{x},{y},0" for x, y in ring)

    chunks = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
    ]
    for feat in fc.get("features", []):
        geom = feat.get("geometry") or {}
        props = feat.get("properties") or {}
        name = props.get("class", "region")
        chunks.append(f"<Placemark><name>{name}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>")
        coords = geom.get("coordinates") or []
        if geom.get("type") == "Polygon" and coords:
            chunks.append(ring_to_coords(coords[0]))
        elif geom.get("type") == "MultiPolygon" and coords:
            chunks.append(ring_to_coords(coords[0][0]))
        chunks.append("</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>")
    chunks.append("</Document></kml>")
    return "\n".join(chunks)


def write_shapefile(fc: dict, shp_path: Path) -> Path | None:
    try:
        import shapefile
    except ImportError:
        return None
    shp_path = Path(shp_path)
    writer = shapefile.Writer(str(shp_path.with_suffix("")))
    writer.field("class", "C", size=32)
    writer.field("hectares", "N", decimal=4)
    for feat in fc.get("features", []):
        geom = feat.get("geometry") or {}
        props = feat.get("properties") or {}
        coords = geom.get("coordinates")
        if not coords:
            continue
        if geom.get("type") == "Polygon":
            writer.poly(coords)
        elif geom.get("type") == "MultiPolygon":
            writer.poly(coords[0])
        else:
            continue
        writer.record(props.get("class", ""), float(props.get("hectares") or 0))
    writer.close()
    return shp_path.with_suffix(".shp")


def write_geotiff_mask(scene: RasterScene, mask: np.ndarray, path: Path, class_name: str) -> Path:
    import rasterio
    from rasterio.transform import from_origin

    path = Path(path)
    transform = scene.transform or from_origin(0, mask.shape[0], scene.pixel_size_m[0] if scene.pixel_size_m else 10, scene.pixel_size_m[1] if scene.pixel_size_m else 10)
    crs = scene.crs or "EPSG:32633"
    data = (mask > 0).astype(np.uint8)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=data.shape[0],
        width=data.shape[1],
        count=1,
        dtype="uint8",
        crs=crs,
        transform=transform,
        compress="lzw",
    ) as dst:
        dst.write(data, 1)
        dst.update_tags(CLASS=class_name)
    return path


def export_bundle(scene: RasterScene, masks: dict[str, np.ndarray], out_dir: str | Path) -> dict:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    out = Path(out_dir) / f"satquery_{stamp}"
    out.mkdir(parents=True, exist_ok=True)
    fc = masks_to_geojson(scene, masks)
    geojson_path = out / "regions.geojson"
    kml_path = out / "regions.kml"
    geojson_path.write_text(json.dumps(fc), encoding="utf-8")
    kml_path.write_text(geojson_to_kml(fc), encoding="utf-8")
    shp = write_shapefile(fc, out / "regions.shp")
    mask_paths = []
    for name, mask in masks.items():
        tif = write_geotiff_mask(scene, mask, out / f"{name}.tif", name)
        mask_paths.append(str(tif))
    zip_path = out / "satquery_export.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in out.iterdir():
            if file.suffix == ".zip":
                continue
            zf.write(file, file.name)
    areas = {name: mask_area(scene, mask) for name, mask in masks.items()}
    return {
        "directory": str(out),
        "geojson": str(geojson_path),
        "kml": str(kml_path),
        "shapefile": str(shp) if shp else None,
        "masks": mask_paths,
        "zip": str(zip_path),
        "areas": areas,
        "feature_count": len(fc["features"]),
    }
