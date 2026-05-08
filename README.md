# Saral Job Viewer

End-to-end job pipeline: **browser scrapers** (JobRight, Glassdoor, ZipRecruiter) write to **MongoDB**, a **FastAPI** backend serves cached reads with **Redis**, a **Vite/React** SPA is the primary UI (jobs, auth, admin), and **`validation.py`** checks and pushes listings to **Midhtech**. Production runs on **Google Cloud** (Cloud Run, Memorystore, global HTTPS LB, Artifact Registry, Secret Manager) with **GitHub Actions** (Workload Identity Federation — no long-lived keys in the repo).

---

## Documentation

| Doc | Purpose |
|-----|---------|
| **[docs/GCP-PLATFORM-KT.md](docs/GCP-PLATFORM-KT.md)** | GCP services, resource names, identity, workflow ↔ GCP matrix, architecture diagram (runtime view). |
| **[docs/CICD-FULL-STACK.md](docs/CICD-FULL-STACK.md)** | Deploy/destroy/prereq workflows, secrets summary, global LB, IAM snippets for pipeline SA, architecture diagram. |
| **[docs/MONITORING-WINDOWS-GCLOUD.md](docs/MONITORING-WINDOWS-GCLOUD.md)** | Monitoring scope; **`setupMonitoring.yml`** (dashboard + uptime + alerts); IAM; optional Windows **`gcloud`**; **`loadTest.py`** for alert drill. |
| **[docs/PROJECT-STATUS-CHECKLIST.md](docs/PROJECT-STATUS-CHECKLIST.md)** | What is implemented vs optional follow-ups. |

---

## What’s in this repository

| Layer | Role |
|-------|------|
| **Scrapers** | **`scraping/aJobRight.py`**, **`scraping/bGlassDoor.py`**, **`scraping/cZipRecruiter.py`** — Selenium/Chrome; persist via **`utils/dataManager.py`**. Run all in order from root: **`python midhScraping.py`**. |
| **API** | **`app.py`** — FastAPI: job queries, filters, auth (JWT), admin (users, scraper keywords, cache bust, Cloud Run job trigger), Redis-backed caching (**`utils/redisCache.py`**). |
| **Frontend** | **`frontend/`** — Vite + React + TypeScript + Tailwind/Radix (`npm run dev` / `npm run build`). Calls API using **`VITE_API_URL`**. |
| **Validation** | **`validation.py`** — Midhtech validation/suggest flow against MongoDB (`-1` pending checks, `-2` push APPLY jobs). Same logic ships in **`docker/Dockerfile.validation`** as **`saral-dvalidate-job`** on a schedule. |
| **Utilities** | **`utils/`** — data access, Midhtech client, JWT/auth helpers, job decisions, weekly stats, Redis, scraper helpers. |
| **Ops / stress** | **`loadTest.py`** — optional HTTP load against public UI/API URLs; interactive scenarios **1 / 2 / 3** aligned with Monitoring alert policies (`pip install tqdm` recommended). |

---

## Tech stack (high level)

- **Python 3.12+** (recommended), **Node.js 18+** for local frontend dev  
- **MongoDB** (Atlas in production)  
- **Redis** (optional locally via Docker; **Memorystore** + VPC connector in production API)  
- **FastAPI**, **Uvicorn**, **Pydantic**  
- **Docker** / **docker compose** for validation image and local API+Redis (`--profile dev`)  

Dependencies for backend/scrapers: **`requirements.txt`**.

---

## Repository layout (main paths)

```
├── app.py                 # FastAPI application entry
├── validation.py          # CLI validation / Midhtech pipeline
├── scraping/              # JobRight / Glassdoor / ZipRecruiter scrapers
├── midhScraping.py        # Run scrapers sequentially (from repo root)
├── loadTest.py            # Optional load / Monitoring alert drill
├── klean.py               # Temp/cache cleanup
├── utils/                 # Shared Python modules
├── frontend/              # Vite SPA (package.json, src/)
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.frontend
│   └── Dockerfile.validation
├── docker-compose.yml     # dvalidate default; api + redis with --profile dev
├── .github/workflows/     # deployment, ensurePrereq, destroyStack, runValidationManual, setupMonitoring
└── docs/                  # Architecture & CI/CD docs (see table above)
```

**Out of main flow:** **`linkedIn/`** — separate LinkedIn experiments; **`zata/`** — local scraper/output artifacts (keep out of Git where appropriate).

---

## Prerequisites

- **Python** with `venv`  
- **Google Chrome** (path configured in `.env` for scrapers)  
- **MongoDB URI** and Midhtech credentials for validation/API  
- **Node + npm** — only if you develop or build **`frontend/`** locally  
- **Docker Desktop** (optional) — for **`docker compose`**  

---

## Configuration

Copy **`.env.example`** → **`.env`** at the repo root and fill in values.

### Scraping (`CHROME_*`, `SCRAPING_*`, `DATA_DIR`, …)

Chrome binary path, dedicated profile directory, port, headless flags. Search keywords for scrapers are stored in MongoDB (**Admin UI** → scraper settings), not only in env.

### Database & auth

- **`MONGODB_URI`**, **`MONGODB_DATABASE`**  
- **`JWT_SECRET`** — required for API user sessions  
- **`MIDHTECH_EMAIL`**, **`MIDHTECH_PASSWORD`** — validation / suggest API  

### API & frontend URL

