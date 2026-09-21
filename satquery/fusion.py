"""Decoupled optical / SAR encoders and a cross-attention fusion block."""

from __future__ import annotations

import os

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
ENABLE_CLIP = os.getenv("SATQUERY_ENABLE_CLIP", "0").lower() in {"1", "true", "yes"}


def lee_filter(image: np.ndarray, size: int = 5) -> np.ndarray:
    """Speckle-aware SAR despeckling (Lee filter)."""
    img = image.astype(np.float32)
    mean = cv2.blur(img, (size, size))
    mean_sq = cv2.blur(img * img, (size, size))
    var = np.clip(mean_sq - mean * mean, 0, None)
    overall = float(np.var(img) + 1e-6)
    weights = var / (var + overall)
    return mean + weights * (img - mean)


class FrozenOpticalEncoder(nn.Module):
    """CLIP ViT visual tower when enabled; otherwise a frozen RGB CNN."""

    def __init__(self, dim: int = 256):
        super().__init__()
        self.dim = dim
        self.clip = None
        self.clip_proc = None
        if ENABLE_CLIP:
            try:
                from transformers import CLIPModel, CLIPProcessor

                model_id = os.getenv("SATQUERY_OPTICAL_ENCODER", "openai/clip-vit-base-patch32")
                self.clip_proc = CLIPProcessor.from_pretrained(model_id)
                self.clip = CLIPModel.from_pretrained(model_id).to(DEVICE)
                self.clip.eval()
                for p in self.clip.parameters():
                    p.requires_grad = False
            except Exception:
                self.clip = None
        self.cnn = nn.Sequential(
            nn.Conv2d(3, 64, 3, stride=2, padding=1),
            nn.ReLU(),
            nn.Conv2d(64, dim, 3, stride=2, padding=1),
            nn.ReLU(),
        )
        for p in self.cnn.parameters():
            p.requires_grad = False

    @torch.no_grad()
    def forward(self, rgb: torch.Tensor) -> torch.Tensor:
        if self.clip is not None:
            # rgb: B,3,H,W in 0-1
            tokens = self.clip.vision_model(pixel_values=rgb).last_hidden_state
            return tokens
        feats = self.cnn(rgb)
        b, c, h, w = feats.shape
        return feats.flatten(2).transpose(1, 2)


class SpeckleAwareSAREncoder(nn.Module):
    def __init__(self, dim: int = 256):
        super().__init__()
        self.cnn = nn.Sequential(
            nn.Conv2d(1, 32, 3, padding=1),
            nn.ReLU(),
            nn.Conv2d(32, 64, 3, stride=2, padding=1),
            nn.ReLU(),
            nn.Conv2d(64, dim, 3, stride=2, padding=1),
            nn.ReLU(),
        )

    def forward(self, sar: torch.Tensor) -> torch.Tensor:
        feats = self.cnn(sar)
        return feats.flatten(2).transpose(1, 2)


class CrossAttentionFusion(nn.Module):
    """SAR tokens attend to optical tokens (and vice versa), then concatenate."""

    def __init__(self, dim: int = 256, heads: int = 4):
        super().__init__()
        self.opt_q = nn.Linear(dim, dim)
        self.sar_q = nn.Linear(dim, dim)
        self.opt_kv = nn.Linear(dim, dim * 2)
        self.sar_kv = nn.Linear(dim, dim * 2)
        self.heads = heads
        self.scale = (dim // heads) ** -0.5
        self.out = nn.Sequential(nn.Linear(dim * 2, dim), nn.ReLU(), nn.Linear(dim, dim))

    def _attn(self, q, kv):
        k, v = kv.chunk(2, dim=-1)
        b, n, d = q.shape
        h = self.heads
        dh = d // h
        q = q.view(b, n, h, dh).transpose(1, 2)
        k = k.view(b, -1, h, dh).transpose(1, 2)
        v = v.view(b, -1, h, dh).transpose(1, 2)
        scores = (q @ k.transpose(-2, -1)) * self.scale
        weights = torch.softmax(scores, dim=-1)
        out = (weights @ v).transpose(1, 2).contiguous().view(b, n, d)
        return out

    def forward(self, optical_tokens: torch.Tensor, sar_tokens: torch.Tensor) -> torch.Tensor:
        opt_to_sar = self._attn(self.opt_q(optical_tokens), self.sar_kv(sar_tokens))
        sar_to_opt = self._attn(self.sar_q(sar_tokens), self.opt_kv(optical_tokens))
        fused_opt = optical_tokens + opt_to_sar
        fused_sar = sar_tokens + sar_to_opt
        pooled = torch.cat([fused_opt.mean(1), fused_sar.mean(1)], dim=-1)
        return self.out(pooled)


_FUSION: dict = {}


def get_fusion_modules():
    if "bundle" not in _FUSION:
        optical = FrozenOpticalEncoder().to(DEVICE).eval()
        sar = SpeckleAwareSAREncoder().to(DEVICE).eval()
        fuse = CrossAttentionFusion().to(DEVICE).eval()
        _FUSION["bundle"] = (optical, sar, fuse)
    return _FUSION["bundle"]


def _to_tensor_rgb(image: Image.Image, size: int = 224) -> torch.Tensor:
    arr = np.asarray(image.convert("RGB").resize((size, size)), dtype=np.float32) / 255.0
    return torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0).to(DEVICE)


def _to_tensor_sar(image: Image.Image, size: int = 224) -> torch.Tensor:
    gray = np.asarray(image.convert("L"), dtype=np.float32)
    filtered = lee_filter(gray)
    db = 10.0 * np.log10(filtered + 1e-6)
    db = cv2.resize(db, (size, size))
    lo, hi = np.percentile(db, (2, 98))
    db = np.clip((db - lo) / (hi - lo + 1e-6), 0, 1)
    return torch.from_numpy(db).unsqueeze(0).unsqueeze(0).to(DEVICE)


@torch.no_grad()
def fuse_optical_sar(optical: Image.Image, sar: Image.Image) -> dict:
    optical_enc, sar_enc, fuse = get_fusion_modules()
    opt_t = optical_enc(_to_tensor_rgb(optical))
    sar_t = sar_enc(_to_tensor_sar(sar))
    if opt_t.shape[1] != sar_t.shape[1]:
        sar_t = F.interpolate(
            sar_t.transpose(1, 2), size=opt_t.shape[1], mode="linear", align_corners=False
        ).transpose(1, 2)
    embedding = fuse(opt_t, sar_t).cpu().numpy().reshape(-1)
    energy = float(np.linalg.norm(embedding))
    return {
        "embedding_dim": int(embedding.size),
        "embedding_norm": energy,
        "method": "frozen-optical + Lee-filtered SAR + cross-attention",
        "clip_loaded": get_fusion_modules()[0].clip is not None,
        "confidence": min(0.9, 0.45 + energy / (energy + 8.0)),
    }
