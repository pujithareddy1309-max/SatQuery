"""Vision tools, lazy model loading, and visual-evidence helpers."""

from __future__ import annotations

import os
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE == "cuda" else torch.float32
ENABLE_VLM = os.getenv("SATQUERY_ENABLE_VLM", "auto")
ENABLE_DINO = os.getenv("SATQUERY_ENABLE_DINO", "auto")
ADAPTER_PATH = os.getenv("SATQUERY_ADAPTER", "./satquery_rs_adapter")
CPU_MAX_NEW_TOKENS = int(os.getenv("SATQUERY_CPU_MAX_TOKENS", "24"))

_MODELS: dict = {}
_LOAD_ERRORS: dict = {}


def _flag(value: str, *, default_on_cuda: bool) -> bool:
    text = (value or "auto").lower()
    if text in {"0", "false", "no"}:
        return False
    if text in {"1", "true", "yes"}:
        return True
    return default_on_cuda and DEVICE == "cuda"


def vlm_enabled() -> bool:
    """Qwen2-VL is GPU-only unless explicitly forced."""
    return _flag(ENABLE_VLM, default_on_cuda=True)


def grounding_enabled() -> bool:
    """GroundingDINO is skipped on CPU unless SATQUERY_ENABLE_DINO=1."""
    return _flag(ENABLE_DINO, default_on_cuda=True)


def cpu_fallback_active() -> bool:
    return DEVICE == "cpu" or not vlm_enabled()


def _generate_kwargs() -> dict:
    if DEVICE == "cpu":
        return {"max_new_tokens": CPU_MAX_NEW_TOKENS, "num_beams": 1}
    return {"max_new_tokens": 40, "num_beams": 3}


def get_blip_vqa():
    if "blip_vqa" in _LOAD_ERRORS:
        raise RuntimeError(_LOAD_ERRORS["blip_vqa"])
    if "blip_vqa" not in _MODELS:
        try:
            from transformers import BlipForQuestionAnswering, BlipProcessor

            proc = BlipProcessor.from_pretrained("Salesforce/blip-vqa-base")
            model = BlipForQuestionAnswering.from_pretrained(
                "Salesforce/blip-vqa-base",
                torch_dtype=torch.float32 if DEVICE == "cpu" else DTYPE,
                low_cpu_mem_usage=True,
            ).to(DEVICE)
            model.eval()
            _MODELS["blip_vqa"] = (proc, model)
        except Exception as exc:
            _LOAD_ERRORS["blip_vqa"] = str(exc)
            raise
    return _MODELS["blip_vqa"]


def get_blip_captioning():
    if "blip_caption" in _LOAD_ERRORS:
        raise RuntimeError(_LOAD_ERRORS["blip_caption"])
    if "blip_caption" not in _MODELS:
        try:
            from peft import PeftModel
            from transformers import BlipForConditionalGeneration, BlipProcessor

            base_id = "Salesforce/blip-image-captioning-base"
            adapter_exists = os.path.isdir(ADAPTER_PATH) and any(Path(ADAPTER_PATH).iterdir())

            proc = BlipProcessor.from_pretrained(ADAPTER_PATH if adapter_exists else base_id)
            base_model = BlipForConditionalGeneration.from_pretrained(
                base_id,
                torch_dtype=torch.float32 if DEVICE == "cpu" else DTYPE,
                low_cpu_mem_usage=True,
            ).to(DEVICE)

            if adapter_exists:
                model = PeftModel.from_pretrained(base_model, ADAPTER_PATH).to(DEVICE)
                method = "BigEarthNet-adapted BLIP (LoRA)"
                print("Loaded remote-sensing LoRA adapter.")
            else:
                model = base_model
                method = "generic BLIP captioning"
                print("LoRA adapter not found; using generic BLIP.")

            model.eval()
            _MODELS["blip_caption"] = (proc, model, method)
        except Exception as exc:
            _LOAD_ERRORS["blip_caption"] = str(exc)
            raise
    return _MODELS["blip_caption"]


