# syntax=docker/dockerfile:1.7
# ---- Base stage ----
ARG WORKER=workflow-worker
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /app

# ---- Dependencies stage ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/prompt-library/package.json packages/prompt-library/package.json
COPY packages/knowledge-sdk/package.json packages/knowledge-sdk/package.json
COPY packages/storage-sdk/package.json packages/storage-sdk/package.json
COPY packages/db/package.json packages/db/package.json
COPY services/analysis-service/package.json services/analysis-service/package.json
COPY services/content-service/package.json services/content-service/package.json
COPY services/media-service/package.json services/media-service/package.json
COPY services/render-service/package.json services/render-service/package.json
COPY services/script-service/package.json services/script-service/package.json
COPY services/subtitle-service/package.json services/subtitle-service/package.json
COPY services/trend-service/package.json services/trend-service/package.json
COPY apps/worker/workflow-worker/package.json apps/worker/workflow-worker/package.json
COPY apps/worker/analysis-worker/package.json apps/worker/analysis-worker/package.json
COPY apps/worker/embedding-worker/package.json apps/worker/embedding-worker/package.json
COPY apps/worker/render-worker/package.json apps/worker/render-worker/package.json

RUN pnpm install --frozen-lockfile

# ---- Build stage ----
FROM base AS build
ARG WORKER
ENV WORKER=${WORKER}
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/services ./services
COPY --from=deps /app/apps ./apps
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/ ./services/
COPY apps/worker/ ./apps/worker/

# Build shared packages first
RUN pnpm --filter @ai-video-factory/shared-types build || true
RUN pnpm --filter @ai-video-factory/prompt-library build || true
RUN pnpm --filter @ai-video-factory/knowledge-sdk build || true
RUN pnpm --filter @ai-video-factory/storage-sdk build || true
RUN pnpm --filter @ai-video-factory/db build || true

# Pre-build the target worker so we can run with `node` (no tsx overhead at runtime)
RUN pnpm --filter @ai-video-factory/${WORKER} build

# ---- Production stage ----
FROM node:22-bookworm-slim AS production
RUN corepack enable \
    && apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

# Run as non-root user
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --create-home --shell /bin/bash aifactory
WORKDIR /app
USER aifactory

ARG WORKER
ENV WORKER=${WORKER} \
    NODE_ENV=production

COPY --from=build --chown=aifactory:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=aifactory:nodejs /app/packages ./packages
COPY --from=build --chown=aifactory:nodejs /app/services ./services
COPY --from=build --chown=aifactory:nodejs /app/apps/worker ./apps/worker
COPY --from=build --chown=aifactory:nodejs /app/tsconfig.base.json ./

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "process.exit(require('bullmq').Queue ? 0 : 1)" || exit 0

ENTRYPOINT ["/usr/bin/tini", "--"]
# Each worker exports its own main file
CMD ["sh", "-c", "node apps/worker/${WORKER}/dist/main.js"]
