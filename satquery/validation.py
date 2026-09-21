"""Pre-flight geospatial validation: CRS, overlap, dates, cloud cover."""

from __future__ import annotations

from datetime import datetime

from satquery.raster import RasterScene, load_scene_from_path, scene_from_pil


def _parse_iso(date_str: str | None):
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(str(date_str)[:10])
    except ValueError:
        return None


def _bounds_overlap(a, b) -> bool:
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def _overlap_ratio(a, b) -> float:
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    area_a = max(1e-9, (a[2] - a[0]) * (a[3] - a[1]))
    return float(inter / area_a)


def validate_spatial_extent(scene_a: RasterScene, scene_b: RasterScene | None = None, max_cloud_pct: float = 40.0) -> dict:
    report = {
        "valid": True,
        "warnings": [],
        "errors": [],
        "georeferenced": scene_a.georeferenced,
        "crs": str(scene_a.crs) if scene_a.crs else None,
        "acquisition_date": scene_a.acquisition_date,
        "cloud_pct": scene_a.cloud_pct,
        "band_source": scene_a.band_source,
    }

    if scene_a.cloud_pct is not None and scene_a.cloud_pct > max_cloud_pct:
        report["warnings"].append(f"Scene A cloud cover {scene_a.cloud_pct:.1f}% exceeds {max_cloud_pct}%.")

    if scene_b is None:
        if not scene_a.georeferenced:
            report["warnings"].append("Scene is not georeferenced; area uses assumed GSD.")
        report["valid"] = len(report["errors"]) == 0
        return report

    report["pair"] = {
        "georeferenced": scene_b.georeferenced,
        "crs": str(scene_b.crs) if scene_b.crs else None,
        "acquisition_date": scene_b.acquisition_date,
        "cloud_pct": scene_b.cloud_pct,
        "band_source": scene_b.band_source,
    }

    if scene_a.georeferenced and scene_b.georeferenced:
        crs_match = str(scene_a.crs) == str(scene_b.crs)
        report["crs_match"] = crs_match
        if not crs_match:
            report["errors"].append(f"CRS mismatch: {scene_a.crs} vs {scene_b.crs}")
        if scene_a.bounds and scene_b.bounds:
            overlap = _bounds_overlap(scene_a.bounds, scene_b.bounds)
            ratio = _overlap_ratio(scene_a.bounds, scene_b.bounds)
            report["spatial_overlap"] = overlap
            report["overlap_ratio"] = round(ratio, 4)
            if not overlap:
                report["errors"].append("Spatial extents do not overlap.")
            elif ratio < 0.5:
                report["warnings"].append(f"Only {ratio:.0%} of scene A overlaps scene B.")
    else:
        report["warnings"].append("Pair is not fully georeferenced; skipping CRS/bounds enforcement.")
        size_ok = abs(scene_a.width - scene_b.width) < 4 and abs(scene_a.height - scene_b.height) < 4
        report["dimension_match"] = size_ok
        if not size_ok:
            report["warnings"].append("Raster dimensions differ; change metrics will be resampled.")

    da, db = _parse_iso(scene_a.acquisition_date), _parse_iso(scene_b.acquisition_date)
    if da and db:
        delta = abs((db - da).days)
        report["date_delta_days"] = delta
        if delta == 0:
            report["warnings"].append("Acquisition dates are identical; temporal change may be noise.")
        elif delta > 365 * 3:
            report["warnings"].append(f"Acquisitions are {delta} days apart; phenology/seasonality will dominate.")
    else:
        report["warnings"].append("Acquisition dates missing; date alignment not enforced.")

    if scene_b.cloud_pct is not None and scene_b.cloud_pct > max_cloud_pct:
        report["warnings"].append(f"Scene B cloud cover {scene_b.cloud_pct:.1f}% exceeds {max_cloud_pct}%.")

    report["valid"] = len(report["errors"]) == 0
    return report


def load_and_validate(path_a: str | None, path_b: str | None = None, pil_a=None, pil_b=None) -> tuple[RasterScene, RasterScene | None, dict]:
    scene_a = load_scene_from_path(path_a) if path_a else scene_from_pil(pil_a)
    scene_b = None
    if path_b:
        scene_b = load_scene_from_path(path_b)
    elif pil_b is not None:
        scene_b = scene_from_pil(pil_b)
    report = validate_spatial_extent(scene_a, scene_b)
    return scene_a, scene_b, report
