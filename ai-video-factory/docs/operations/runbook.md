# Operations runbook

## Service health

| Symptom                          | Check                                    | Likely fix                                      |
| -------------------------------- | ---------------------------------------- | ----------------------------------------------- |
| API 5xx                          | `kubectl logs -n ai-video-factory api`   | Check upstream service health, DB pool size      |
| Workflow stuck in `running`      | `kubectl logs workflow-worker`           | Check the last completed step; likely LLM timeout |
| Milvus connection refused        | `kubectl logs api \| grep milvus`        | Restart Milvus pod; check `MILVUS_HOST` env     |
| Render fails with ffmpeg error   | `kubectl logs render-worker`             | Verify `ffmpeg` installed in image, free disk   |
| WebSocket drops every ~60s       | Nginx timeout (default 60s)              | Add `proxy_read_timeout 3600` to ingress        |

## Common operations

### Force-fail a stuck workflow

```sql
UPDATE workflows
SET status = 'failed',
    error  = 'manually cancelled',
    current_step = current_step
WHERE id = '<workflowId>';
```

The next WS poll will broadcast the new state.

### Purge failed jobs from BullMQ

```bash
kubectl exec -n ai-video-factory deploy/redis -- redis-cli
> KEYS bull:workflow:failed:* | xargs DEL
```

### Rotate MinIO credentials

1. Create new access key in MinIO console.
2. Update `ai-video-factory-secrets` Secret in the cluster.
3. Restart all pods that mount it (`kubectl rollout restart deploy/api deploy/workflow-worker ...`).

### Inspect a workflow's DB state

```sql
SELECT id, status, current_step, error, created_at, updated_at
FROM workflows
ORDER BY created_at DESC LIMIT 20;

-- Find a specific step's output
SELECT * FROM analysis_results WHERE workflow_id = '<id>';
SELECT * FROM scripts            WHERE workflow_id = '<id>';
SELECT * FROM media_assets       WHERE workflow_id = '<id>';
SELECT * FROM render_outputs     WHERE workflow_id = '<id>';
```

## Database migrations

```bash
# Generate a new migration
pnpm --filter @ai-video-factory/db migrate:generate -- --name add_xxx

# Apply (CI runs this on deploy)
pnpm --filter @ai-video-factory/db migrate
```

Migrations are SQL files under `packages/db/migrations/`. Always run them with the migrate script — never apply via `psql` directly.

## Capacity planning

| Resource | Per-workflow | Notes |
| -------- | ------------ | ----- |
| Postgres writes | ~5 rows | small |
| Milvus inserts | 1 vector (1536-d) | small |
| MinIO writes | 1-3 files | render is largest, 5-50MB |
| Worker CPU | 30s-3min | dominated by LLM and Remotion |
| Worker memory | 2-4 GB | Remotion bundles Chromium |

For a target of 100 concurrent workflows, plan for:

- API: 4 replicas, 1 CPU each
- workflow-worker: 4 replicas, 2 CPU each
- render-worker: 2 replicas, 4 CPU each (CPU-intensive)
- Postgres: 4 CPU, 8 GB
- Milvus: 8 CPU, 16 GB
- Redis: 1 CPU, 1 GB
- MinIO: 4 CPU, 8 GB (4×2 TB NVMe)

## On-call checklist

1. Page: check `#alerts` for the failing service.
2. Look at recent deploys (`kubectl rollout history`).
3. Roll back: `kubectl rollout undo deploy/<name>`.
4. If unrelated to deploy, scale up: `kubectl scale deploy/<name> --replicas=+2`.
5. If still failing, drain: `kubectl drain <node>` and let the cluster reschedule.
6. Post-mortem within 24h: write into `docs/postmortems/YYYY-MM-DD-<slug>.md`.
