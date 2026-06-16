"""
Minimal OpenAI-compatible Faster-Whisper server.

Endpoints:
  GET  /health                 → liveness probe
  POST /v1/audio/transcriptions → OpenAI-style transcription

Models are loaded lazily on first request and cached for the lifetime
of the process. CTranslate2 selects CPU/CUDA automatically based on
the runtime environment.
"""
from __future__ import annotations

import os
import tempfile
from typing import Optional

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel

MODEL_NAME = os.environ.get("WHISPER__MODEL", "large-v3")
DEVICE = os.environ.get("WHISPER__DEVICE", "auto")
COMPUTE_TYPE = os.environ.get("WHISPER__COMPUTE_TYPE", "int8")

app = FastAPI(title="faster-whisper-server", version="1.0.0")
_model: Optional[WhisperModel] = None


def get_model() -> WhisperModel:
    """Lazy-load the model so the container can start without GPU drivers
    mounted during build."""
    global _model
    if _model is None:
        _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
    return _model


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form(default=None),
    response_format: str = Form(default="json"),
) -> JSONResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="missing file")

    suffix = os.path.splitext(file.filename)[1] or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        model = get_model()
        segments, info = model.transcribe(
            tmp_path,
            language=language,
            vad_filter=True,
            beam_size=5,
        )
        seg_list = list(segments)
    finally:
        os.unlink(tmp_path)

    text = " ".join(s.text.strip() for s in seg_list)
    if response_format == "text":
        return JSONResponse(content={"text": text})

    return JSONResponse(
        content={
            "text": text,
            "language": info.language,
            "duration": info.duration,
            "segments": [
                {
                    "id": s.id,
                    "start": s.start,
                    "end": s.end,
                    "text": s.text.strip(),
                }
                for s in seg_list
            ],
        }
    )
