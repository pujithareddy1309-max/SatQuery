"""Pixel-level region segmentation and coverage metrics."""

from __future__ import annotations

import os

import cv2
import numpy as np
from PIL import Image

from satquery.indices import compute_index
from satquery.raster import RasterScene

ENABLE_SAM = os.getenv("SATQUERY_ENABLE_SAM", "0").lower() in {"1", "true", "yes"}
_SAM = {}


def _morph_clean(mask: np.ndarray) -> np.ndarray:
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    return mask


def spectral_masks(scene: RasterScene) -> dict[str, np.ndarray]:
    veg = compute_index(scene.bands, "ndvi").array > 0.2
    water = compute_index(scene.bands, "ndwi").array > 0.0
    built = compute_index(scene.bands, "ndbi").array > 0.1
    water = _morph_clean(water.astype(np.uint8))
    veg = _morph_clean((veg & ~water.astype(bool)).astype(np.uint8))
    built = _morph_clean((built & ~water.astype(bool) & ~veg.astype(bool)).astype(np.uint8))
    return {"water": water, "vegetation": veg, "built-up": built}


def masks_to_boxes(masks: dict[str, np.ndarray], image_size: tuple[int, int]) -> list:
    boxes = []
    dst_w, dst_h = image_size
    for label, mask in masks.items():
        src_h, src_w = mask.shape
        contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:8]:
            if cv2.contourArea(contour) < 40:
                continue
            x, y, w, h = cv2.boundingRect(contour)
            x1 = int(x * dst_w / src_w)
            y1 = int(y * dst_h / src_h)
            x2 = int((x + w) * dst_w / src_w)
            y2 = int((y + h) * dst_h / src_h)
            boxes.append(((x1, y1, x2, y2), label))
    return boxes


def overlay_masks(image: Image.Image, masks: dict[str, np.ndarray], opacity: float = 0.45) -> Image.Image:
    base = np.asarray(image.convert("RGB").resize((list(masks.values())[0].shape[1], list(masks.values())[0].shape[0])))
    color_map = {
        "water": (30, 90, 220),
        "vegetation": (40, 170, 70),
        "built-up": (210, 80, 50),
        "flood": (0, 140, 255),
        "deforestation": (180, 40, 20),
        "construction": (240, 180, 40),
        "crop": (180, 220, 60),
    }
    overlay = base.astype(np.float32)
    for name, mask in masks.items():
        if mask.shape[:2] != base.shape[:2]:
            mask = cv2.resize(mask.astype(np.uint8), (base.shape[1], base.shape[0]), interpolation=cv2.INTER_NEAREST)
        color = np.array(color_map.get(name, (200, 200, 200)), dtype=np.float32)
        m = mask.astype(bool)
        overlay[m] = overlay[m] * (1 - opacity) + color * opacity
    return Image.fromarray(overlay.astype(np.uint8)).resize(image.size)


def coverage_table(masks: dict[str, np.ndarray]) -> dict[str, float]:
    return {name: round(float(np.mean(mask > 0) * 100), 2) for name, mask in masks.items()}


def refine_with_boxes(image: Image.Image, boxes: list, labels: list[str] | None = None) -> dict[str, np.ndarray]:
    """GrabCut inside GroundingDINO boxes to upgrade detections to pixel masks."""
    rgb = np.asarray(image.convert("RGB"))
    h, w = rgb.shape[:2]
    combined: dict[str, np.ndarray] = {}
    for item in boxes:
        box, label = item if isinstance(item[0], tuple) else (item, "object")
        x1, y1, x2, y2 = [int(v) for v in box]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 - x1 < 8 or y2 - y1 < 8:
            continue
        gc_mask = np.zeros((h, w), np.uint8)
        cv2.grabCut(rgb, gc_mask, (x1, y1, x2 - x1, y2 - y1), None, None, 2, cv2.GC_INIT_WITH_RECT)
        fg = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
        key = str(label)
        combined[key] = np.maximum(combined.get(key, np.zeros((h, w), np.uint8)), fg)
    return combined


def maybe_sam_masks(image: Image.Image) -> dict[str, np.ndarray] | None:
    if not ENABLE_SAM:
        return None
    try:
        from transformers import SamModel, SamProcessor
        import torch

        if "sam" not in _SAM:
            proc = SamProcessor.from_pretrained("facebook/sam-vit-base")
            model = SamModel.from_pretrained("facebook/sam-vit-base")
            model.eval()
            _SAM["sam"] = (proc, model)
        proc, model = _SAM["sam"]
        inputs = proc(image, return_tensors="pt")
        with torch.no_grad():
            outputs = model(**inputs)
        masks = proc.image_processor.post_process_masks(
            outputs.pred_masks.cpu(), inputs["original_sizes"], inputs["reshaped_input_sizes"]
        )[0]
        packed = {}
        for i, mask in enumerate(masks[:6]):
            packed[f"sam-{i}"] = mask[0].numpy().astype(np.uint8)
        return packed
    except Exception:
        return None


def run_segmentation(scene: RasterScene, boxes: list | None = None) -> dict:
    masks = spectral_masks(scene)
    method = "spectral-NDVI/NDWI/NDBI"
    if boxes:
        try:
            refined = refine_with_boxes(scene.rgb, boxes)
            for key, mask in refined.items():
                masks[key] = mask
            method += "+GroundingDINO-GrabCut"
        except Exception:
            pass
    sam = maybe_sam_masks(scene.rgb)
    if sam:
        masks.update(sam)
        method += "+SAM"

    coverage = coverage_table(masks)
    visual = overlay_masks(scene.rgb, masks)
    boxes_out = masks_to_boxes(masks, scene.rgb.size)
    lines = [f"{name}: {pct:.1f}%" for name, pct in coverage.items()]
    return {
        "answer": "Region coverage - " + ", ".join(lines),
        "coverage": coverage,
        "masks": masks,
        "visual": visual,
        "boxes": boxes_out,
        "method": method,
        "confidence": 0.72 if scene.band_source.startswith("sentinel") else 0.55,
    }
