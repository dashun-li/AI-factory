"""
CosyVoice2 HTTP wrapper for media-service integration.

POST /tts   → synthesize speech from text
GET  /health → liveness probe

Model is loaded lazily on first request.
"""
from __future__ import annotations

import os
import tempfile
from typing import Optional, List

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

app = FastAPI(title="cosyvoice-server", version="1.0.0")

MODEL_DIR = os.environ.get("PRETRAINED_MODELS_DIR", "/workspace/pretrained_models")
DEVICE = os.environ.get("COSYVOICE__DEVICE", "cuda")

_model = None


def get_model():
    """Lazy-load CosyVoice2 model on first request."""
    global _model
    if _model is None:
        try:
            from cosyvoice.cli.cosyvoice import CosyVoice2  # type: ignore
        except ImportError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"CosyVoice2 not available: {exc}",
            )
        if not os.path.isdir(MODEL_DIR):
            raise HTTPException(
                status_code=500,
                detail=f"pretrained models missing at {MODEL_DIR}",
            )
        _model = CosyVoice2(MODEL_DIR)
    return _model


class TTSRequest(BaseModel):
    text: str = Field(..., description="Text to synthesize")
    voice: Optional[str] = Field(
        default=None,
        description="Voice/speaker name; defaults to built-in voice",
    )
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    format: str = Field(default="wav", pattern="^(wav|mp3)$")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "device": DEVICE, "model_dir": MODEL_DIR}


@app.post("/tts")
def tts(req: TTSRequest):
    model = get_model()
    chunks: List[bytes] = []
    for chunk in model.inference_sft(req.text, req.voice or "default", stream=False):
        # CosyVoice returns dicts containing `tts_wav` numpy arrays
        wav = chunk.get("tts_wav") if isinstance(chunk, dict) else None
        if wav is None:
            continue
        # Convert numpy float32 → int16 PCM bytes
        import numpy as np  # local import to avoid load cost on healthcheck
        pcm = (wav * 32767).astype(np.int16).tobytes()
        chunks.append(pcm)

    if not chunks:
        raise HTTPException(status_code=500, detail="synthesis produced no audio")

    suffix = ".wav" if req.format == "wav" else ".mp3"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as out:
        out.write(b"".join(chunks))
        out_path = out.name

    return FileResponse(
        out_path,
        media_type="audio/wav" if req.format == "wav" else "audio/mpeg",
        filename=f"tts{suffix}",
    )
