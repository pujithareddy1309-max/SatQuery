"""Autonomous tool-calling controller with JSON execution traces."""

from __future__ import annotations

import json
import os
import time
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np
from PIL import Image

from satquery.change import ndvi_anomaly, semantic_change
from satquery.fusion import fuse_optical_sar
from satquery.geoexport import export_bundle, mask_area, masks_to_geojson
from satquery.indices import compute_index
from satquery.raster import RasterScene, load_scene_from_path, scene_from_pil
from satquery.segmentation import overlay_masks, run_segmentation
from satquery.validation import validate_spatial_extent

try:
    from satquery_router import extract_grounding_phrase
    from satquery_vision import (
        DEVICE,
        cpu_fallback_active,
        grounding_enabled,
        run_captioning,
        run_change_analysis,
        run_fusion_analysis,
        run_grounding,
        run_vqa,
        vlm_enabled,
    )
except Exception:  # pragma: no cover - vision stack optional in unit tests
    extract_grounding_phrase = lambda q: q
    run_captioning = run_grounding = run_vqa = None
    run_change_analysis = run_fusion_analysis = None
    grounding_enabled = lambda: False
    cpu_fallback_active = lambda: True
    vlm_enabled = lambda: False
    DEVICE = "cpu"


TOOL_SCHEMAS = [
    {
        "name": "validate_spatial_extent",
        "description": "CRS, overlap, date, and cloud pre-flight checks.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "calculate_ndvi",
        "description": "Compute NDVI vegetation index for t1 or t2.",
        "parameters": {"type": "object", "properties": {"source": {"enum": ["t1", "t2"]}}},
    },
    {
        "name": "calculate_ndwi",
        "description": "Compute NDWI water index for t1 or t2.",
        "parameters": {"type": "object", "properties": {"source": {"enum": ["t1", "t2"]}}},
    },
    {
        "name": "calculate_ndbi",
        "description": "Compute NDBI built-up index for t1 or t2.",
        "parameters": {"type": "object", "properties": {"source": {"enum": ["t1", "t2"]}}},
    },
    {
        "name": "run_segmentation",
        "description": "Pixel-level water/vegetation/built-up masks and coverage %.",
        "parameters": {"type": "object", "properties": {"source": {"enum": ["t1", "t2"]}}},
    },
    {
        "name": "run_semantic_change",
        "description": "Classify flooding, deforestation, construction, crop evolution.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "track_ndvi_anomaly",
        "description": "Agriculture template: NDVI gain/loss between dates.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "fuse_optical_sar",
        "description": "Cross-attention fusion of optical and SAR encoders.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "run_vqa",
        "description": "Answer a natural-language question about the optical tile.",
        "parameters": {"type": "object", "properties": {"question": {"type": "string"}}},
    },
    {
        "name": "run_captioning",
        "description": "Caption the optical tile with the RS-adapted BLIP model.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "run_grounding",
        "description": "Open-vocabulary boxes refined into region masks.",
        "parameters": {"type": "object", "properties": {"phrase": {"type": "string"}}},
    },
    {
        "name": "export_geojson",
        "description": "Write GeoJSON, KML, shapefile, and georeferenced masks; compute hectares.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "run_change_analysis",
        "description": "BLIP captions plus pixel-diff heatmap (CPU fallback for bi-temporal change).",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "run_fusion_analysis",
        "description": "BLIP optical/SAR captions with SAR colormap (CPU fallback for fusion).",
        "parameters": {"type": "object", "properties": {}},
    },
]


@dataclass
class AgentState:
    query: str
    scene_t1: RasterScene
    scene_t2: RasterScene | None = None
    is_sar_pair: bool = False
    template: str | None = None
    last_masks: dict = field(default_factory=dict)
    last_visual: Image.Image | None = None
    last_boxes: list = field(default_factory=list)
    exports: dict | None = None
    notes: list = field(default_factory=list)


def _scene(state: AgentState, source: str) -> RasterScene:
    if source == "t2" and state.scene_t2 is not None:
        return state.scene_t2
    return state.scene_t1


def _index_tool(state: AgentState, name: str, source: str) -> dict:
    scene = _scene(state, source)
    result = compute_index(scene.bands, name)
    mask = (result.array > result.threshold).astype(np.uint8)
    state.last_masks = {name.upper(): mask}
    state.last_visual = overlay_masks(scene.rgb, {name.upper(): mask})
    area = mask_area(scene, mask)
    return {
        "index": result.name,
        "mean": round(result.mean, 4),
        "positive_pct": round(result.positive_pct, 2),
        "threshold": result.threshold,
        "method": result.method,
        "area": area,
        "source": source,
        "band_source": scene.band_source,
        "confidence": 0.8 if scene.band_source.startswith("sentinel") else 0.58,
        "visual": result.visual,
    }