def get_grounding_dino():
    if not grounding_enabled():
        raise RuntimeError("GroundingDINO skipped on CPU (set SATQUERY_ENABLE_DINO=1 to force).")
    if "gdino" not in _MODELS:
        from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor

        proc = AutoProcessor.from_pretrained("IDEA-Research/grounding-dino-tiny")
        model = AutoModelForZeroShotObjectDetection.from_pretrained(
            "IDEA-Research/grounding-dino-tiny"
        ).to(DEVICE)
        model.eval()
        _MODELS["gdino"] = (proc, model)
    return _MODELS["gdino"]


def get_multimodal_vlm():
    if not vlm_enabled():
        raise RuntimeError("Qwen2-VL disabled; using BLIP + pixel-diff CPU fallback.")
    if "qwen_vl" not in _MODELS:
        from transformers import AutoProcessor, Qwen2VLForConditionalGeneration

        proc = AutoProcessor.from_pretrained("Qwen/Qwen2-VL-2B-Instruct")
        model = Qwen2VLForConditionalGeneration.from_pretrained(
            "Qwen/Qwen2-VL-2B-Instruct", torch_dtype=DTYPE
        ).to(DEVICE)
        model.eval()
        _MODELS["qwen_vl"] = (proc, model)
    return _MODELS["qwen_vl"]


def _decode_qwen(proc, model, inputs, max_new_tokens: int) -> str:
    with torch.inference_mode():
        generated = model.generate(**inputs, max_new_tokens=max_new_tokens)
    prompt_len = inputs["input_ids"].shape[1]
    trimmed = generated[:, prompt_len:]
    return proc.batch_decode(trimmed, skip_special_tokens=True)[0].strip()


def run_vqa(image: Image.Image, question: str) -> dict:
    prompt = (question or "").strip() or "Describe the land cover and major objects in this image."
    try:
        proc, model = get_blip_vqa()
        inputs = proc(image, prompt, return_tensors="pt")
        inputs = {k: v.to(DEVICE) if torch.is_tensor(v) else v for k, v in inputs.items()}
        with torch.inference_mode():
            output = model.generate(**inputs, **_generate_kwargs())
        answer = proc.decode(output[0], skip_special_tokens=True)
        return {"answer": answer, "confidence": 0.75, "method": "BLIP VQA", "device": DEVICE}
    except Exception as exc:
        return {
            "answer": f"BLIP VQA unavailable ({exc}). Spectral coverage is the CPU fallback.",
            "confidence": 0.2,
            "method": "cpu-fallback",
            "error": str(exc),
        }


def run_captioning(image: Image.Image) -> dict:
    try:
        proc, model, method = get_blip_captioning()
        inputs = proc(image, return_tensors="pt")
        inputs = {k: v.to(DEVICE) if torch.is_tensor(v) else v for k, v in inputs.items()}
        gen = dict(_generate_kwargs())
        if DEVICE != "cpu":
            gen["num_beams"] = 3
        with torch.inference_mode():
            output = model.generate(**inputs, **gen)
        caption = proc.decode(output[0], skip_special_tokens=True)
        return {"answer": caption, "confidence": 0.70, "method": method, "device": DEVICE}
    except Exception as exc:
        return {
            "answer": "Caption model unavailable; using pixel-diff / spectral indices instead.",
            "confidence": 0.2,
            "method": "cpu-fallback",
            "error": str(exc),
        }


