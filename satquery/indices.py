"""Sentinel-2 spectral indices (NDVI, NDWI, NDBI) and RGB-proxy fallbacks."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image

S2_ALIASES = {
    "B02": ("B02", "B2", "blue"),
    "B03": ("B03", "B3", "green"),
    "B04": ("B04", "B4", "red"),
    "B08": ("B08", "B8", "nir", "NIR"),
    "B8A": ("B8A", "nir_narrow"),
    "B11": ("B11", "swir1", "SWIR1"),
    "B12": ("B12", "swir2", "SWIR2"),
}


def _as_float(band: np.ndarray) -> np.ndarray:
    arr = np.asarray(band, dtype=np.float32)
    if np.nanmax(arr) > 1.5:
        # Sentinel-2 L2A is often scaled by 10000.
        if np.nanmax(arr) > 255:
            arr = arr / 10000.0
        else:
            arr = arr / 255.0
    return np.clip(arr, 0.0, 1.0)


def normalized_difference(a: np.ndarray, b: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    a = _as_float(a)
    b = _as_float(b)
    return (a - b) / (a + b + eps)


def ndvi(nir: np.ndarray, red: np.ndarray) -> np.ndarray:
    """(NIR - Red) / (NIR + Red). Vegetation > ~0.2."""
    return normalized_difference(nir, red)


def ndwi(green: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """McFeeters NDWI: (Green - NIR) / (Green + NIR). Water > ~0.0–0.2."""
    return normalized_difference(green, nir)


def ndbi(swir: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """(SWIR - NIR) / (SWIR + NIR). Built-up typically positive."""
    return normalized_difference(swir, nir)


def colormap_index(index: np.ndarray, cmap: int | None = None) -> Image.Image:
    import cv2

    stretched = np.clip((index + 1.0) / 2.0, 0, 1)
    gray = (stretched * 255).astype(np.uint8)
    if cmap is None:
        cmap = cv2.COLORMAP_JET
    color = cv2.applyColorMap(gray, cmap)
    return Image.fromarray(cv2.cvtColor(color, cv2.COLOR_BGR2RGB))


def rgb_proxy_bands(image: Image.Image) -> dict[str, np.ndarray]:
    """Approximate S2 bands from an RGB tile when true MSI is unavailable."""
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    nir = np.clip(g * 1.15, 0, 255)
    swir = np.clip(r * 0.85 + b * 0.15, 0, 255)
    return {"B02": b, "B03": g, "B04": r, "B08": nir, "B11": swir}


@dataclass
class IndexResult:
    name: str
    array: np.ndarray
    mean: float
    positive_pct: float
    threshold: float
    method: str
    visual: Image.Image

    def coverage(self) -> float:
        return float(self.positive_pct)


def summarize_index(name: str, array: np.ndarray, threshold: float, method: str, cmap=None) -> IndexResult:
    finite = np.isfinite(array)
    mask = (array > threshold) & finite
    pct = float(mask.mean() * 100) if finite.any() else 0.0
    mean = float(np.nanmean(array)) if finite.any() else 0.0
    visual = colormap_index(np.nan_to_num(array, nan=0.0), cmap=cmap)
    return IndexResult(
        name=name,
        array=array,
        mean=mean,
        positive_pct=pct,
        threshold=threshold,
        method=method,
        visual=visual,
    )


def compute_index(bands: dict[str, np.ndarray], name: str) -> IndexResult:
    name = name.lower()
    if name == "ndvi":
        result = ndvi(bands["B08"], bands["B04"])
        return summarize_index("NDVI", result, 0.2, "Sentinel-2 NDVI (NIR-Red)")
    if name == "ndwi":
        result = ndwi(bands["B03"], bands["B08"])
        return summarize_index("NDWI", result, 0.0, "McFeeters NDWI (Green-NIR)")
    if name == "ndbi":
        result = ndbi(bands["B11"], bands["B08"])
        return summarize_index("NDBI", result, 0.1, "NDBI (SWIR-NIR)")
    raise ValueError(f"Unknown index: {name}")
