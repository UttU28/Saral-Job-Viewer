# Project status — what you have vs what’s left

**Current state:** Core production stack is **complete**: Cloud Run **`saral-api`** + **`saral-ui`**, validation **job** + Scheduler, **Memorystore Redis** + VPC connector, **WIF** GitHub Actions, **Secret Manager**, **custom hostnames** (`saral.thatinsaneguy.com` / `saralapi.thatinsaneguy.com`), **global HTTPS external load balancer** when enabled, and **Monitoring** (dashboard + uptime + alert policies) definable from **`setupMonitoring.yml`**. DNS **A** records point at the LB IP where configured.

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
| **`setupMonitoring.yml`** — Monitoring stack (dashboard, uptime, alerts); see **`MONITORING-WINDOWS-GCLOUD.md`** | [x] |

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

---

## 7) Load balancer — implemented

| Step | Status |
|------|--------|
| Serverless NEGs for `saral-ui` and `saral-api` | [x] |
| Backend services + URL map (host-based routing) + HTTP/HTTPS proxies + forwarding rules | [x] |
| Google-managed cert at LB (`sjv-managed-cert`; SANs for UI + API hosts) | [x] |
| DNS **A** for `saral` / `saralapi` → LB global IP | [x] where cut over |
| CI: **`deployment.yml`** (`ensureGlobalLoadBalancer` after API/UI deploy), **`destroyStack.yml`** (`deleteGlobalLoadBalancer`) | [x] |

**Suggested orchestration order**

1. **`ensurePrereq.yml`** — bootstrap (Redis, secrets/images checks; optional domain mappings — **not** LB).
2. **`deployment.yml`** — build/deploy on `main` after approval; **LB** runs **after** **`saral-api`** / **`saral-ui`** deploy jobs when API/UI changed (or manual **`ensureGlobalLoadBalancer`**).
3. **`setupMonitoring.yml`** — run after LB/DNS stable if you want uptime checks against public URLs (optional **`skipNotificationChannelAndAlerts`** for dashboard-only).
4. **`destroyStack.yml`** — full teardown only when needed; enable LB delete if removing LB IP and GCP objects.

---

## 8) Monitoring & observability

| Item | Status |
|------|--------|
| **`MONITORING-WINDOWS-GCLOUD.md`** — concepts, IAM, optional **`gcloud`**, troubleshooting | [x] |
| Cloud Monitoring dashboard **“Saral Job Viewer - Overview”** (embedded in **`setupMonitoring.yml`**) | [x] after workflow run |
| **Uptime checks** (UI `/`, API `/api/health`) + failing alerts | [x] after workflow run |
| **Alert policies** (API/UI traffic spikes v2, API 5xx v2, Redis memory v2, uptime) — embedded YAML | [x] after workflow run (unless **`skipNotificationChannelAndAlerts`**) |
| Optional **Cloud Trace** / **Error Reporting** instrumentation on API | [ ] |
| Repo secret **`MONITORING_ALERT_EMAIL`** + workflow input **`skipNotificationChannelAndAlerts`** | [x] documented |

**Optional:** **`loadTest.py`** (repo root) for sustained traffic against scenarios **1 / 2 / 3** to validate rate and error alerts.

**Documentation:** **`docs/GCP-PLATFORM-KT.md`**, **`docs/CICD-FULL-STACK.md`**, **`docs/MONITORING-WINDOWS-GCLOUD.md`**, **`docs/PROJECT-STATUS-CHECKLIST.md`** (this file). Update **`setupMonitoring.yml`** first when dashboard or alert definitions change, then sync docs.
