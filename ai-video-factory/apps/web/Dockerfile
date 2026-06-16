# syntax=docker/dockerfile:1.7
# ---- Base stage ----
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /app

# ---- Dependencies stage ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

# ---- Build stage ----
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps ./apps
COPY tsconfig.base.json ./
COPY packages/shared-types/ ./packages/shared-types/
COPY apps/web/ ./apps/web/

RUN pnpm --filter @ai-video-factory/shared-types build || true
RUN pnpm --filter @ai-video-factory/web build

# ---- Production stage ----
FROM node:22-bookworm-slim AS production
RUN corepack enable \
    && apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

# Run as non-root user
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --create-home --shell /bin/bash aifactory
WORKDIR /app
USER aifactory

ENV NODE_ENV=production \
    PORT=3001 \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=aifactory:nodejs /app/apps/web/public ./apps/web/public
COPY --from=build --chown=aifactory:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=aifactory:nodejs /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT||3001) + '/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/web/server.js"]