def run_grounding(image: Image.Image, text_query: str) -> dict:
    if not grounding_enabled():
        return {
            "answer": f"GroundingDINO skipped on {DEVICE}; use spectral region masks for '{text_query}'.",
            "boxes": [],
            "confidence": 0.0,
            "method": "cpu-fallback",
            "skipped": True,
        }
    proc, model = get_grounding_dino()
    prompt = text_query.lower().strip()
    if not prompt.endswith("."):
        prompt += "."
    inputs = proc(images=image, text=prompt, return_tensors="pt").to(DEVICE)
    with torch.no_grad():
        outputs = model(**inputs)

    kwargs = {
        "threshold": 0.3,
        "text_threshold": 0.25,
        "target_sizes": [image.size[::-1]],
    }
    try:
        results = proc.post_process_grounded_object_detection(
            outputs, inputs.input_ids, **kwargs
        )[0]
    except TypeError:
        results = proc.post_process_grounded_object_detection(
            outputs,
            inputs.input_ids,
            box_threshold=0.3,
            text_threshold=0.25,
            target_sizes=[image.size[::-1]],
        )[0]

    boxes = results["boxes"].detach().cpu().numpy().tolist()
    scores = results["scores"].detach().cpu().numpy().tolist()
    labels = results.get("text_labels") or results.get("labels")
    if labels is None:
        labels = [text_query] * len(boxes)
    else:
        labels = [label if isinstance(label, str) else text_query for label in labels]

    annotated = [
        ((int(box[0]), int(box[1]), int(box[2]), int(box[3])), label)
        for box, label in zip(boxes, labels)
    ]
    confidence = float(np.mean(scores)) if scores else 0.0
    return {
        "answer": f"Found {len(annotated)} region(s) matching '{text_query}'.",
        "boxes": annotated,
        "confidence": confidence,
        "method": "GroundingDINO zero-shot grounding",
    }


def change_mask(img1: Image.Image, image2: Image.Image, size: int = 256) -> tuple[np.ndarray, float]:
    a = np.array(img1.convert("L").resize((size, size)), dtype=np.int16)
    b = np.array(image2.convert("L").resize((size, size)), dtype=np.int16)
    diff = np.abs(a - b)
    mask = (diff > 30).astype(np.uint8)
    change_pct = float(mask.sum()) / mask.size * 100
    return mask, change_pct


def change_boxes_from_mask(mask: np.ndarray, image_size: tuple[int, int], min_area: int = 40) -> list:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    src_h, src_w = mask.shape
    dst_w, dst_h = image_size
    boxes = []
    for contour in contours:
        if cv2.contourArea(contour) < min_area:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        x1 = int(x * dst_w / src_w)
        y1 = int(y * dst_h / src_h)
        x2 = int((x + w) * dst_w / src_w)
        y2 = int((y + h) * dst_h / src_h)
        boxes.append(((x1, y1, x2, y2), "change"))
    return boxes[:12]


def overlay_change_heatmap(image: Image.Image, mask: np.ndarray) -> Image.Image:
    base = image.convert("RGB")
    heat = cv2.applyColorMap((mask * 255).astype(np.uint8), cv2.COLORMAP_JET)
    heat = cv2.cvtColor(heat, cv2.COLOR_BGR2RGB)
    heat = cv2.resize(heat, base.size, interpolation=cv2.INTER_NEAREST)
    overlay = Image.fromarray(heat).convert("RGB")
    return Image.blend(base, overlay, 0.42)


def side_by_side(left: Image.Image, right: Image.Image, labels: tuple[str, str]) -> Image.Image:
    h = 320
    left_r = left.convert("RGB").copy()
    right_r = right.convert("RGB").copy()
    left_r.thumbnail((480, h))
    right_r.thumbnail((480, h))
    canvas = Image.new("RGB", (left_r.width + right_r.width + 24, max(left_r.height, right_r.height) + 36), (18, 22, 28))
    canvas.paste(left_r, (8, 28))
    canvas.paste(right_r, (left_r.width + 16, 28))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.load_default()
    except OSError:
        font = None
    draw.text((8, 6), labels[0], fill=(230, 230, 230), font=font)
    draw.text((left_r.width + 16, 6), labels[1], fill=(230, 230, 230), font=font)
    return canvas


