"""Multispectral GeoTIFF ingest, Sentinel-2 band resolution, and cloud QA."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image

from satquery.indices import S2_ALIASES, rgb_proxy_bands


def _parse_date(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    text = str(value)
    for fmt in ("%Y-%m-%d", "%Y%m%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f"):
        try:
            return datetime.strptime(text[:26].replace("Z", ""), fmt).date().isoformat()
        except ValueError:
            continue
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return text[:10]
    return text


def _match_band(descriptions, aliases) -> int | None:
    lowered = [str(d or "").lower() for d in descriptions]
    alias_set = {a.lower() for a in aliases}
    for idx, desc in enumerate(lowered):
        token = desc.replace(" ", "").replace("-", "")
        if desc in alias_set or token in alias_set:
            return idx + 1
    return None


@dataclass
class RasterScene:
    path: str | None
    rgb: Image.Image
    bands: dict[str, np.ndarray]
    transform: object | None = None
    crs: object | None = None
    bounds: tuple | None = None
    width: int = 0
    height: int = 0
    acquisition_date: str | None = None
    cloud_pct: float | None = None
    cloud_mask: np.ndarray | None = None
    tags: dict = field(default_factory=dict)
    band_source: str = "rgb-proxy"
    pixel_size_m: tuple[float, float] | None = None

    @property
    def georeferenced(self) -> bool:
        return self.crs is not None and self.transform is not None


def _tags_date(tags: dict) -> str | None:
    for key in ("TIFFTAG_DATETIME", "ACQUISITION_DATE", "DATE_ACQUIRED", "DATE", "sensing_time"):
        if key in tags:
            return _parse_date(tags[key])
        for actual, value in tags.items():
            if key.lower() in str(actual).lower():
                return _parse_date(value)
    return None


def load_scene_from_path(path: str) -> RasterScene:
    import rasterio
    from rasterio.plot import reshape_as_image

    path = str(path)
    with rasterio.open(path) as src:
        descriptions = list(src.descriptions or [])
        while len(descriptions) < src.count:
            descriptions.append(f"band_{len(descriptions) + 1}")
        tags = dict(src.tags())
        bands: dict[str, np.ndarray] = {}
        resolved = 0
        for canonical, aliases in S2_ALIASES.items():
            idx = _match_band(descriptions, aliases)
            if idx is None and canonical == "B02" and src.count >= 3:
                # Common stack order B02,B03,B04,B08,B11,...
                continue
            if idx is not None:
                bands[canonical] = src.read(idx).astype(np.float32)
                resolved += 1

        if "B04" not in bands and src.count >= 3:
            # Try Sentinel-like order: 1=B02, 2=B03, 3=B04, 4=B08, 5=B11
            mapping = {1: "B02", 2: "B03", 3: "B04", 4: "B08", 5: "B11", 6: "B12"}
            if src.count >= 4:
                for idx, name in mapping.items():
                    if idx <= src.count:
                        bands[name] = src.read(idx).astype(np.float32)
                resolved = len(bands)
            else:
                rgb = reshape_as_image(src.read([1, min(2, src.count), min(3, src.count)]))
                rgb_img = _stretch_to_pil(rgb)
                bands = rgb_proxy_bands(rgb_img)
                resolved = 0

        cloud_mask, cloud_pct = read_cloud_qa(src)
        px = None
        if src.transform and src.crs:
            px = (abs(src.transform.a), abs(src.transform.e))

        rgb_img = _rgb_from_bands(bands)
        return RasterScene(
            path=path,
            rgb=rgb_img,
            bands=bands,
            transform=src.transform,
            crs=src.crs,
            bounds=tuple(src.bounds),
            width=src.width,
            height=src.height,
            acquisition_date=_tags_date(tags) or _parse_date(Path(path).stem),
            cloud_pct=cloud_pct,
            cloud_mask=cloud_mask,
            tags=tags,
            band_source="sentinel2-msi" if resolved >= 4 else "heuristic-stack",
            pixel_size_m=px,
        )


def scene_from_pil(image: Image.Image, path: str | None = None, assumed_gsd_m: float = 10.0) -> RasterScene:
    rgb = image.convert("RGB")
    w, h = rgb.size
    return RasterScene(
        path=path,
        rgb=rgb,
        bands=rgb_proxy_bands(rgb),
        transform=None,
        crs=None,
        bounds=None,
        width=w,
        height=h,
        band_source="rgb-proxy",
        pixel_size_m=(assumed_gsd_m, assumed_gsd_m),
    )


def read_cloud_qa(src) -> tuple[np.ndarray | None, float | None]:
    """Use SCL / QA60 / MSK_CLASSI-like bands when present."""
    descriptions = [str(d or "").upper() for d in (src.descriptions or [])]
    for idx, desc in enumerate(descriptions, start=1):
        if any(token in desc for token in ("SCL", "QA60", "CLOUD", "MSK_CLDPRB", "QA")):
            qa = src.read(idx)
            if "SCL" in desc:
                # Sen2Cor SCL: 8/9/10 medium/high cloud + cirrus
                mask = np.isin(qa, [8, 9, 10]).astype(np.uint8)
            else:
                mask = (qa > 0).astype(np.uint8)
            return mask, float(mask.mean() * 100)
    tags = src.tags()
    for key, value in tags.items():
        if "CLOUD" in str(key).upper():
            try:
                return None, float(value)
            except (TypeError, ValueError):
                continue
    return None, None


def _stretch_to_pil(arr: np.ndarray) -> Image.Image:
    arr = np.asarray(arr, dtype=np.float32)
    if arr.ndim == 2:
        arr = np.stack([arr] * 3, axis=-1)
    lo, hi = np.percentile(arr, (2, 98))
    if hi <= lo:
        hi = lo + 1.0
    arr = np.clip((arr - lo) / (hi - lo), 0, 1)
    return Image.fromarray((arr * 255).astype(np.uint8))


def _rgb_from_bands(bands: dict[str, np.ndarray]) -> Image.Image:
    if {"B04", "B03", "B02"} <= set(bands):
        rgb = np.stack([bands["B04"], bands["B03"], bands["B02"]], axis=-1)
        return _stretch_to_pil(rgb)
    first = next(iter(bands.values()))
    return _stretch_to_pil(np.stack([first] * 3, axis=-1))
