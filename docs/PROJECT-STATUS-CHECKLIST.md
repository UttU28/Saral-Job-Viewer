# Project status — what you have vs what’s left

Snapshot from your **`gcloud` inventory** (Artifact Registry, Run, Secrets, Scheduler, SAs). Use **`[x]` = done**, **`[ ]` = not done yet**.

---

## 1) Registry & images

| Item | Status |
|------|--------|
| GCP project `saraljobviewer` | [x] |
| Artifact Registry repo `saral-job-viewer-cr` (`us-east1`) | [x] |
| Docker image **`dvalidate`** (verify/apply job) | [x] |
| Docker image **`api`** (FastAPI / `docker/Dockerfile.api`) | [ ] |
| Docker image **`frontend`** (optional; or use static hosting without a second image) | [ ] |

---

## 2) Cloud Run

| Item | Status |
|------|--------|
| **Cloud Run Job** `saral-dvalidate-job` (`us-east1`) | [x] |
| **Cloud Run Services** (HTTP) — API + UI | [ ] *(you listed **0** services)* |

---

## 3) Secrets (Secret Manager)

| Item | Status |
|------|--------|
| `MONGODB_URI` | [x] |
| `MONGODB_DATABASE` | [x] |
| `MIDHTECH_EMAIL` | [x] |
| `MIDHTECH_PASSWORD` | [x] |
| `JWT_SECRET` (API auth) | [ ] |
| `REDIS_URL` or equivalent (if using Redis in prod) | [ ] |
| Any other API-only secrets you use in `.env` | [ ] |

---

## 4) Scheduler & automation

**Note:** Cloud Scheduler here is only for the **validation Job** (daily run). **API and frontend** are normal **Cloud Run services** — they keep running after you deploy (no scheduler). You redeploy manually via Actions when you want a new build.

| Item | Status |
|------|--------|
| Cloud Scheduler job `saral-dvalidate-midnight-utc` (ENABLED) | [x] |
| GitHub Actions: **validation** job deploy (`deployValidation.yml`) | [x] *(repo already has it)* |
| GitHub Actions: **API** deploy (build `docker/Dockerfile.api` → Run **Service**) | [ ] |
| GitHub Actions: **frontend** deploy (build + host) | [ ] |

---

## 5) Identity (service accounts)

| Item | Status |
|------|--------|
| `saral-api-trigger@…` (API / job trigger use cases) | [x] |
| `pipelineservice@…` (automation) | [x] |
| Default compute SA | [x] |
| Dedicated **Cloud Run service SA** for API with **`run.jobs.run`** on `saral-dvalidate-job` (no JSON key in container) | [ ] *(verify IAM when API moves to Cloud Run)* |

---

## 6) Networking & data (full product)

| Item | Status |
|------|--------|
| MongoDB reachable from Cloud Run Job | [x] *(job runs)* |
| **Redis** (Memorystore + VPC connector, or hosted Redis) for API | [ ] |
| **Custom domain + HTTPS** for UI and/or API | [ ] *(optional if `*.run.app` is enough for a phase)* |

---

## 7) APIs enabled (you already have the important ones)

Examples from your list: `run.googleapis.com`, `artifactregistry.googleapis.com`, `secretmanager.googleapis.com`, `cloudscheduler.googleapis.com`, `iamcredentials.googleapis.com` (WIF), etc. — treat as **[x]** for current scope.

If you add **VPC Serverless Connector** for Memorystore, enable **`vpcaccess.googleapis.com`** when you get there.

---

## Short “what’s next” list

1. [ ] Add **Cloud Run Service** for the **FastAPI** image; secrets + env (`GCP_*`, `RUN_JOB_NAME`, …).  
2. [ ] Add **CI workflow** to build/push **`docker/Dockerfile.api`** and deploy that service.  
3. [ ] Decide **frontend** hosting (Cloud Run static, Firebase, GCS+LB) + **CI**; set **`VITE_API_URL`**.  
4. [ ] Add **JWT** / **Redis** secrets (and Redis infra) if required in prod.  
5. [ ] **Domain** + certs when you leave default Run URLs.  
6. [ ] Confirm API triggers job via **attached SA**, not `gcp-sa.json` in the image.

For commands to re-scan GCP, see **`GCP-INVENTORY-WINDOWS.md`**.
