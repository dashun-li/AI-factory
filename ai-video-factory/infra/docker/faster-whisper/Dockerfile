# Faster-Whisper Server
#
# Speech-to-Text service built on faster-whisper (CTranslate2 backend).
# Exposes an OpenAI-compatible HTTP API on port 8000.
# Models are downloaded at runtime and cached in /root/.cache/huggingface.

FROM python:3.11-slim AS runtime

# ---- System deps ----
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Python deps ----
# Pin faster-whisper for stable CTranslate2 kernels.
RUN pip install --no-cache-dir \
        "faster-whisper==1.0.3" \
        "fastapi==0.115.0" \
        "uvicorn[standard]==0.30.6" \
        "python-multipart==0.0.9"

# ---- App server ----
COPY server.py /app/server.py

ENV WHISPER__MODEL=large-v3 \
    WHISPER__COMPUTE_TYPE=int8 \
    WHISPER__DEVICE=auto

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