def execute_tool(name: str, args: dict, state: AgentState) -> dict:
    source = args.get("source") or "t1"
    if name == "validate_spatial_extent":
        return validate_spatial_extent(state.scene_t1, state.scene_t2)
    if name == "calculate_ndvi":
        return _index_tool(state, "ndvi", source)
    if name == "calculate_ndwi":
        return _index_tool(state, "ndwi", source)
    if name == "calculate_ndbi":
        return _index_tool(state, "ndbi", source)
    if name == "run_segmentation":
        scene = _scene(state, source)
        result = run_segmentation(scene)
        state.last_masks = result["masks"]
        state.last_visual = result["visual"]
        state.last_boxes = result["boxes"]
        return {k: v for k, v in result.items() if k != "masks"}
    if name == "run_semantic_change":
        if state.scene_t2 is None:
            return {"error": "Semantic change requires two dates.", "valid": False}
        result = semantic_change(state.scene_t1, state.scene_t2)
        state.last_masks = result["masks"]
        state.last_visual = result["visual"]
        state.last_boxes = result["boxes"]
        return {k: v for k, v in result.items() if k != "masks"}
    if name == "track_ndvi_anomaly":
        if state.scene_t2 is None:
            return {"error": "NDVI anomaly requires two dates.", "valid": False}
        result = ndvi_anomaly(state.scene_t1, state.scene_t2)
        state.last_masks = result["masks"]
        state.last_visual = result["visual"]
        state.last_boxes = result["boxes"]
        return {k: v for k, v in result.items() if k != "masks"}
    if name == "fuse_optical_sar":
        if state.scene_t2 is None:
            return {"error": "Fusion requires optical + SAR.", "valid": False}
        if cpu_fallback_active() and run_fusion_analysis is not None:
            result = run_fusion_analysis(state.scene_t1.rgb, state.scene_t2.rgb, state.query)
            if result.get("visual") is not None:
                state.last_visual = result["visual"]
            state.last_boxes = result.get("boxes") or []
            return result
        fused = fuse_optical_sar(state.scene_t1.rgb, state.scene_t2.rgb)
        seg = run_segmentation(state.scene_t1)
        state.last_masks = seg["masks"]
        state.last_visual = overlay_masks(state.scene_t1.rgb, seg["masks"])
        state.last_boxes = seg["boxes"]
        fused["coverage"] = seg["coverage"]
        fused["answer"] = (
            f"Optical-SAR fusion embedding norm={fused['embedding_norm']:.3f}. "
            f"Land-cover coverage {seg['coverage']}."
        )
        return fused
    if name == "run_change_analysis":
        if state.scene_t2 is None:
            return {"error": "Change analysis requires two dates.", "valid": False}
        if run_change_analysis is None:
            return {"error": "Change analysis unavailable"}
        result = run_change_analysis(state.scene_t1.rgb, state.scene_t2.rgb, state.query)
        if result.get("visual") is not None:
            state.last_visual = result["visual"]
        state.last_boxes = result.get("boxes") or []
        return result
    if name == "run_fusion_analysis":
        if state.scene_t2 is None:
            return {"error": "Fusion requires optical + SAR.", "valid": False}
        if run_fusion_analysis is None:
            return {"error": "Fusion analysis unavailable"}
        result = run_fusion_analysis(state.scene_t1.rgb, state.scene_t2.rgb, state.query)
        if result.get("visual") is not None:
            state.last_visual = result["visual"]
        state.last_boxes = result.get("boxes") or []
        return result
    if name == "run_vqa":
        if run_vqa is None:
            return {"error": "VQA model unavailable"}
        return run_vqa(state.scene_t1.rgb, args.get("question") or state.query)
    if name == "run_captioning":
        if run_captioning is None:
            return {"error": "Captioning model unavailable"}
        return run_captioning(state.scene_t1.rgb)
    if name == "run_grounding":
        phrase = args.get("phrase") or extract_grounding_phrase(state.query)
        if run_grounding is None or not grounding_enabled():
            result = run_segmentation(state.scene_t1)
            state.last_masks = result["masks"]
            state.last_visual = result["visual"]
            state.last_boxes = result["boxes"]
            result["method"] = "spectral-masks (GroundingDINO skipped on CPU)"
            return {k: v for k, v in result.items() if k != "masks"}
        grounded = run_grounding(state.scene_t1.rgb, phrase)
        result = run_segmentation(state.scene_t1, boxes=grounded.get("boxes"))
        state.last_masks = result["masks"]
        state.last_visual = result["visual"]
        state.last_boxes = result["boxes"] or grounded.get("boxes")
        return {
            "grounding": {k: v for k, v in grounded.items() if k != "boxes"},
            "coverage": result["coverage"],
            "answer": f"{grounded.get('answer')} Coverage: {result['coverage']}",
            "method": result["method"],
            "confidence": grounded.get("confidence") or result["confidence"],
        }
    if name == "export_geojson":
        if not state.last_masks:
            result = run_segmentation(state.scene_t1)
            state.last_masks = result["masks"]
        bundle = export_bundle(state.scene_t1 if state.scene_t2 is None else state.scene_t2, state.last_masks, "outputs")
        state.exports = bundle
        return {k: v for k, v in bundle.items()}
    return {"error": f"Unknown tool {name}"}


