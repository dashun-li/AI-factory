# syntax=docker/dockerfile:1.7
# ---- Base stage ----
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /app

# ---- Dependencies stage ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/prompt-library/package.json packages/prompt-library/package.json
COPY packages/knowledge-sdk/package.json packages/knowledge-sdk/package.json
COPY packages/workflow-sdk/package.json packages/workflow-sdk/package.json
COPY packages/storage-sdk/package.json packages/storage-sdk/package.json
COPY packages/db/package.json packages/db/package.json
COPY services/analysis-service/package.json services/analysis-service/package.json
COPY services/content-service/package.json services/content-service/package.json
COPY services/media-service/package.json services/media-service/package.json
COPY services/render-service/package.json services/render-service/package.json
COPY services/script-service/package.json services/script-service/package.json
COPY services/subtitle-service/package.json services/subtitle-service/package.json
COPY services/trend-service/package.json services/trend-service/package.json
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --frozen-lockfile

# ---- Build stage ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/services ./services
COPY --from=deps /app/apps ./apps
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/ ./services/
COPY apps/api/ ./apps/api/

RUN pnpm --filter @ai-video-factory/shared-types build || true
RUN pnpm --filter @ai-video-factory/prompt-library build || true
RUN pnpm --filter @ai-video-factory/knowledge-sdk build || true
RUN pnpm --filter @ai-video-factory/storage-sdk build || true
RUN pnpm --filter @ai-video-factory/db build || true
RUN pnpm --filter @ai-video-factory/api build

# ---- Production stage ----
FROM node:22-bookworm-slim AS production
RUN corepack enable \
    && apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && ffmpeg -version | head -n 1

# Run as non-root user
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --create-home --shell /bin/bash aifactory
WORKDIR /app
USER aifactory

COPY --from=build --chown=aifactory:nodejs /app/apps/api/dist ./dist
COPY --from=build --chown=aifactory:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=aifactory:nodejs /app/apps/api/package.json ./
COPY --from=build --chown=aifactory:nodejs /app/packages ./packages
COPY --from=build --chown=aifactory:nodejs /app/services ./services

ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT||3000) + '/api/v1/workflow').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
