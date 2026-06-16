# Local development setup

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker + docker-compose (for PostgreSQL / Redis / Milvus / MinIO)
- ffmpeg (only required for `media-service` and `render-service` paths)

## Initial setup

```bash
# 1. Install JS deps
pnpm install

# 2. Copy environment template
cp .env.example .env
# Edit .env and add at least:
#   ANTHROPIC_API_KEY=sk-ant-...
#   OPENAI_API_KEY=sk-...
#   FAL_API_KEY=...
# Leave others as default for local dev.

# 3. Start infra
docker compose -f infra/docker/docker-compose.yml up -d

# 4. Run migrations
pnpm --filter @ai-video-factory/db migrate

# 5. (Optional) seed knowledge base
pnpm --filter @ai-video-factory/knowledge-sdk seed
```

## Running

```bash
# Run everything in parallel
pnpm dev

# Or run a single workspace
pnpm --filter @ai-video-factory/api dev
pnpm --filter @ai-video-factory/web dev
pnpm --filter @ai-video-factory/workflow-worker start:dev
```

| Service               | Default URL                          |
| --------------------- | ------------------------------------ |
| API gateway           | http://localhost:3000/api/v1         |
| WebSocket             | ws://localhost:3000/workflow         |
| Web dashboard         | http://localhost:3001                |
| MinIO console         | http://localhost:9001                |
| Milvus                | localhost:19530                      |
| PostgreSQL            | localhost:5432                       |
| Redis                 | localhost:6379                       |

## Tests

```bash
# All tests
pnpm test

# Single package
pnpm --filter @ai-video-factory/analysis-service test

# With coverage
pnpm --filter @ai-video-factory/analysis-service test -- --coverage
```

## Type-check

```bash
pnpm type-check
```

This compiles every workspace with strict mode enabled. Fix any reported errors before opening a PR.

## Lint

```bash
pnpm lint
```

ESLint 9 flat config. Some legacy packages still have `// eslint-disable` lines — we are incrementally cleaning these up.

## Common pitfalls

- **ffmpeg not found**: install via `winget install ffmpeg` (Windows) / `brew install ffmpeg` (macOS) / `apt install ffmpeg` (Linux).
- **Milvus OOM**: default docker-compose uses 4GB+ of RAM. On a laptop with < 16GB total, comment out Milvus in `docker-compose.yml` and run `analysis-service` with `MILVUS_HOST=` (empty) — it will skip the RAG path.
- **Port 3000 in use**: set `PORT=3100` in `.env` for the API, and `NEXT_PUBLIC_API_URL=http://localhost:3100` for the web.