def prepare_sar_for_vlm(image: Image.Image) -> Image.Image:
    arr = np.asarray(image.convert("L")).astype(np.float32)
    arr = 10.0 * np.log10(arr + 1e-6)
    low, high = np.percentile(arr, [2, 98])
    if high <= low:
        high = low + 1.0
    arr = np.clip((arr - low) / (high - low), 0, 1)
    arr = (arr * 255).astype(np.uint8)
    color = cv2.applyColorMap(arr, cv2.COLORMAP_INFERNO)
    color = cv2.cvtColor(color, cv2.COLOR_BGR2RGB)
    return Image.fromarray(color)


def _pixel_diff_heuristic(img1: Image.Image, img2: Image.Image) -> tuple[str, float, Image.Image, list]:
    mask, change_pct = change_mask(img1, img2)
    overlay = overlay_change_heatmap(img1, mask)
    boxes = change_boxes_from_mask(mask, img1.size)
    text = (
        f"Approximately {change_pct:.1f}% of pixels show significant intensity change "
        "between the two dates. Highlighted regions are intensity-change blobs, not "
        "calibrated semantic change."
    )
    return text, change_pct, overlay, boxes


def run_change_analysis(image1: Image.Image, image2: Image.Image, question: str) -> dict:
    """Always compute pixel-diff; on CPU skip Qwen and caption with BLIP."""
    heuristic, change_pct, overlay, boxes = _pixel_diff_heuristic(image1, image2)
    caption_t1 = run_captioning(image1)
    caption_t2 = run_captioning(image2)
    structured = (
        f"Date 1 interpretation: {caption_t1.get('answer')}\n"
        f"Date 2 interpretation: {caption_t2.get('answer')}\n"
        f"{heuristic}"
    )
    fallback = {
        "answer": structured,
        "confidence": min(0.85, change_pct / 100 + 0.35),
        "method": "BLIP captions + pixel-diff heatmap",
        "visual": overlay,
        "boxes": boxes,
        "device": DEVICE,
        "fallback": True,
    }

    if not vlm_enabled():
        return fallback

    try:
        proc, model = get_multimodal_vlm()
        prompt_q = question or "What changed between these two dates, and where?"
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image1},
                    {"type": "image", "image": image2},
                    {
                        "type": "text",
                        "text": (
                            "These two images show the same location at different times. "
                            f"{prompt_q} Be concise and mention likely land-cover change."
                        ),
                    },
                ],
            }
        ]
        text_prompt = proc.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = proc(text=[text_prompt], images=[image1, image2], return_tensors="pt").to(DEVICE)
        answer = _decode_qwen(proc, model, inputs, 120)
        return {
            "answer": f"{answer}\n\nSupporting measurement: {heuristic}",
            "confidence": 0.65,
            "method": "Qwen2-VL multi-image + change heatmap",
            "visual": overlay,
            "boxes": boxes,
            "fallback": False,
        }
    except Exception as exc:
        fallback["error"] = str(exc)
        return fallback


