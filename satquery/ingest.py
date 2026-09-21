"""Normalize Gradio uploads (PIL, filepath, GeoTIFF, File data)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

GEOTIFF_SUFFIXES = {".tif", ".tiff"}


def _as_path(upload) -> str | None:
    if upload is None:
        return None
    if isinstance(upload, str) and upload.strip():
        return upload
    if isinstance(upload, dict):
        for key in ("path", "name", "orig_name"):
            if upload.get(key):
                return str(upload[key])
    name = getattr(upload, "name", None)
    return str(name) if name else None


def is_geotiff_path(path: str | None) -> bool:
    return bool(path) and Path(path).suffix.lower() in GEOTIFF_SUFFIXES


def decode_slot(image, geotiff=None) -> tuple[str | None, Image.Image | None]:
    """Prefer a GeoTIFF path; otherwise return a RGB PIL image."""
    path = _as_path(geotiff)
    if path:
        if is_geotiff_path(path):
            return path, None
        try:
            return None, Image.open(path).convert("RGB")
        except Exception:
            return path, None

    if image is None:
        return None, None
    if isinstance(image, Image.Image):
        return None, image.convert("RGB")
    if isinstance(image, str):
        if is_geotiff_path(image):
            return image, None
        return None, Image.open(image).convert("RGB")
    try:
        import numpy as np

        if isinstance(image, np.ndarray):
            return None, Image.fromarray(image).convert("RGB")
    except Exception:
        pass
    path = _as_path(image)
    if path:
        if is_geotiff_path(path):
            return path, None
        return None, Image.open(path).convert("RGB")
    return None, None
