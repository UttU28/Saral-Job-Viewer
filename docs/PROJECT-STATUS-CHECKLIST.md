# Project status — what you have vs what’s left

**Current state:** Core production stack is **complete**: Cloud Run **`saral-api`** + **`saral-ui`**, validation **job** + Scheduler, **Memorystore Redis** + VPC connector, **WIF** GitHub Actions, **Secret Manager**, and **custom hostnames** (e.g. **`saral.thatinsaneguy.com`** / **`saralapi.thatinsaneguy.com`**) where configured.

Use **`[x]` = done**, **`[ ]` = optional / not started**.

---

## 1) Registry & images

| Item | Status |
|------|--------|
| GCP project `saraljobviewer` | [x] |
| Artifact Registry repo `saral-job-viewer-cr` (`us-east1`) | [x] |
| Docker image **`dvalidate`** (`docker/Dockerfile.validation` → `deployValidation.yml`) | [x] |
| Docker image **`api`** (`docker/Dockerfile.api` → `deployApi.yml`) | [x] |
| Docker image **`frontend`** (`docker/Dockerfile.frontend` → `deployFrontend.yml`) | [x] |

---

## 2) Cloud Run

| Item | Status |
|------|--------|
| **Cloud Run Job** `saral-dvalidate-job` (`us-east1`) | [x] |
| **Cloud Run services** **`saral-api`** + **`saral-ui`** (`us-east1`) | [x] |
| Default URLs `*.run.app` + **custom domain mappings** (UI + API subdomains) | [x] |

---

## 3) Secrets (Secret Manager)

| Item | Status |
|------|--------|
| `MONGODB_URI` | [x] |
| `MONGODB_DATABASE` (also set as env on API) | [x] |
| `MIDHTECH_EMAIL` / `MIDHTECH_PASSWORD` | [x] |
| `JWT_SECRET` | [x] |
| `REDIS_URL` | [x] |
| `VITE_API_URL` (manual; **`deployFrontend`** reads at build) | [x] |

*Add rows here if you introduce new secrets for future features.*

---

## 4) Scheduler & automation

**Note:** Scheduler only drives the **validation job**. **API** and **UI** stay up as Cloud Run services; redeploy via Actions when you want new revisions.

| Item | Status |
|------|--------|
| Cloud Scheduler `saral-dvalidate-midnight-utc` | [x] |
| `deployValidation.yml` | [x] |
| `deployApi.yml` | [x] |
| `deployFrontend.yml` | [x] |
| `provisionMemorystoreRedis.yml` | [x] |
| `runValidationManual.yml` | [x] |

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
| Redis: Memorystore + Serverless VPC connector + **`GCP_VPC_CONNECTOR_NAME`** (Actions variable) | [x] |
| APIs: Run, Artifact Registry, Secret Manager, Scheduler, IAM Credentials (WIF), Redis, VPC Access, Compute | [x] |
| **HTTPS** on custom hosts (managed certs via domain mappings) | [x] |

---

## 7) Optional polish (only if you want it)

| Item | Status |
|------|--------|
| `deployValidation.yml` / API / UI: **`on.push`** to `main` for automatic rolls | [ ] |
| **`min-instances` > 0** on API (or UI) to reduce cold starts | [ ] |
| Stricter **CORS** in `app.py` (single origin instead of `*`) | [ ] |
| Re-run GCP inventory: **`GCP-INVENTORY-WINDOWS.md`** | [ ] |

---

For commands to re-scan GCP, see **`GCP-INVENTORY-WINDOWS.md`**.
