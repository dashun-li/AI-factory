# Deployment guide

## CI pipeline (`.github/workflows/ci.yml`)

Three layers run on every push to `main` and on PRs:

1. **Static analysis** — `pnpm lint` + `pnpm type-check`
2. **Unit tests** — `npx jest` with PostgreSQL + Redis services, coverage uploaded to Codecov
3. **Build** — `pnpm build`

On pushes to `main`, three Docker images are also built and pushed to GHCR:

- `ghcr.io/<owner>/ai-video-factory-api:latest`
- `ghcr.io/<owner>/ai-video-factory-web:latest`
- `ghcr.io/<owner>/ai-video-factory-worker-workflow:latest` (plus the three other workers)

## Production topology

The K8s manifests under `infra/k8s/base/` are the production target. Apply them with:

```bash
# 1. Create the namespace + secrets (one-time, using a sealed-secrets controller)
kubectl apply -f infra/k8s/base/

# 2. Verify
kubectl -n ai-video-factory get all

# 3. Tail logs
kubectl -n ai-video-factory logs -f deploy/api
```

### Components

| Component       | Replicas (default) | Notes                                        |
| --------------- | ------------------ | -------------------------------------------- |
| `api`           | 2 (HPA 2-8)        | Stateless, HPA on CPU                        |
| `web`           | 2                  | Stateless, served by Nginx ingress           |
| `workflow-worker` | 2                | BullMQ consumer, scale with queue depth     |
| `analysis-worker` | 1                | Stateless, can scale horizontally           |
| `embedding-worker` | 1              | Embedding generation, GPU-friendly           |
| `render-worker` | 1                  | Remotion + ffmpeg, CPU/GPU heavy             |
| `postgres`      | 1 (StatefulSet)    | 20 GB PVC, single writer                     |
| `redis`         | 1                  | Append-only, no AOF persistence required     |
| `minio`         | 1                  | Single-node mode; replace with S3 for HA    |

### Resource requests

See `infra/k8s/base/*.yaml` for current values. The HPA on `api` targets 70% CPU.

### Networking

- **Ingress**: `infra/k8s/base/ingress.yaml` — Nginx, TLS via cert-manager, 100MB body limit (large enough for `multipart/form-data` uploads), 600s proxy timeout (Remotion renders can take a few minutes).
- **WebSocket**: route via the same ingress; Nginx passes through `Upgrade` headers by default.

## Overlays

`infra/k8s/overlays/dev/` reduces resources for the dev cluster. Add a `staging/` overlay mirroring the production base for a pre-prod environment.

```bash
# Apply dev overlay
kubectl apply -k infra/k8s/overlays/dev
```

## Secrets

The `secrets.example.yaml` is a *template only* — never commit real values. In production:

- Use [sealed-secrets](https://github.com/bitnami-labs/sealed-secrets) or [external-secrets](https://external-secrets.io/) to materialize the Secret from a vault (AWS Secrets Manager, HashiCorp Vault, etc.).
- Rotate quarterly.

## Rollback

The CI pushes images tagged with both `latest` and the commit SHA. To roll back to a specific commit:

```bash
kubectl -n ai-video-factory set image deploy/api \
  api=ghcr.io/<owner>/ai-video-factory-api:<sha> \
  --record
```

## Database migrations

Migrations are applied by a separate one-shot Job (not in this repo yet — typically CI step). Pattern:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: ghcr.io/<owner>/ai-video-factory-api:latest
          command: ["node", "node_modules/@ai-video-factory/db/dist/migrate.js"]
          envFrom: [...]
      restartPolicy: OnFailure
```

The Job must complete before the API Deployment rolls out.
