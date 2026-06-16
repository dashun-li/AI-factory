"""
WhisperX server exposing /asr (transcribe + diarize) and /align
(word-level alignment). Compatible with subtitle-service HTTP calls.

HuggingFace token is required for pyannote diarization; pass via
HF_TOKEN env var.
"""
from __future__ import annotations

import os
import tempfile
from typing import Optional

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
import whisperx

MODEL_NAME = os.environ.get("WHISPER__MODEL", "large-v3")
DEVICE = os.environ.get("WHISPER__DEVICE", "cuda")
COMPUTE_TYPE = os.environ.get("WHISPER__COMPUTE_TYPE", "float16")
HF_TOKEN = os.environ.get("HF_TOKEN", "")
LANGUAGE_DEFAULT = os.environ.get("WHISPER__LANGUAGE", "zh")

app = FastAPI(title="whisperx-server", version="1.0.0")

_model = None
_align_model_cache: dict = {}
_diarize_pipeline = None


def get_model():
    global _model
    if _model is None:
        _model = whisperx.load_model(MODEL_NAME, DEVICE, compute_type=COMPUTE_TYPE)
    return _model


def get_align_model(language: str):
    if language not in _align_model_cache:
        model, meta = whisperx.load_align_model(language_code=language, device=DEVICE)
        _align_model_cache[language] = (model, meta)
    return _align_model_cache[language]


def get_diarize_pipeline():
    global _diarize_pipeline
    if _diarize_pipeline is None:
        if not HF_TOKEN:
            raise HTTPException(
                status_code=500,
                detail="HF_TOKEN is required for speaker diarization",
            )
        _diarize_pipeline = whisperx.DiarizationPipeline(
            use_auth_token=HF_TOKEN, device=DEVICE
        )
    return _diarize_pipeline


def _save_upload(upload: UploadFile) -> str:
    suffix = os.path.splitext(upload.filename or ".bin")[1] or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(upload.file.read())
        return tmp.name


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": MODEL_NAME, "device": DEVICE}


@app.post("/asr")
async def asr(
    file: UploadFile = File(...),
    language: Optional[str] = Form(default=LANGUAGE_DEFAULT),
    diarize: bool = Form(default=False),
    min_speakers: Optional[int] = Form(default=None),
    max_speakers: Optional[int] = Form(default=None),
) -> JSONResponse:
    path = _save_upload(file)
    try:
        audio = whisperx.load_audio(path)
        model = get_model()
        result = model.transcribe(audio, language=language, vad_filter=True)

        if diarize:
            try:
                pipeline = get_diarize_pipeline()
                diar = pipeline(
                    audio,
                    min_speakers=min_speakers,
                    max_speakers=max_speakers,
                )
                result = whisperx.assign_word_speakers(diar, result)
            except HTTPException:
                raise
            except Exception as exc:  # pragma: no cover - diarization flake
                result.get("segments", [])
                # continue without diarization on transient errors

        return JSONResponse(content=result)
    finally:
        os.unlink(path)


@app.post("/align")
async def align(
    file: UploadFile = File(...),
    language: Optional[str] = Form(default=LANGUAGE_DEFAULT),
    transcript: Optional[str] = Form(default=None),
) -> JSONResponse:
    path = _save_upload(file)
    try:
        audio = whisperx.load_audio(path)
        model_a, metadata = get_align_model(language)

        # If a transcript is provided, use it; otherwise transcribe first.
        if transcript:
            segments = [{"text": transcript}]
            result_in = {"segments": segments, "language": language}
        else:
            model = get_model()
            result_in = model.transcribe(audio, language=language, vad_filter=True)

        aligned = whisperx.align(
            result_in["segments"],
            model_a,
            metadata,
            audio,
            DEVICE,
            return_char_alignments=False,
        )
        return JSONResponse(content=aligned)
    finally:
        os.unlink(path)
