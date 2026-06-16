# Troubleshooting

## LLM calls fail with 401 / 403

The worker logs will show the API key being redacted. Check:

```bash
# Is the env actually loaded?
kubectl -n ai-video-factory exec deploy/api -- env | grep -E 'ANTHROPIC|OPENAI'
```

If empty, the Secret isn't bound — verify `secretRef.name: ai-video-factory-secrets` and that the Secret exists.

## "Milvus collection does not exist" on first run

Run the init script:

```bash
pnpm --filter @ai-video-factory/knowledge-sdk seed
```

This is idempotent — safe to re-run.

## Worker stuck for > 5 min with no DB update

The worker is processing a step but not calling `updateStep`. Most common cause: an unhandled error swallowed by a try/catch. Add `console.error` and rethrow, or use a structured logger.

## TypeScript error in apps/web "is not under rootDir"

The web app's tsconfig inherits a stale `rootDir: "src"` from the base config. This is a pre-existing issue with the web's standalone type-check. **Use `next build` to type-check the web app, not `tsc --noEmit`**.

## BullMQ job retries silently

Default `attempts: 3` with backoff. The job ends up in the `failed` set after exhaustion. To drain:

```bash
kubectl -n ai-video-factory exec deploy/redis -- redis-cli
> LRANGE bull:workflow:failed 0 -1
> LREM bull:workflow:failed 0 <jobId>
```

## Video render fails at the Remotion step

Check the render-worker logs for "npx remotion" output. Common causes:

- `REMOTION_PROJECT_PATH` not set or not mounted
- Chromium dependencies missing — Debian slim image needs `apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2`

## WebSocket disconnects repeatedly

- Check the Nginx ingress timeout: `proxy_read_timeout` defaults to 60s — increase to 3600s.
- Confirm the gateway namespace has the right NetworkPolicy (if any) allowing egress to Redis.

## "EADDRINUSE" on `pnpm dev`

A previous `pnpm dev` didn't clean up. Kill all node processes:

```bash
# macOS / Linux
pkill -f "node dist/main"
pkill -f "next dev"
pkill -f "tsx"

# Windows
taskkill /F /IM node.exe /T
```
