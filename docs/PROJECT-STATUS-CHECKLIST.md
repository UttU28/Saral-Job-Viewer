# Project status — what you have vs what’s left

**Current state:** Core production stack is **complete**: Cloud Run **`saral-api`** + **`saral-ui`**, validation **job** + Scheduler, **Memorystore Redis** + VPC connector, **WIF** GitHub Actions, **Secret Manager**, **custom hostnames** (`saral.thatinsaneguy.com` / `saralapi.thatinsaneguy.com`), and **global HTTPS external load balancer** (EXTERNAL_MANAGED, serverless NEGs → UI/API) when enabled via prereq or built manually — DNS **A** records point at the LB IP where configured.

Use **`[x]` = done**, **`[ ]` = optional / not started**.

---

## 1) Registry & images

| Item | Status |
|------|--------|
| GCP project `saraljobviewer` | [x] |
| Artifact Registry repo `saral-job-viewer-cr` (`us-east1`) | [x] |
| Docker image **`dvalidate`** (`docker/Dockerfile.validation`) | [x] |
| Docker image **`api`** (`docker/Dockerfile.api`) | [x] |
| Docker image **`frontend`** (`docker/Dockerfile.frontend`) | [x] |

Images are built and pushed by **`deployment.yml`** when paths change (plus `:latest`); **`ensurePrereq.yml`** verifies `:latest` exists before full bootstrap steps.

---

## 2) Cloud Run

| Item | Status |
|------|--------|
| **Cloud Run Job** `saral-dvalidate-job` (`us-east1`) | [x] |
| **Cloud Run services** **`saral-api`** + **`saral-ui`** (`us-east1`) | [x] |
| Default URLs `*.run.app` | [x] |
| **Custom domain mappings** (optional; UI + API subdomains via `gcloud beta run domain-mappings`) | [x] where used |
| Traffic via **global LB** + DNS **A** → LB IP (host routing on URL map) | [x] where configured |

---

## 3) Secrets (Secret Manager)

| Item | Status |
|------|--------|
| `MONGODB_URI` | [x] |
| `MONGODB_DATABASE` (also set as env on API) | [x] |
| `MIDHTECH_EMAIL` / `MIDHTECH_PASSWORD` | [x] |
| `JWT_SECRET` | [x] |
| `REDIS_URL` | [x] |
| `VITE_API_URL` (frontend build; **`deployment.yml`** reads at build) | [x] |

*Add rows here if you introduce new secrets for future features.*

---

## 4) Scheduler & automation (GitHub Actions)

| Item | Status |
|------|--------|
| Cloud Scheduler `saral-dvalidate-midnight-utc` | [x] |
| **`deployment.yml`** — push / manual deploy to `main`; path filters; **`production-approval`** gate; API / UI / validation jobs + LB routing sync when applicable | [x] |
| **`ensurePrereq.yml`** — APIs, secret checks, image checks, optional Redis/VPC, optional domain mappings (LB is **not** here) | [x] |
| **`destroyStack.yml`** — typed phrase + **`production-approval`**; optional LB; parallel **`saral-api`** / **`saral-ui`** deletes; job + Scheduler; optional mappings; Redis then VPC; summary | [x] |
| **`runValidationManual.yml`** — manual Cloud Run job execution | [x] |

Standalone **`deployApi.yml` / `deployFrontend.yml` / `deployValidation.yml`** and **`provisionMemorystoreRedis.yml`** were removed; use **`deployment.yml`** + **`ensurePrereq.yml`** instead.

---

## 5) Identity & IAM

| Item | Status |
|------|--------|
| `saral-api-trigger@…` (runtime / job trigger) | [x] |
| `pipelineservice@…` (WIF deploy SA) | [x] |
| **Deploy SA:** Artifact Registry push, Cloud Run deploy, `iam.serviceAccountUser` on runtime SA | [x] |
| **Runtime SA:** Secret Manager on API secrets, Run job execution, no `gcp-sa.json` in API image | [x] |

---

## 6) Networking & data

| Item | Status |
|------|--------|
| MongoDB reachable from job + **`saral-api`** | [x] |
| Redis: Memorystore + Serverless VPC connector + **`GCP_VPC_CONNECTOR_NAME`** (GitHub Actions variable) | [x] |
| APIs: Run, Artifact Registry, Secret Manager, Scheduler, IAM Credentials (WIF), Redis, VPC Access, Compute (LB), Certificate Manager (enabled with LB prereq) | [x] |
| **HTTPS** on custom hosts (managed certs on LB **or** per Cloud Run domain mapping) | [x] |
| **Global HTTPS Load Balancer** (serverless NEG → UI/API; URL map host routing) | [x] |
| Cloud Armor policy on LB (optional WAF/rate limits) | [ ] |

---

## 7) Optional polish (only if you want it)

| Item | Status |
|------|--------|
| **`min-instances` > 0** on API (or UI) to reduce cold starts | [ ] |
| Stricter **CORS** in `app.py` (single origin instead of `*`) | [ ] |
| Periodic GCP audit (Console / `gcloud` lists on Run, LB, Scheduler, secrets) | [ ] |
| Cloud CDN or Cloud Armor on LB | [ ] |

---

## 8) Load balancer — implemented

| Step | Status |
|------|--------|
| Serverless NEGs for `saral-ui` and `saral-api` | [x] |
| Backend services + URL map (host-based routing) + HTTP/HTTPS proxies + forwarding rules | [x] |
| Google-managed cert at LB (`sjv-managed-cert`; SANs for UI + API hosts) | [x] |
| DNS **A** for `saral` / `saralapi` → LB global IP | [x] where cut over |
| CI: **`deployment.yml`** (`ensureGlobalLoadBalancer` after API/UI deploy), **`destroyStack.yml`** (`deleteGlobalLoadBalancer`) | [x] |
| Remove duplicate Cloud Run domain mappings after stable LB-only traffic (optional) | [ ] |

**Suggested orchestration order**

1. **`ensurePrereq.yml`** — bootstrap (Redis, secrets/images checks; optional domain mappings — **not** LB).
2. **`deployment.yml`** — build/deploy on `main` after approval; **LB** runs **after** **`saral-api`** / **`saral-ui`** deploy jobs when API/UI changed (or manual **`ensureGlobalLoadBalancer`**).
3. **`destroyStack.yml`** — full teardown only when needed; enable LB delete if removing LB IP and GCP objects.

**Documentation:** This repo keeps **`docs/CICD-FULL-STACK.md`** (workflows, LB, diagram, secrets) and **`docs/PROJECT-STATUS-CHECKLIST.md`** (this file). Update both whenever `.github/workflows/` or production topology changes.