def _llm_plan(query: str, state: AgentState) -> list[dict] | None:
    api_key = os.getenv("SATQUERY_LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key, base_url=os.getenv("SATQUERY_LLM_BASE_URL") or None)
        model = os.getenv("SATQUERY_LLM_MODEL", "gpt-4o-mini")
        payload = {
            "query": query,
            "has_second_image": state.scene_t2 is not None,
            "sar_pair": state.is_sar_pair,
            "template": state.template,
            "tools": [s["name"] for s in TOOL_SCHEMAS],
        }
        response = client.chat.completions.create(
            model=model,
            temperature=0,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a remote-sensing agent. Return ONLY a JSON list of tool calls "
                        '[{"name": "...", "arguments": {...}}]. Use validate_spatial_extent first '
                        "for two images. End with export_geojson when the user needs maps or area."
                    ),
                },
                {"role": "user", "content": json.dumps(payload)},
            ],
        )
        text = response.choices[0].message.content or "[]"
        start, end = text.find("["), text.rfind("]")
        return json.loads(text[start : end + 1])
    except Exception:
        return None


def heuristic_plan(query: str, state: AgentState) -> list[dict]:
    q = (query or "").lower()
    template = (state.template or "").lower()
    two = state.scene_t2 is not None
    calls: list[dict] = []

    if two:
        calls.append({"name": "validate_spatial_extent", "arguments": {}})

    if template == "disaster" or any(k in q for k in ("flood", "disaster", "inundat")):
        if two:
            calls += [
                {"name": "calculate_ndwi", "arguments": {"source": "t1"}},
                {"name": "calculate_ndwi", "arguments": {"source": "t2"}},
            ]
            if cpu_fallback_active():
                calls.append({"name": "run_change_analysis", "arguments": {}})
            calls.append({"name": "run_semantic_change", "arguments": {}})
        else:
            calls.append({"name": "calculate_ndwi", "arguments": {"source": "t1"}})
        calls.append({"name": "run_segmentation", "arguments": {"source": "t2" if two else "t1"}})
        calls.append({"name": "export_geojson", "arguments": {}})
        return calls

    if template == "agriculture" or any(k in q for k in ("ndvi", "crop", "agricult", "yield", "stress")):
        if two:
            calls.append({"name": "track_ndvi_anomaly", "arguments": {}})
            if cpu_fallback_active():
                calls.append({"name": "run_change_analysis", "arguments": {}})
        calls.append({"name": "calculate_ndvi", "arguments": {"source": "t2" if two else "t1"}})
        calls.append({"name": "export_geojson", "arguments": {}})
        return calls

    if template == "change" or (two and not state.is_sar_pair):
        if cpu_fallback_active():
            calls.append({"name": "run_change_analysis", "arguments": {}})
        else:
            calls.append({"name": "run_semantic_change", "arguments": {}})
        calls.append({"name": "export_geojson", "arguments": {}})
        return calls

    if template == "landcover" or any(k in q for k in ("land cover", "land-cover", "built-up", "coverage", "ndbi")):
        if "water" in q or "ndwi" in q:
            calls.append({"name": "calculate_ndwi", "arguments": {"source": "t1"}})
        if "ndvi" in q or "veget" in q:
            calls.append({"name": "calculate_ndvi", "arguments": {"source": "t1"}})
        calls.append({"name": "run_segmentation", "arguments": {"source": "t1"}})
        calls.append({"name": "export_geojson", "arguments": {}})
        return calls

    if state.is_sar_pair:
        if cpu_fallback_active():
            calls.append({"name": "run_fusion_analysis", "arguments": {}})
        else:
            calls.append({"name": "fuse_optical_sar", "arguments": {}})
        calls.append({"name": "export_geojson", "arguments": {}})
        return calls

    if any(k in q for k in ("highlight", "locate", "where is", "segment", "region")):
        if grounding_enabled():
            calls.append({"name": "run_grounding", "arguments": {"phrase": extract_grounding_phrase(query)}})
        else:
            calls.append({"name": "run_segmentation", "arguments": {"source": "t1"}})
        calls.append({"name": "export_geojson", "arguments": {}})
        return calls

    if any(k in q for k in ("ndwi", "water")):
        calls.append({"name": "calculate_ndwi", "arguments": {"source": "t1"}})
        calls.append({"name": "run_segmentation", "arguments": {"source": "t1"}})
        calls.append({"name": "export_geojson", "arguments": {}})
        return calls

    if "describe" in q or "caption" in q or "land-cover" in q or "land cover" in q:
        calls.append({"name": "run_segmentation", "arguments": {"source": "t1"}})
        calls.append({"name": "run_captioning", "arguments": {}})
        return calls

    calls.append({"name": "run_segmentation", "arguments": {"source": "t1"}})
    calls.append({"name": "run_vqa", "arguments": {"question": query}})
    return calls


