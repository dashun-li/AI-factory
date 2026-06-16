# AI Video Factory

End-to-end pipeline that turns trending short-form videos into AI-rewritten, narrated, subtitled clips ready for TikTok / 抖音 / 小红书 / etc.

## High-level architecture

```
┌────────────┐    HTTP    ┌──────────────────┐    BullMQ    ┌──────────────────┐
│   Web UI   │ ─────────► │   API Gateway    │ ──────────►  │  Workers         │
│  (Next.js) │ ◄───────── │  (NestJS + WS)   │ ◄──────────  │  (BullMQ)        │
└────────────┘    WSS     └──────────────────┘              └──────────────────┘
                                          │                           │
                                          ▼                           ▼
                          ┌────────────────────────┐    ┌──────────────────────┐
                          │  PostgreSQL / Redis    │    │  AI Services         │
                          │  (state, cache, queue) │    │  (Claude, Fal, ...)  │
                          └────────────────────────┘    └──────────────────────┘
                                          │                           │
                                          ▼                           ▼
                          ┌──────────────────────────────────────────────────┐
                          │  Milvus (vector) + MinIO (object storage)         │
                          └──────────────────────────────────────────────────┘
```

The full pipeline has 8 stages:

1. **Trend discovery** — fetch metadata for a source URL (抖音 / TikTok / etc.)
2. **Content extraction** — download, extract audio, transcribe (Faster-Whisper)
3. **Analysis** — 3-round LLM analysis (structure / emotion / viral) → Milvus
4. **Script generation** — generate original script in the same structure (Claude)
5. **Media generation** — generate per-scene images (Fal.ai Flux.1-dev) / video (Kling)
6. **TTS voice** — synthesize narration (Edge-TTS or CosyVoice2)
7. **Subtitles** — word-level alignment (WhisperX) → SRT/VTT/ASS
8. **Render** — Remotion → MP4 → MinIO

## Repository layout

```
.
├── apps/
│   ├── api/                # NestJS API gateway (REST + WebSocket)
│   ├── web/                # Next.js 15 dashboard
│   ├── remotion-templates/ # Remotion video composition
│   └── worker/             # BullMQ workers (workflow, analysis, render, ...)
├── services/               # Domain service libraries
│   ├── analysis-service/   # 3-round LLM analysis
│   ├── script-service/     # Script generation + RAG
│   ├── content-service/    # Video download + audio extraction + ASR
│   ├── media-service/      # Image / video / TTS generation
│   ├── subtitle-service/   # WhisperX alignment + SRT/VTT/ASS
│   ├── render-service/     # Remotion + FFmpeg pipeline
│   └── trend-service/      # Platform metadata fetching
├── packages/
│   ├── shared-types/       # Cross-package TypeScript types
│   ├── db/                 # Drizzle ORM schema + queries
│   ├── knowledge-sdk/      # Milvus vector store wrapper
│   ├── storage-sdk/        # MinIO object store wrapper
│   ├── prompt-library/     # LLM prompt templates
│   └── workflow-sdk/       # Workflow state helpers
├── infra/
│   ├── docker/             # docker-compose files
│   └── k8s/                # K8s manifests (base + overlays)
├── prompts/                # LLM prompt markdown sources
└── docs/                   # This directory
```

## Quick start

```bash
# 1. Install
pnpm install

# 2. Start infra (Postgres, Redis, MinIO, Milvus)
docker compose -f infra/docker/docker-compose.yml up -d

# 3. Migrate database
pnpm --filter @ai-video-factory/db migrate

# 4. Start dev
pnpm dev   # runs API + Web + workers in parallel via turbo

# 5. Submit a workflow
curl -X POST http://localhost:3000/api/v1/workflow \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.douyin.com/video/..."}'
```

## Where to read next

- [Architecture overview](./architecture/overview.md)
- [Workflow pipeline deep-dive](./architecture/workflow.md)
- [Local development setup](./development/local-dev.md)
- [Adding a new AI service](./development/adding-a-service.md)
- [Operations runbook](./operations/runbook.md)
- [Deployment guide](./operations/deployment.md)
