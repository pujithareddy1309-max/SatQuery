"""Compact, auditable JSON traces (no nested tensors or dump of full tool schemas)."""

from __future__ import annotations

from datetime import datetime, timezone

KEEP_KEYS = (
    "answer",
    "method",
    "confidence",
    "device",
    "fallback",
    "skipped",
    "valid",
    "crs_match",
    "spatial_overlap",
    "overlap_ratio",
    "date_delta_days",
    "cloud_pct",
    "index",
    "mean",
    "positive_pct",
    "source",
    "coverage",
    "dominant",
    "feature_count",
    "zip",
    "hectares",
    "square_meters",
    "num_boxes",
    "error",
)


def compact_value(value, depth: int = 0):
    if depth > 2:
        return str(type(value).__name__)
    if value is None or isinstance(value, (bool, int, float, str)):
        if isinstance(value, str) and len(value) > 280:
            return value[:277] + "..."
        return value
    if isinstance(value, dict):
        if "hectares" in value and "square_meters" in value:
            return {"hectares": value.get("hectares"), "m2": value.get("square_meters")}
        out = {}
        for key, item in list(value.items())[:12]:
            if key in {"visual", "masks", "boxes", "embedding", "traceback", "tags"}:
                continue
            out[key] = compact_value(item, depth + 1)
        return out
    if isinstance(value, (list, tuple)):
        if not value:
            return []
        if isinstance(value[0], (list, tuple)) and len(value[0]) == 2:
            return len(value)
        return [compact_value(v, depth + 1) for v in value[:8]]
    return str(value)[:160]


def summarize_result(tool: str, result: dict) -> str:
    if not isinstance(result, dict):
        return str(result)
    if result.get("error"):
        return f"error: {result['error']}"
    if tool == "validate_spatial_extent":
        return (
            f"valid={result.get('valid')} crs_match={result.get('crs_match')} "
            f"overlap={result.get('spatial_overlap')}"
        )
    if tool.startswith("calculate_"):
        return f"{result.get('index')} mean={result.get('mean')} positive={result.get('positive_pct')}%"
    if result.get("answer"):
        text = str(result["answer"]).replace("\n", " ")
        return text[:220]
    if "coverage" in result:
        return f"coverage={result['coverage']}"
    if "feature_count" in result:
        return f"exported {result.get('feature_count')} features"
    return result.get("method") or "ok"


def slim_result(result: dict) -> dict:
    if not isinstance(result, dict):
        return {"value": compact_value(result)}
    slim = {}
    for key in KEEP_KEYS:
        if key in result and result[key] is not None:
            slim[key] = compact_value(result[key])
    if "area" in result:
        slim["area"] = compact_value(result["area"])
    if "boxes" in result and result["boxes"] is not None:
        slim["num_boxes"] = len(result["boxes"]) if hasattr(result["boxes"], "__len__") else 0
    if result.get("warnings"):
        slim["warnings"] = result["warnings"][:4]
    return slim


def new_trace(query: str, extra: dict | None = None) -> dict:
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "query": query,
        "steps": [],
    }
    if extra:
        payload.update(extra)
    return payload


def append_tool_step(trace: dict, idx: int, tool: str, params: dict, result: dict, status: str = "ok"):
    step = {
        "id": idx,
        "tool": tool,
        "params": compact_value(params) if params else {},
        "status": status,
        "summary": summarize_result(tool, result if isinstance(result, dict) else {"answer": result}),
        "result": slim_result(result if isinstance(result, dict) else {}),
    }
    if isinstance(result, dict) and result.get("confidence") is not None:
        step["confidence"] = result.get("confidence")
    trace["steps"].append(step)
    return step
