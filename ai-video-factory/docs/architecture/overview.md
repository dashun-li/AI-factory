# Architecture overview

## Monorepo

This project is a **pnpm workspace + Turborepo** monorepo. The split:

| Layer    | Path                | Purpose                                                        |
| -------- | ------------------- | -------------------------------------------------------------- |
| apps     | `apps/`             | Deployable artifacts (API, web, workers, remotion templates)   |
| services | `services/`         | Domain logic libraries, called by API or workers                |
| packages | `packages/`         | Cross-cutting SDKs and shared types                             |

The `apps/api` gateway is the single HTTP entry point — it imports all `services/*` libraries directly, so deployments stay simple (one API container, one web container, four workers).

## Data flow

### 1. Submit

```
Client → POST /api/v1/workflow
   → API creates DB row (status=pending)
   → API enqueues BullMQ job on 'workflow' queue
   → API returns { workflowId, queueJobId }
```

### 2. Execute

```
workflow-worker picks job
   → for each step:
       → call service
       → update DB row (status=running/completed/failed, current_step=...)
       → optionally emit BullMQ event for sub-workers
```

### 3. Subscribe (real-time)

```
Client → WSS /workflow { subscribe: { workflowId } }
   → gateway joins room
   → gateway polls DB every 2s; on change → emit 'status' event
```

This polling design is intentional: the gateway has no inbound connection to the workers (they only talk to Redis + DB), so the gateway is the only piece that has to handle high-frequency reads. Workers can also `POST` to the gateway's `/internal/broadcast` if a sub-second push is needed.

## Persistence

| Concern        | Store         | Why                                              |
| -------------- | ------------- | ------------------------------------------------ |
| Workflow rows  | PostgreSQL    | ACID, easy queries, audit trail                  |
| Job queue      | Redis (BullMQ)| Native BullMQ features (retries, priorities)     |
| Cache (rate)   | Redis         | Sub-ms latency for rate-limit counters           |
| Vector index   | Milvus        | Billion-scale ANN search for RAG                 |
| Object storage | MinIO / S3    | Video files, generated images                    |
| Knowledge      | Milvus + DB   | Vector embeddings + structured metadata          |

## Why a gateway (and not direct service-to-service)?

A separate API gateway gives us:

1. **Single ingress** — easy CORS / auth / rate-limit policy
2. **Aggregation** — the gateway can fan out calls to multiple services in one request
3. **Resilience** — the gateway can fall back to queue-only when the DB is down
4. **WebSocket fan-out** — only the gateway holds persistent connections

Workers run *behind* the gateway, not alongside. This is the deployment topology in `infra/k8s/base/`.
