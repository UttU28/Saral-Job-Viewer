# Saral Job Viewer

End-to-end job pipeline: **browser scrapers** (JobRight, Glassdoor, ZipRecruiter) write to **MongoDB**, a **FastAPI** backend serves cached reads with **Redis**, a **Vite/React** SPA is the primary UI (jobs, auth, admin), and **`scraping/validation.py`** checks and pushes listings to **Midhtech**. Deploy the API/UI stack with **`./deploy.sh`** or **`./backend/deploy.sh`** (Docker + nginx + SSL). Scrapers stay local (not orchestrated).

---

## Documentation

| Doc | Purpose |
|-----|---------|
| **[backend/docs/ARCHITECTURE-DIAGRAMS.md](backend/docs/ARCHITECTURE-DIAGRAMS.md)** | Mermaid architecture views |
| **[backend/docs/GCP-PLATFORM-KT.md](backend/docs/GCP-PLATFORM-KT.md)** | GCP services / KT |
| **[backend/docs/CICD-FULL-STACK.md](backend/docs/CICD-FULL-STACK.md)** | Deploy/destroy/prereq workflows |
| **[backend/docs/DATABASE-SCHEMA.md](backend/docs/DATABASE-SCHEMA.md)** | MongoDB schema reference |
| **[backend/docs/PROJECT-STATUS-CHECKLIST.md](backend/docs/PROJECT-STATUS-CHECKLIST.md)** | Implemented vs follow-ups |

---

## What’s in this repository

| Layer | Role |
|-------|------|
| **Scrapers** | **`scraping/`** — `aJobRight.py`, `cZipRecruiter.py`, `midhScraping.py`, local `validation.py`. Chrome profile under `scraping/zata/`. Config: **`scraping/.env`**. |
| **API** | **`backend/app.py`** — FastAPI + Redis cache + Gmail/PlaceTrack. Config: **`backend/.env`**. |
| **Frontend** | **`frontend/`** — Vite + React. Image: `docker/Dockerfile.frontend`. |
| **Deploy** | Root **`docker/` + `docker-compose.yml`**. Scripts: `./deploy.sh [backend\|frontend]`, `backend/deploy.sh`, `frontend/deploy.sh`. |

---

## Tech stack (high level)

- **Python 3.12+** (recommended), **Node.js 18+** for local frontend dev  
- **MongoDB** (Atlas in production)  
- **Redis** (optional locally via Docker; **Memorystore** + VPC connector in production API)  
- **FastAPI**, **Uvicorn**, **Pydantic**  
- **Docker** / **docker compose** — Redis, API, UI (`./backend/deploy.sh`)

Dependencies: **`backend/requirements.txt`** (API), **`scraping/requirements.txt`** (scrapers).

---

## Repository layout (main paths)

```
├── frontend/              # Vite SPA + frontend/deploy.sh
├── backend/               # FastAPI + backend/deploy.sh + .env
├── scraping/              # local Chrome scrapers (no Docker)
├── docker/                # Dockerfiles + nginx templates (shared)
├── docker-compose.yml     # full stack (api + ui + redis)
└── deploy.sh              # ./deploy.sh backend | frontend
```

---

## Prerequisites

- **Python** with `venv` (repo-root `./venv`)
- **Google Chrome** (path in **`scraping/.env`**)
- **MongoDB URI** and Midhtech credentials
- **Node + npm** — only for local **`frontend/`** work
- **Docker** — for **`backend/deploy.sh`**

---

## Configuration

| Package | File |
|---------|------|
| API / deploy | `backend/.env` ← copy `backend/.env.example` |
| Scrapers | `scraping/.env` ← copy `scraping/.env.example` |

Repo-root `.env` is unused.

### Scraping (`scraping/.env`)

`CHROME_APP_PATH`, `SCRAPING_CHROME_DIR` (under `scraping/zata/…`), `SCRAPING_PORT`, headless flags, Mongo + Midhtech, `SARAL_API_BASE_URL`.

### Backend (`backend/.env`)

- **`MONGODB_URI`**, **`MONGODB_DATABASE`**, **`JWT_SECRET`**
- **`MIDHTECH_EMAIL`**, **`MIDHTECH_PASSWORD`** (validation containers)
- **`SARAL_DOMAIN`**, **`SARAL_SSL_EMAIL`** — required for deploy / Let's Encrypt
- Redis, Gmail OAuth, local LLM settings

### Frontend URL

At build time, deploy sets **`VITE_API_URL`** from `SARAL_DOMAIN` (same-origin `/api` via nginx).

---

## Local setup (Python)

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
pip install -r scraping/requirements.txt
```

---

## Run the API locally

```bash
cd backend
source ../venv/bin/activate
uvicorn app:app --host 0.0.0.0 --port 9260
```

Health: **`/api/health`**.

---

## Run the frontend locally

```bash
cd frontend
npm install
npm run dev
```

Unset `VITE_API_URL` to use the Vite `/api` proxy, or point it at `http://127.0.0.1:9260`.

---

## Run scrapers

```bash
cd scraping
source ../venv/bin/activate
python midhScraping.py          # all platforms
python aJobRight.py
python cZipRecruiter.py
./scheduleMidhScraping.sh       # cron-friendly
```

Local validation:

```bash
cd scraping
python validation.py -1    # pending checks
python validation.py -2    # push APPLY jobs
./cleanAfterApply.sh
```

---

## Docker deploy

Set in **`backend/.env`**:

```env
SARAL_DOMAIN=saral.thatinsaneguy.com
SARAL_SSL_EMAIL=you@thatinsaneguy.com
SARAL_API_BASE_URL=https://saral.thatinsaneguy.com
```

Then:

```bash
./deploy.sh                 # full stack → backend/deploy.sh
./deploy.sh frontend        # UI container only
./frontend/deploy.sh        # same
./backend/deploy.sh         # full stack
# or from Desktop menu:
sudo bash ~/Desktop/deploy.sh 3
```

| URL | Service |
|-----|---------|
| `https://saral.thatinsaneguy.com` | Frontend |
| `https://saral.thatinsaneguy.com/api/*` | Backend |

Validation image is built but not started — trigger from Admin UI, or:

```bash
docker run --rm --network saral-job-viewer_sjv-net --env-file backend/.env saral-dvalidate:latest -1
```

---

## Security

- Do not commit **`.env`** or credentials (`backend/.env`, `scraping/.env`).
- Rotate **`JWT_SECRET`** and Midhtech credentials per your policy.

---

## Resource naming

Internal project name **Saral Job Viewer**; Docker images use **`saral-*:latest`** tags.
