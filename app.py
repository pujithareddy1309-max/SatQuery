"""
SatQuery AI — production-oriented remote-sensing vision-language assistant.

    python app.py
    SATQUERY_LLM_API_KEY=...   optional OpenAI-compatible function calling
    SATQUERY_ENABLE_VLM=1      Qwen2-VL for free-form VQA
    SATQUERY_SHARE=1            public Gradio link
"""

from __future__ import annotations

import json
import os

import gradio as gr
import numpy as np
from PIL import Image

from satquery.agent import run_agent
from satquery.demo import make_demo_samples
from satquery_vision import DEVICE, vlm_enabled

SAMPLES = make_demo_samples()


def blend(t1, t2, opacity: float):
    if t1 is None:
        return None
    a = t1.convert("RGB") if isinstance(t1, Image.Image) else Image.fromarray(t1).convert("RGB")
    if t2 is None:
        return a
    b = t2.convert("RGB") if isinstance(t2, Image.Image) else Image.fromarray(t2).convert("RGB")
    b = b.resize(a.size)
    return Image.blend(a, b, float(opacity))


def run_pipeline(image1, image2, sar_checkbox, query, geotiff1, geotiff2, template):
    result = run_agent(
        query=query,
        image1=image1,
        image2=image2,
        sar_pair=bool(sar_checkbox),
        geotiff1=geotiff1,
        geotiff2=geotiff2,
        template=template if template and template != "auto" else None,
    )
    visual = result["visual"] or image1
    boxes = result.get("boxes") or []
    annotated = (np.array(visual.convert("RGB")), boxes)
    export_path = None
    if result.get("exports"):
        export_path = result["exports"].get("zip")
    return (
        result["answer"],
        annotated,
        json.dumps(result["trace"], indent=2),
        export_path,
        result.get("rgb_t1"),
        result.get("rgb_t2"),
        blend(result.get("rgb_t1"), result.get("rgb_t2"), 0.5),
    )


def apply_preset(name: str):
    presets = {
        "Flood Risk": (
            "Map flood extent, water coverage, and affected area in hectares.",
            "disaster",
            False,
        ),
        "Land Cover": (
            "Segment water, vegetation, and built-up areas and report coverage percentages.",
            "landcover",
            False,
        ),
        "Change Detection": (
            "Classify construction, flooding, deforestation, and crop evolution between these two dates.",
            "change",
            False,
        ),
        "Agriculture": (
            "Track NDVI anomalies and vegetation loss/gain between acquisitions.",
            "agriculture",
            False,
        ),
        "Optical–SAR Fusion": (
            "Fuse optical and SAR streams to identify built-up and water-covered regions.",
            "auto",
            True,
        ),
    }
    query, template, sar = presets[name]
    return query, template, sar


with gr.Blocks(title="SatQuery AI") as demo:
    gr.Markdown(
        """
        ## SatQuery AI — Remote-sensing vision-language assistant
        Autonomous tool loop (NDVI/NDWI/NDBI, pixel segmentation, semantic change, spatial validation, GeoJSON export).
        Optional LLM function calling via `SATQUERY_LLM_API_KEY`.
        """
    )
    gr.Markdown(
        f"**Runtime:** `{DEVICE}` · **Qwen2-VL:** "
        f"{'enabled' if vlm_enabled() else 'CPU fallbacks'} · "
        f"**Planner:** {'LLM' if os.getenv('SATQUERY_LLM_API_KEY') or os.getenv('OPENAI_API_KEY') else 'structured tool calling'}"
    )

    template = gr.Radio(
        ["auto", "disaster", "agriculture", "landcover", "change"],
        value="auto",
        label="Operational template",
    )

    with gr.Row():
        flood_btn = gr.Button("Flood Risk")
        lc_btn = gr.Button("Land Cover")
        chg_btn = gr.Button("Change Detection")
        ag_btn = gr.Button("Agriculture")
        fus_btn = gr.Button("Optical–SAR Fusion")

    with gr.Row():
        image1 = gr.Image(type="pil", label="Image 1 (optical / t1)", value=SAMPLES["water"])
        image2 = gr.Image(type="pil", label="Image 2 (t2 or SAR)")

    with gr.Row():
        sar_checkbox = gr.Checkbox(label="Image 2 is SAR (co-registered pair)")
        query = gr.Textbox(
            label="Query",
            value="Segment water, vegetation, and built-up coverage in this image.",
        )

    opacity = gr.Slider(0, 1, value=0.5, step=0.05, label="Before/after overlay opacity (t2)")

    with gr.Accordion("GeoTIFF ingest (Sentinel-2 stacks, CRS/QA)", open=True):
        geotiff1 = gr.File(label="GeoTIFF t1", file_types=[".tif", ".tiff"], type="filepath")
        geotiff2 = gr.File(label="GeoTIFF t2 / SAR", file_types=[".tif", ".tiff"], type="filepath")

    submit = gr.Button("Run SatQuery agent", variant="primary")

    with gr.Row():
        answer_out = gr.Textbox(label="Answer", lines=10)
        boxes_out = gr.AnnotatedImage(label="Visual evidence (masks / boxes)")
    blend_out = gr.Image(label="Temporal blend")
    trace_out = gr.Code(label="Execution trace", language="json")
    export_out = gr.File(label="Geospatial export (zip: GeoJSON / KML / SHP / GeoTIFF masks)")

    state_t1 = gr.State()
    state_t2 = gr.State()

    submit.click(
        fn=run_pipeline,
        inputs=[image1, image2, sar_checkbox, query, geotiff1, geotiff2, template],
        outputs=[answer_out, boxes_out, trace_out, export_out, state_t1, state_t2, blend_out],
    )
    opacity.change(fn=blend, inputs=[state_t1, state_t2, opacity], outputs=[blend_out])

    flood_btn.click(lambda: apply_preset("Flood Risk"), outputs=[query, template, sar_checkbox])
    lc_btn.click(lambda: apply_preset("Land Cover"), outputs=[query, template, sar_checkbox])
    chg_btn.click(lambda: apply_preset("Change Detection"), outputs=[query, template, sar_checkbox])
    ag_btn.click(lambda: apply_preset("Agriculture"), outputs=[query, template, sar_checkbox])
    fus_btn.click(lambda: apply_preset("Optical–SAR Fusion"), outputs=[query, template, sar_checkbox])

    gr.Examples(
        examples=[
            [SAMPLES["water"], None, False, "Segment water, vegetation, and built-up coverage in this image.", "landcover"],
            [SAMPLES["t1"], SAMPLES["t2"], False, "Classify deforestation and construction between these two dates.", "change"],
            [SAMPLES["optical"], SAMPLES["sar"], True, "Fuse optical and SAR to identify built-up regions.", "auto"],
        ],
        inputs=[image1, image2, sar_checkbox, query, template],
        label="Quick examples",
    )

if __name__ == "__main__":
    share = os.getenv("SATQUERY_SHARE", "0").lower() in {"1", "true", "yes"}
    demo.launch(
        share=share,
        debug=True,
        theme=gr.themes.Soft(primary_hue="slate", secondary_hue="emerald"),
        allowed_paths=[os.path.abspath("assets"), os.path.abspath("outputs")],
    )
