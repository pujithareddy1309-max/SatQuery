"""Semantic bi-temporal change: flood, construction, deforestation, crop."""

from __future__ import annotations

import cv2
import numpy as np
from PIL import Image

from satquery.indices import compute_index
from satquery.raster import RasterScene
from satquery.segmentation import overlay_masks, coverage_table, masks_to_boxes


CHANGE_CLASSES = ("flooding", "deforestation", "construction", "crop_evolution")


def _resize_like(arr: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    if arr.shape[:2] == shape:
        return arr
    return cv2.resize(arr.astype(np.float32), (shape[1], shape[0]), interpolation=cv2.INTER_LINEAR)


def semantic_change(t1: RasterScene, t2: RasterScene) -> dict:
    ndvi1 = compute_index(t1.bands, "ndvi").array
    ndvi2 = compute_index(t2.bands, "ndvi").array
    ndwi1 = compute_index(t1.bands, "ndwi").array
    ndwi2 = compute_index(t2.bands, "ndwi").array
    ndbi1 = compute_index(t1.bands, "ndbi").array
    ndbi2 = compute_index(t2.bands, "ndbi").array

    ndvi2 = _resize_like(ndvi2, ndvi1.shape)
    ndwi2 = _resize_like(ndwi2, ndwi1.shape)
    ndbi2 = _resize_like(ndbi2, ndbi1.shape)

    d_ndvi = ndvi2 - ndvi1
    d_ndwi = ndwi2 - ndwi1
    d_ndbi = ndbi2 - ndbi1

    flooding = ((ndwi2 > 0.05) & (d_ndwi > 0.12) & (ndvi2 < ndvi1)).astype(np.uint8)
    deforestation = ((d_ndvi < -0.15) & (ndvi1 > 0.25) & (ndwi2 < 0.1)).astype(np.uint8)
    construction = ((d_ndbi > 0.12) & (d_ndvi < -0.05) & (ndwi2 < 0.1)).astype(np.uint8)
    crop = ((np.abs(d_ndvi) > 0.12) & (ndvi1 > 0.15) & (ndvi2 > 0.05) & (ndwi2 < 0.15) & (construction == 0) & (deforestation == 0)).astype(np.uint8)

    kernel = np.ones((5, 5), np.uint8)
    masks = {
        "flooding": cv2.morphologyEx(flooding, cv2.MORPH_OPEN, kernel),
        "deforestation": cv2.morphologyEx(deforestation, cv2.MORPH_OPEN, kernel),
        "construction": cv2.morphologyEx(construction, cv2.MORPH_OPEN, kernel),
        "crop_evolution": cv2.morphologyEx(crop, cv2.MORPH_OPEN, kernel),
    }
    coverage = coverage_table(masks)
    visual = overlay_masks(t2.rgb, masks, opacity=0.5)
    dominant = max(coverage, key=coverage.get) if coverage else "none"
    lines = [f"{k.replace('_', ' ')}: {v:.1f}%" for k, v in coverage.items() if v > 0.05]
    answer = (
        "Semantic change (index-driven): "
        + (", ".join(lines) if lines else "no strong class exceeded detection thresholds")
        + f". Dominant class: {dominant.replace('_', ' ')}."
    )
    return {
        "answer": answer,
        "coverage": coverage,
        "masks": masks,
        "visual": visual,
        "boxes": masks_to_boxes(masks, t2.rgb.size),
        "dominant": dominant,
        "deltas": {
            "ndvi_mean": float(np.nanmean(d_ndvi)),
            "ndwi_mean": float(np.nanmean(d_ndwi)),
            "ndbi_mean": float(np.nanmean(d_ndbi)),
        },
        "method": "bi-temporal NDVI/NDWI/NDBI decision tree",
        "confidence": 0.68 if t1.georeferenced and t2.georeferenced else 0.52,
    }


def ndvi_anomaly(t1: RasterScene, t2: RasterScene) -> dict:
    a = compute_index(t1.bands, "ndvi")
    b = compute_index(t2.bands, "ndvi")
    b_arr = _resize_like(b.array, a.array.shape)
    delta = b_arr - a.array
    stress = (delta < -0.1).astype(np.uint8)
    gain = (delta > 0.1).astype(np.uint8)
    masks = {"vegetation_loss": stress, "vegetation_gain": gain}
    visual = overlay_masks(t2.rgb, masks)
    return {
        "answer": (
            f"NDVI anomaly: mean Δ={float(np.nanmean(delta)):.3f}. "
            f"Loss {coverage_table(masks)['vegetation_loss']:.1f}%, "
            f"gain {coverage_table(masks)['vegetation_gain']:.1f}%."
        ),
        "coverage": coverage_table(masks),
        "masks": masks,
        "visual": visual,
        "boxes": masks_to_boxes(masks, t2.rgb.size),
        "t1_ndvi_mean": a.mean,
        "t2_ndvi_mean": b.mean,
        "method": "NDVI anomaly tracking",
        "confidence": 0.7,
        "index_visual": b.visual,
    }
