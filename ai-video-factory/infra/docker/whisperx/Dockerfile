# WhisperX (alignment + diarization)
#
# Extends Faster-Whisper with word-level timestamp alignment (via wav2vec)
# and speaker diarization (via pyannote). The runtime image must have GPU
# access for the alignment/diarization models to load.

FROM python:3.11-slim AS runtime

# ---- System deps (ffmpeg for audio decode, libsndfile for wav i/o) ----
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        ffmpeg \
        libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Python deps ----
# whisperx pulls torch/torchaudio transitively; CPU wheel is fine for the
# `align` endpoint. GPU runtime is configured via env vars.
RUN pip install --no-cache-dir \
        "whisperx==3.4.2" \
        "fastapi==0.115.0" \
        "uvicorn[standard]==0.30.6" \
        "python-multipart==0.0.9"

COPY server.py /app/server.py

ENV WHISPER__MODEL=large-v3 \
    WHISPER__COMPUTE_TYPE=float16 \
    WHISPER__DEVICE=cuda \
    HF_HOME=/root/.cache/huggingface

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
