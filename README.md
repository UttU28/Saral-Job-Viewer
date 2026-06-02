# Saral Job Viewer

End-to-end job pipeline: **browser scrapers** (JobRight, Glassdoor, ZipRecruiter) write to **MongoDB**, a **FastAPI** backend serves cached reads with **Redis**, a **Vite/React** SPA is the primary UI (jobs, auth, admin), and **`validation.py`** checks and pushes listings to **Midhtech**. Deploy the full stack with **`./deploy.sh`** (Docker + nginx + SSL).

---

## Documentation

| Doc | Purpose |
|-----|---------|
| **[docs/ARCHITECTURE-DIAGRAMS.md](docs/ARCHITECTURE-DIAGRAMS.md)** | Mermaid architecture views: big-picture, connectivity, scraper vs API paths, full Main Deploy CI/CD pipeline. |
| **[docs/GCP-PLATFORM-KT.md](docs/GCP-PLATFORM-KT.md)** | GCP services, resource names, identity, workflow ↔ GCP matrix, architecture diagram (runtime view). |
| **[docs/CICD-FULL-STACK.md](docs/CICD-FULL-STACK.md)** | Deploy/destroy/prereq workflows, secrets summary, global LB, IAM snippets for pipeline SA, architecture diagram. |
| **[docs/MONITORING-WINDOWS-GCLOUD.md](docs/MONITORING-WINDOWS-GCLOUD.md)** | Monitoring scope; **`setupMonitoring.yml`** (dashboard + uptime + alerts); IAM; optional Windows **`gcloud`**; **`loadTest.py`** for alert drill. |
| **[docs/DATABASE-SCHEMA.md](docs/DATABASE-SCHEMA.md)** | MongoDB schema reference: every collection, field, index, the **`applyStatus`** state machine, and end-to-end data lifecycle. |
| **[docs/PROJECT-STATUS-CHECKLIST.md](docs/PROJECT-STATUS-CHECKLIST.md)** | What is implemented vs optional follow-ups. |

---

## What’s in this repository

| Layer | Role |
|-------|------|
| **Scrapers** | **`scraping/aJobRight.py`**, **`scraping/bGlassDoor.py`**, **`scraping/cZipRecruiter.py`** — Selenium/Chrome; persist via **`utils/dataManager.py`**. Run all in order from root: **`python midhScraping.py`**. |
| **API** | **`app.py`** — FastAPI: job queries, filters, auth (JWT), admin (users, scraper keywords, cache bust, local Docker validation trigger), Redis-backed caching (**`utils/redisCache.py`**). |
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
- **Docker** / **docker compose** — single stack: Redis, API, UI, nginx, certbot (`./deploy.sh`)

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
│   ├── Dockerfile.redis
│   └── Dockerfile.validation
├── docker-compose.yml     # Redis + API + UI + nginx + certbot
├── deploy.sh              # Build, SSL, and start the stack
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

- **`SARAL_DOMAIN`**, **`SARAL_SSL_EMAIL`** — required for `./deploy.sh` (Let's Encrypt)
- **`VITE_API_URL`** — `https://saral.thatinsaneguy.com` (same origin; `/api` proxied by nginx)
- **`SARAL_API_BASE_URL`** — public API base for scraper admin callbacks

### Redis (API cache)

- **`REDIS_ENABLED`**, **`REDIS_URL`**, **`REDIS_PREFIX`**, TTL/timeouts — internal **`redis://sjv-redis:9262/0`**

### Docker validation (Admin UI triggers on demand)

- **`VALIDATION_IMAGE`** — default **`saral-dvalidate:latest`**
- **`VALIDATION_DOCKER_NETWORK`** — default **`saral-job-viewer_sjv-net`**

The API container needs **`/var/run/docker.sock`** mounted (see **`docker-compose.yml`**) to start validation containers on demand.

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

Set in `.env`:

```env
SARAL_DOMAIN=saral.thatinsaneguy.com
SARAL_SSL_EMAIL=you@thatinsaneguy.com
VITE_API_URL=https://saral.thatinsaneguy.com
SARAL_API_BASE_URL=https://saral.thatinsaneguy.com
```

Point DNS **A** record for `saral.thatinsaneguy.com` at the server, open ports **80** and **443**, then:

```bash
./deploy.sh
```

| URL | Service |
|-----|---------|
| `https://saral.thatinsaneguy.com` | Frontend |
| `https://saral.thatinsaneguy.com/api/*` | Backend |

`deploy.sh` builds all images, starts the stack, obtains Let's Encrypt SSL on first run, and runs a certbot sidecar for renewal. The validation image is built but not started — trigger it from the Admin UI.

Manual validation:

```bash
docker run --rm --network saral-job-viewer_sjv-net --env-file .env saral-dvalidate:latest -1
docker run --rm --network saral-job-viewer_sjv-net --env-file .env saral-dvalidate:latest -2
```

---

## Security

- Do not commit **`.env`** or credentials.
- Rotate **`JWT_SECRET`** and Midhtech credentials per your policy.

---

## Cleanup

```powershell
python klean.py --dry-run
python klean.py
```

---

## Resource naming

Internal project name **Saral Job Viewer**; Docker images use **`saral-*:latest`** tags.