def _jsonable(value):
    if isinstance(value, Image.Image):
        return "<image>"
    if isinstance(value, np.ndarray):
        return {"ndarray": list(value.shape)}
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def run_agent(
    query: str,
    image1: Image.Image | None,
    image2: Image.Image | None,
    sar_pair: bool,
    geotiff1: str | None = None,
    geotiff2: str | None = None,
    template: str | None = None,
) -> dict:
    t0 = time.time()
    trace = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "query": query,
        "template": template,
        "planner": "heuristic",
        "tool_schemas": [s["name"] for s in TOOL_SCHEMAS],
        "steps": [],
    }

    if geotiff1:
        scene_t1 = load_scene_from_path(geotiff1)
    elif image1 is not None:
        scene_t1 = scene_from_pil(image1)
    else:
        trace["steps"].append({"step": "validation", "result": "FAILED - no image provided"})
        return {
            "answer": "Please upload at least one image or GeoTIFF.",
            "visual": None,
            "boxes": [],
            "trace": trace,
            "exports": None,
        }

    scene_t2 = None
    if geotiff2:
        scene_t2 = load_scene_from_path(geotiff2)
    elif image2 is not None:
        scene_t2 = scene_from_pil(image2)

    state = AgentState(
        query=query or "",
        scene_t1=scene_t1,
        scene_t2=scene_t2,
        is_sar_pair=bool(sar_pair),
        template=template,
    )

    plan = _llm_plan(query, state)
    if plan:
        trace["planner"] = "llm-function-calling"
    else:
        plan = heuristic_plan(query, state)
        trace["planner"] = "heuristic-function-calling"

    trace["steps"].append({"step": "plan", "calls": plan, "confidence": 0.9 if trace["planner"].startswith("llm") else 0.75})

    answers = []
    for call in plan:
        name = call.get("name")
        args = call.get("arguments") or {}
        step = {"step": "tool_call", "tool": name, "params": args}
        try:
            result = execute_tool(name, args, state)
            visual = result.pop("visual", None)
            if visual is not None:
                state.last_visual = visual
            step["result"] = _jsonable(result)
            step["confidence"] = result.get("confidence")
            if result.get("answer"):
                answers.append(str(result["answer"]))
            elif name.startswith("calculate_"):
                answers.append(
                    f"{result.get('index')} mean={result.get('mean')} "
                    f"positive={result.get('positive_pct')}% area={result.get('area')}"
                )
            elif name == "validate_spatial_extent":
                answers.append(
                    f"Spatial validation valid={result.get('valid')} "
                    f"warnings={result.get('warnings')}"
                )
            elif name == "export_geojson":
                answers.append(f"Exported {result.get('feature_count')} features to {result.get('zip')}")
        except Exception as exc:
            step["error"] = str(exc)
            step["traceback"] = traceback.format_exc()[-600:]
            result = {"error": str(exc)}
        trace["steps"].append(step)

    trace["elapsed_seconds"] = round(time.time() - t0, 2)
    visual = state.last_visual or state.scene_t1.rgb
    boxes = state.last_boxes or []
    answer = "\n".join(answers) if answers else "Agent completed with no textual findings."
    return {
        "answer": answer,
        "visual": visual,
        "boxes": boxes,
        "trace": trace,
        "exports": state.exports,
        "rgb_t1": state.scene_t1.rgb,
        "rgb_t2": state.scene_t2.rgb if state.scene_t2 else None,
    }
