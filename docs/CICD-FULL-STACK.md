# Full-stack CI/CD — Saral Job Viewer

**Status:** Implemented end-to-end — **FastAPI** + **Vite** on **Cloud Run**, **Memorystore Redis**, **validation job** + **Scheduler**, **WIF** from GitHub Actions, **Secret Manager**, **custom domains** (typical: `saral.*` + `saralapi.*` on `thatinsaneguy.com`). No `gcp-sa.json` in images for production paths.

---

## Implemented (reference)

| Area | Details |
|------|---------|
| **GitHub → GCP** | OIDC: `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `GCP_API_RUN_SERVICE_ACCOUNT`. |
| **Validation** | `docker/Dockerfile.validation` → AR `dvalidate`; `deployValidation.yml` updates job + Scheduler; `runValidationManual.yml` for one-off runs. |
| **API** | `deployApi.yml`, `docker/Dockerfile.api` → **`saral-api`**; secrets: Mongo, JWT, Midhtech, `REDIS_URL`; env: `GCP_*`, `RUN_JOB_NAME`, Redis tuning; optional **`GCP_VPC_CONNECTOR_NAME`**. |
| **Frontend** | `deployFrontend.yml`, `docker/Dockerfile.frontend`, `nginx.frontend.conf` → **`saral-ui`**; **`VITE_API_URL`** from Secret Manager at build (you maintain the secret). |
| **Redis** | `provisionMemorystoreRedis.yml`; **`REDIS_URL`**; idempotent secret / IAM updates. |
| **Domains** | Cloud Run domain mappings + DNS; **`VITE_API_URL`** points at public API hostname. See **`CustomDomainCloudRun.md`** if you add or change hosts. |

**Optional:** uncomment `on.push` in `deployValidation.yml` (or add for API/UI) for merge-to-main deploys.

---

## Workflows (repo layout)

| Workflow | Role |
|----------|------|
| `deployValidation.yml` | Job image + Cloud Scheduler |
| `deployApi.yml` | **`saral-api`** (does not write `VITE_API_URL`) |
| `deployFrontend.yml` | **`saral-ui`** |
| `provisionMemorystoreRedis.yml` | Connector + `REDIS_URL` |
| `runValidationManual.yml` | Manual job execution |

---

## Runtime map

| Component | GCP | Notes |
|-----------|-----|--------|
| Backend | Cloud Run **`saral-api`** | HTTP; attach runtime SA; VPC if Memorystore |
| Frontend | Cloud Run **`saral-ui`** | Static nginx on port 8080 |
| Redis | Memorystore + VPC connector | `REDIS_URL` secret |
| Validation | Cloud Run **job** | Scheduler + manual; Mongo secrets |
| TLS | Managed certs | Per Cloud Run domain mapping or `*.run.app` |

---

## Secrets (summary)

- **Secret Manager:** `MONGODB_URI`, `MONGODB_DATABASE` (env on services), `MIDHTECH_*`, `JWT_SECRET`, `REDIS_URL`, `VITE_API_URL`.
- **GitHub:** WIF + three secrets above; **Variable** `GCP_VPC_CONNECTOR_NAME` when using Memorystore from API.

---

## CI/CD checklist (mainline — all done)

**GCP**

- [x] APIs: Run, Artifact Registry, Secret Manager, Scheduler, IAM Credentials (WIF), Redis, VPC Access, Compute as needed.
- [x] Artifact Registry `saral-job-viewer-cr`.
- [x] Service accounts + IAM (deploy, runtime, `actAs`, Secret Manager, Run job, Redis/VPC provisioning).
- [x] Secrets + Cloud Run bindings.
- [x] Redis + connector + `REDIS_URL`.
- [x] Custom domain DNS + mappings + HTTPS (where you use custom hosts).

**GitHub**

- [x] OIDC + repository secrets/variables.
- [x] All workflows listed above.
- [ ] Optional: push triggers, staging, approval gates.

**App**

- [x] `VITE_API_URL` at frontend build time (manual secret updates + run `deployFrontend` when it changes).
- [x] Backend env/secrets via `deployApi` / job definitions.

---

## Architecture

```mermaid
flowchart TB
  subgraph Users
    U[Browser]
  end
  subgraph DNS
    D[Domain + TLS]
  end
  subgraph GCP["GCP"]
    FE[Cloud Run: UI]
    API[Cloud Run: API]
    JOB[Cloud Run Job]
    R[(Redis)]
    SM[Secret Manager]
    AR[Artifact Registry]
    SCH[Cloud Scheduler]
  end
  subgraph Data
    M[(MongoDB)]
  end
  U --> D
  D --> FE
  D --> API
  FE -->|HTTPS| API
  API --> R
  API --> M
  API --> JOB
  JOB --> M
  SCH --> JOB
  API -.-> SM
  JOB -.-> SM
  AR -.-> FE
  AR -.-> API
  AR -.-> JOB
```

---

## References

- **`PROJECT-STATUS-CHECKLIST.md`** — line-item status + optional polish.
- **`CustomDomainCloudRun.md`** — domain verification, mappings, DNS.
- **`GCP-INVENTORY-WINDOWS.md`** — re-scan commands.
- `gcpCloudRun.md`, `docker-compose.yml`, Dockerfiles under `docker/`.

---

*Last updated: 2026-05 — production CI/CD path complete; optional items are automation / tuning only.*
