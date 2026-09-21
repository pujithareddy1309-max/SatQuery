"""Query parsing and tool routing for SatQuery AI."""

from __future__ import annotations

import re

CHANGE_KEYWORDS = [
    "change",
    "changed",
    "difference",
    "compare",
    "increase",
    "decrease",
    "between these two",
    "before and after",
    "over time",
    "two dates",
]
GROUNDING_KEYWORDS = [
    "highlight",
    "locate",
    "find",
    "where is",
    "where are",
    "point out",
    "region",
    "draw a box",
    "bounding box",
    "show me",
]
FUSION_KEYWORDS = [
    "sar",
    "radar",
    "fusion",
    "combine",
    "together",
    "both images",
    "optical and sar",
]
CAPTION_KEYWORDS = [
    "caption",
    "describe",
    "summarize",
    "what does this image show",
    "land cover",
    "land-cover",
]
VQA_KEYWORDS = [
    "how many",
    "is there",
    "are there",
    "what is",
    "what are",
    "which",
    "does this",
    "can you tell",
]

_GROUNDING_PATTERNS = [
    r"(?:highlight|locate|find|point out|show me)\s+(?:the |a |an )?(.+?)(?:\s+(?:in|from|on|referred).*)?$",
    r"where (?:is|are)\s+(?:the |a |an )?(.+?)(?:\?|$)",
]


def _contains_any(text: str, keywords: list[str]) -> bool:
    return any(keyword in text for keyword in keywords)


def extract_grounding_phrase(query: str) -> str:
    """Turn a natural-language request into a GroundingDINO phrase."""
    raw = (query or "").strip()
    if not raw:
        return "building . water . vegetation . road"

    lowered = raw.lower().rstrip(".")
    for pattern in _GROUNDING_PATTERNS:
        match = re.search(pattern, lowered, flags=re.IGNORECASE)
        if match:
            phrase = match.group(1).strip(" .")
            phrase = re.sub(r"\s+", " ", phrase)
            if phrase:
                return phrase

    return lowered


def classify_task(query: str, num_images: int, is_sar_pair: bool) -> dict:
    """Return a routing plan: primary task plus optional follow-up tools."""
    q = (query or "").lower()
    wants_grounding = _contains_any(q, GROUNDING_KEYWORDS)
    wants_caption = _contains_any(q, CAPTION_KEYWORDS)
    wants_vqa = _contains_any(q, VQA_KEYWORDS)

    if num_images == 2:
        if is_sar_pair or _contains_any(q, FUSION_KEYWORDS):
            return {
                "task": "fusion_analysis",
                "grounding_phrase": None,
                "also_caption": False,
            }
        return {
            "task": "change_analysis",
            "grounding_phrase": None,
            "also_caption": False,
        }

    if wants_grounding:
        return {
            "task": "grounding",
            "grounding_phrase": extract_grounding_phrase(query),
            "also_caption": wants_caption or not wants_vqa,
        }

    if wants_vqa and not wants_caption:
        return {"task": "vqa", "grounding_phrase": None, "also_caption": False}

    if wants_caption:
        return {"task": "caption", "grounding_phrase": None, "also_caption": False}

    return {"task": "vqa", "grounding_phrase": None, "also_caption": False}
