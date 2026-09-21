"""Synthetic Sentinel-2-like GeoTIFFs and PNG tiles for the Gradio demo."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def _write_s2_geotiff(path: Path, kind: str, seed: int = 3, date: str = "2024-04-01") -> None:
    import rasterio
    from rasterio.transform import from_origin

    rng = np.random.default_rng(seed)
    h = w = 128
    b2 = rng.integers(400, 900, size=(h, w)).astype(np.float32)
    b3 = rng.integers(500, 1100, size=(h, w)).astype(np.float32)
    b4 = rng.integers(400, 1200, size=(h, w)).astype(np.float32)
    b8 = rng.integers(800, 2800, size=(h, w)).astype(np.float32)
    b11 = rng.integers(600, 2000, size=(h, w)).astype(np.float32)

    if kind == "water":
        cv2.ellipse(b2, (64, 70), (36, 22), 0, 0, 360, 900, -1)
        cv2.ellipse(b3, (64, 70), (36, 22), 0, 0, 360, 1200, -1)
        cv2.ellipse(b4, (64, 70), (36, 22), 0, 0, 360, 400, -1)
        cv2.ellipse(b8, (64, 70), (36, 22), 0, 0, 360, 300, -1)
    elif kind == "flooded":
        cv2.ellipse(b2, (64, 70), (50, 34), 0, 0, 360, 950, -1)
        cv2.ellipse(b3, (64, 70), (50, 34), 0, 0, 360, 1400, -1)
        cv2.ellipse(b4, (64, 70), (50, 34), 0, 0, 360, 350, -1)
        cv2.ellipse(b8, (64, 70), (50, 34), 0, 0, 360, 280, -1)
    elif kind == "forest":
        b8[:] = rng.integers(2200, 3500, size=(h, w))
        b4[:] = rng.integers(300, 700, size=(h, w))
    elif kind == "cleared":
        b8[:] = rng.integers(2200, 3500, size=(h, w))
        b4[:] = rng.integers(300, 700, size=(h, w))
        cv2.rectangle(b8, (20, 20), (80, 90), 900, -1)
        cv2.rectangle(b4, (20, 20), (80, 90), 1400, -1)
        cv2.rectangle(b11, (20, 20), (80, 90), 2400, -1)
    elif kind == "urban":
        b11[:] = rng.integers(1800, 3200, size=(h, w))
        b8[:] = rng.integers(900, 1600, size=(h, w))

    transform = from_origin(500000, 4_200_000, 10, 10)
    path.parent.mkdir(parents=True, exist_ok=True)
    names = ("B02", "B03", "B04", "B08", "B11")
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=5,
        dtype="float32",
        crs="EPSG:32633",
        transform=transform,
    ) as dst:
        for i, band in enumerate([b2, b3, b4, b8, b11], start=1):
            dst.write(band, i)
            dst.set_band_description(i, names[i - 1])
        dst.update_tags(ACQUISITION_DATE=date)


def make_demo_samples(out_dir: str = "assets/samples") -> dict:
    from satquery_vision import prepare_sar_for_vlm

    rng = np.random.default_rng(7)
    path = Path(out_dir)
    path.mkdir(parents=True, exist_ok=True)

    def tile(kind: str) -> Image.Image:
        img = np.zeros((256, 256, 3), dtype=np.uint8)
        if kind == "water":
            img[..., 0] = rng.integers(20, 70, size=(256, 256))
            img[..., 1] = rng.integers(80, 160, size=(256, 256))
            img[..., 2] = rng.integers(140, 230, size=(256, 256))
            cv2.ellipse(img, (130, 140), (70, 40), 0, 0, 360, (30, 90, 200), -1)
        elif kind == "urban":
            img[:] = rng.integers(70, 160, size=(256, 256, 3))
            for i in range(8):
                x, y = 20 + i * 28, 30 + (i % 3) * 40
                cv2.rectangle(img, (x, y), (x + 22, y + 34), (200, 200, 210), -1)
        else:
            img[..., 0] = rng.integers(20, 80, size=(256, 256))
            img[..., 1] = rng.integers(90, 180, size=(256, 256))
            img[..., 2] = rng.integers(20, 70, size=(256, 256))
        return Image.fromarray(img)

    t1 = tile("forest")
    t2_arr = np.array(tile("forest"))
    cv2.rectangle(t2_arr, (40, 40), (140, 150), (90, 90, 90), -1)
    t2 = Image.fromarray(t2_arr)
    optical = tile("urban")
    water = tile("water")
    sar = prepare_sar_for_vlm(optical.convert("L"))

    files = {
        "optical": path / "optical.png",
        "water": path / "water.png",
        "t1": path / "change_t1.png",
        "t2": path / "change_t2.png",
        "sar": path / "sar.png",
        "s2_t1": path / "s2_t1.tif",
        "s2_t2_flood": path / "s2_t2_flood.tif",
        "s2_t2_clear": path / "s2_t2_clear.tif",
    }
    water.save(files["water"])
    optical.save(files["optical"])
    t1.save(files["t1"])
    t2.save(files["t2"])
    sar.save(files["sar"])
    _write_s2_geotiff(files["s2_t1"], "forest", 3, date="2024-04-01")
    _write_s2_geotiff(files["s2_t2_flood"], "flooded", 4, date="2024-10-12")
    _write_s2_geotiff(files["s2_t2_clear"], "cleared", 5, date="2024-10-12")
    return {key: str(value) for key, value in files.items()}