def run_fusion_analysis(optical_img: Image.Image, sar_img: Image.Image, question: str) -> dict:
    sar_visual = prepare_sar_for_vlm(sar_img)
    visual = side_by_side(optical_img, sar_visual, ("Optical", "SAR (dB colormap)"))

    if vlm_enabled():
        try:
            proc, model = get_multimodal_vlm()
            prompt_q = question or "Identify built-up and water-covered regions using both images."
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "image": optical_img},
                        {"type": "image", "image": sar_visual},
                        {
                            "type": "text",
                            "text": (
                                "The first image is optical satellite imagery. "
                                "The second image is a pseudo-colored SAR image. "
                                f"{prompt_q}"
                            ),
                        },
                    ],
                }
            ]
            text_prompt = proc.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            inputs = proc(text=[text_prompt], images=[optical_img, sar_visual], return_tensors="pt").to(DEVICE)
            answer = _decode_qwen(proc, model, inputs, 140)
            return {
                "answer": answer,
                "confidence": 0.60,
                "method": "Qwen2-VL multi-image optical-SAR prompting",
                "visual": visual,
                "boxes": [],
            }
        except Exception as exc:
            optical_caption = run_captioning(optical_img)["answer"]
            sar_caption = run_captioning(sar_visual)["answer"]
            return {
                "answer": (
                    "[Fallback fusion analysis]\n"
                    f"Optical interpretation: {optical_caption}\n"
                    f"SAR interpretation: {sar_caption}\n"
                    "Independent captions were used because the multi-image VLM was unavailable."
                ),
                "confidence": 0.40,
                "method": "adapted-BLIP caption concatenation fallback",
                "error": str(exc),
                "visual": visual,
                "boxes": [],
            }

    optical_caption = run_captioning(optical_img)["answer"]
    sar_caption = run_captioning(sar_visual)["answer"]
    return {
        "answer": (
            "[CPU fusion path — Qwen2-VL skipped]\n"
            f"Optical interpretation: {optical_caption}\n"
            f"SAR interpretation: {sar_caption}\n"
            "Set SATQUERY_ENABLE_VLM=1 to attempt native multi-image fusion."
        ),
        "confidence": 0.40,
        "method": "adapted-BLIP caption concatenation fallback",
        "visual": visual,
        "boxes": [],
    }


def validate_pair(img1_path, img2_path):
    """Best-effort GeoTIFF compatibility check."""
    try:
        import rasterio

        with rasterio.open(img1_path) as a, rasterio.open(img2_path) as b:
            crs_match = a.crs == b.crs
            bounds_a, bounds_b = a.bounds, b.bounds
            overlap = not (
                bounds_a.right < bounds_b.left
                or bounds_a.left > bounds_b.right
                or bounds_a.top < bounds_b.bottom
                or bounds_a.bottom > bounds_b.top
            )
            return {
                "geotiff": True,
                "crs_match": bool(crs_match),
                "spatial_overlap": overlap,
                "valid": bool(crs_match and overlap),
            }
    except Exception:
        return {
            "geotiff": False,
            "valid": True,
            "note": "Non-georeferenced input (benchmark format) - skipping CRS check.",
        }


def geotiff_to_pil(path: str) -> Image.Image:
    import rasterio
    from rasterio.plot import reshape_as_image

    with rasterio.open(path) as src:
        count = src.count
        if count >= 3:
            arr = src.read([min(4, count), min(3, count), min(2, count) if count >= 2 else 1])
            img = reshape_as_image(arr).astype(np.float32)
        else:
            band = src.read(1).astype(np.float32)
            img = np.stack([band, band, band], axis=-1)

    lo, hi = np.percentile(img, (2, 98))
    if hi <= lo:
        hi = lo + 1.0
    img = np.clip((img - lo) / (hi - lo), 0, 1)
    return Image.fromarray((img * 255).astype(np.uint8))


def validate_pil_pair(image1, image2):
    if image1 is None or image2 is None:
        return {"valid": False, "reason": "Both images are required."}

    w1, h1 = image1.size
    w2, h2 = image2.size
    if w1 < 16 or h1 < 16 or w2 < 16 or h2 < 16:
        return {"valid": False, "reason": "One image is too small."}

    return {
        "valid": True,
        "georeferenced_check": "not available for PIL upload",
        "image1_size": [w1, h1],
        "image2_size": [w2, h2],
        "note": "CRS/bounds validation requires GeoTIFF paths.",
    }


def make_demo_samples(out_dir: str = "assets/samples") -> dict:
    """Create synthetic optical/SAR-like tiles so the UI has clickable examples."""
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
    t2 = tile("forest")
    t2_arr = np.array(t2)
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
    }
    water.save(files["water"])
    optical.save(files["optical"])
    t1.save(files["t1"])
    t2.save(files["t2"])
    sar.save(files["sar"])
    return {key: str(value) for key, value in files.items()}
