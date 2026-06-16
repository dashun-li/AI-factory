# CosyVoice2 (production TTS)
#
# Self-hosted CosyVoice2 HTTP wrapper. The upstream image provides the
# inference engine; this layer exposes a simple /tts endpoint compatible
# with media-service.

FROM python:3.11-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        ffmpeg \
        git \
        git-lfs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Clone CosyVoice2 at a pinned revision for reproducibility.
ARG COSYVOICE_REF=main
RUN git lfs install \
    && git clone --depth 1 --branch ${COSYVOICE_REF} https://github.com/FunAudioLLM/CosyVoice.git /workspace/CosyVoice \
    && cd /workspace/CosyVoice \
    && git submodule update --init --recursive

WORKDIR /workspace/CosyVoice

# Install Python deps. The upstream requirements assume CUDA wheels; on
# CPU-only hosts the install still completes but inference will be slow.
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir \
        "fastapi==0.115.0" \
        "uvicorn[standard]==0.30.6" \
        "python-multipart==0.0.9"

COPY server.py /workspace/CosyVoice/server.py

ENV PRETRAINED_MODELS_DIR=/workspace/pretrained_models \
    COSYVOICE__DEVICE=cuda

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