- **`API_HOST`**, **`API_PORT`** — local API bind  
- **`VITE_API_URL`** — browser-facing API base URL (local dev: `http://127.0.0.1:8000`; production SPA build: public HTTPS API URL, typically set via **Secret Manager** in **`deployment.yml`**)

### Redis (API cache)

- **`REDIS_ENABLED`**, **`REDIS_URL`**, **`REDIS_PREFIX`**, TTL/timeouts — local compose uses **`redis://sjv-redis:6379/0`** on the **`dev`** profile  

### Cloud Run job trigger (API only)

When the UI/admin triggers the validation job from GCP:

- **`GOOGLE_APPLICATION_CREDENTIALS`** — path to SA JSON when running locally (compose snippet in **`docker-compose.yml`** comments)  
- **`GCP_PROJECT_ID`**, **`GCP_REGION`**, **`RUN_JOB_NAME`** — default **`saral-dvalidate-job`**  

Production uses **Workload Identity** / runtime SA on Cloud Run — no key baked into images.

---

## Local setup (Python)

```powershell
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

On macOS/Linux use `source venv/bin/activate`.

---

## Run the API locally

```powershell
# From repo root with .env present
uvicorn app:app --host 0.0.0.0 --port 8000
```

Health-style routes include **`/api/health`** (used by uptime checks behind the load balancer).

---

## Run the frontend locally

```powershell
cd frontend
npm install
npm run dev
```

Ensure **`VITE_API_URL`** in root **`.env`** points at your API (Vite reads env at dev/build time).

---

## Run scrapers

From the **repo root** (so `.env` and data paths resolve correctly):

```powershell
python midhScraping.py
python scraping/aJobRight.py
python scraping/bGlassDoor.py
python scraping/cZipRecruiter.py
```

---

## Run validation (`validation.py`)

Interactive menus:

```powershell
python validation.py
```

Non-interactive:

```powershell
python validation.py -1    # validate pending (FIFO)
python validation.py -2    # push APPLY rows to suggest API
```

---

## Optional HTTP load test (`loadTest.py`)

Stress public URLs (respect production — alerts and quotas may fire):

```powershell
python loadTest.py                    # interactive scenarios 1 / 2 / 3
python loadTest.py --help             # CLI: --targetUrl, --durationSeconds, ...
```

Install **`tqdm`** for per-process progress bars (`requirements.txt` includes it).

---

## Docker

### Validation image (default compose service)

```powershell
docker compose up --build
```

Runs **`dvalidate`** with **`command: ["-1"]`** — adjust in **`docker-compose.yml`** if needed.

### API + Redis (dev profile)

```powershell
docker compose --profile dev up --build
```

- API: **http://localhost:8000**  
- Redis: **localhost:6379**  

Mount **`gcp-sa.json`** only when testing Cloud Run Jobs API from local API (see commented **`volumes`** in **`docker-compose.yml`**).

### Build images individually

```powershell
docker build -f docker/Dockerfile.api -t saral-api:local .
docker build -f docker/Dockerfile.frontend -t saral-ui:local .
docker build -f docker/Dockerfile.validation -t saral-dvalidate:local .
```

---

## CI/CD (GitHub Actions → GCP)

Production deploy identity uses **OIDC → GCP service account** (secrets **`GCP_WORKLOAD_IDENTITY_PROVIDER`**, **`GCP_SERVICE_ACCOUNT`**); runtime uses **`GCP_API_RUN_SERVICE_ACCOUNT`**.

| Workflow | Purpose |
|----------|---------|
| **`deployment.yml`** | Path-filtered builds; **`production-approval`** on `main`; deploy **`saral-api`**, **`saral-ui`**, **`saral-dvalidate-job`** + Cloud Scheduler; **`ensureGlobalLoadBalancer`** after API/UI jobs when applicable. |
| **`ensurePrereq.yml`** | Bootstrap: APIs, secret/image checks; optional Memorystore + VPC connector; optional Cloud Run domain mappings (**not** the global LB). |
| **`destroyStack.yml`** | Confirmed teardown; optional LB delete; parallel Run service deletes; job + Scheduler; Redis/VPC ordering as scripted. |
| **`runValidationManual.yml`** | One-off job execution + optional wait. |
| **`setupMonitoring.yml`** | Manual: Monitoring dashboard + uptime checks + alert policies (definitions embedded in workflow); repo secret **`MONITORING_ALERT_EMAIL`** unless **`skipNotificationChannelAndAlerts`**. |

Detailed secrets, LB object names, and IAM for the pipeline SA: **[docs/CICD-FULL-STACK.md](docs/CICD-FULL-STACK.md)**.

**Typical flow:** push to **`main`** or dispatch **`deployment.yml`** → approval → deploy changed paths → LB sync when UI/API change → optionally run **`setupMonitoring.yml`** after DNS/LB are stable.

---

## Security

- Do not commit **`.env`** or service-account JSON.  
- Production paths use **Secret Manager** and **WIF** — avoid **`gcp-sa.json`** in Cloud Run images for normal operation.  
- Rotate **`JWT_SECRET`** and Midhtech credentials per your policy.

---

## Cleanup

```powershell
python klean.py --dry-run
python klean.py
```

---

## Resource naming

Internal project name **Saral Job Viewer**; GCP resources and workflows use prefixes such as **`sjv-`** / **`saral-`** as listed in **[docs/GCP-PLATFORM-KT.md](docs/GCP-PLATFORM-KT.md)**.
