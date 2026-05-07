# Saral Job Viewer

Job scraping + validation pipeline for JobRight, Glassdoor, and ZipRecruiter, with MongoDB as the source of truth.

**Docs:** **[docs/CICD-FULL-STACK.md](docs/CICD-FULL-STACK.md)** (workflows, LB, secrets) and **[docs/PROJECT-STATUS-CHECKLIST.md](docs/PROJECT-STATUS-CHECKLIST.md)** (done vs optional).

## What This Repo Does

- Scrapes jobs from multiple platforms:
  - `aJobRight.py`
  - `bGlassDoor.py`
  - `cZipRecruiter.py`
- Normalizes and writes jobs to MongoDB via `utils/dataManager.py`.
- Runs validation/push flow against Midhtech using **`validation.py`**.
- Supports local Docker runs and Cloud Run Job + Scheduler CI/CD.

## Current Architecture

- **Scrapers**: browser-based collection and normalization
- **Data layer**: `utils/dataManager.py` (MongoDB only)
- **Validation pipeline**: **`validation.py`**
- **Maintenance**: `klean.py` for temp/cache cleanup
- **Deploy**:
  - **`docker/Dockerfile.validation`** (container for `validation.py`)
  - **`docker/Dockerfile.api`** (FastAPI `app.py`)
  - **`docker/Dockerfile.frontend`** (Vite UI + nginx for Cloud Run)
  - `docker-compose.yml` (default: validation job; `--profile dev`: API + Redis on :8000 / :6379)
  - **`.github/workflows/deployment.yml`** — main path: build/deploy API, UI, validation job + Scheduler (approval gate on `main`)
  - **`.github/workflows/ensurePrereq.yml`** — bootstrap: secrets/images, optional Redis/VPC, optional LB, optional domain mappings
  - **`.github/workflows/destroyStack.yml`** — teardown (optional LB/Redis/VPC/mappings)
  - **`.github/workflows/runValidationManual.yml`** — manual Cloud Run job run
  - **[docs/CICD-FULL-STACK.md](docs/CICD-FULL-STACK.md)** for full CI/CD detail

## Environment Variables

Copy `.env.example` to `.env` and set values.

### Scraping

- `CHROME_APP_PATH`
- `SCRAPING_CHROME_DIR`
- `SCRAPING_PORT`
- `DATA_DIR`
- Scraper search keywords are configured in Admin UI and stored in MongoDB (`scraperSettings` collection)
- `SCRAPING_STALE_RETRIES`
- `SCRAPING_STALE_DELAY`
- `SCRAPING_HEADLESS`
- `CLOSE_ON_COMPLETE`

### Database + Midhtech

- `MONGODB_URI`
- `MONGODB_DATABASE`
- `MIDHTECH_EMAIL`
- `MIDHTECH_PASSWORD`

## Local Setup

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

## Run Scrapers

```bash
python aJobRight.py
python bGlassDoor.py
python cZipRecruiter.py
```

## Run Validation (`validation.py`)

Interactive mode:

```bash
python validation.py
```

CLI mode:

```bash
python validation.py -1
python validation.py -2
```

Where:

- `-1`: validate all pending (NULL applyStatus → check API, FIFO)
- `-2`: push all APPLY jobs to the suggest API

## Docker (Local)

**Validation job image** (`docker/Dockerfile.validation`):

```bash
docker build -f docker/Dockerfile.validation -t saral-dvalidate .
```

Run once:

```bash
docker run --rm \
  -e MONGODB_URI="..." \
  -e MONGODB_DATABASE="saralJobViewer" \
  -e MIDHTECH_EMAIL="..." \
  -e MIDHTECH_PASSWORD="..." \
  -e GOOGLE_APPLICATION_CREDENTIALS="/app/secrets/gcp-sa.json" \
  -v "$(pwd)/gcp-sa.json:/app/secrets/gcp-sa.json:ro" \
  saral-dvalidate
```

For API deploys via `deploy.sh`, put your key at `./gcp-sa.json` (or set `SARAL_GCP_SA_PATH=/absolute/path/to/key.json` before running deploy). The script mounts it read-only to `/app/secrets/gcp-sa.json`.

Compose one-shot:

```bash
docker compose up
```

## CI/CD + Cloud Run Job

See **[docs/CICD-FULL-STACK.md](docs/CICD-FULL-STACK.md)** for workflows, load balancer, and secrets. Status checklist: **[docs/PROJECT-STATUS-CHECKLIST.md](docs/PROJECT-STATUS-CHECKLIST.md)**.

**Typical Actions flow:**

- Push to **`main`** (or manual **deployment** workflow): path-filtered builds → **`saral-api`**, **`saral-ui`**, validation **job** + daily Scheduler (`00:00 UTC`), plus LB backend sync when API/UI change.
- **Ensure Prerequisites** when standing up or fixing infra (Redis/VPC/LB/mappings).
- **Run Validation Manual** for one-off job runs.

Redeploy via GitHub Actions after changing `validation.py` or job/container settings so Cloud Run matches the repo.

## Security Notes

- Never commit real credentials in `.env`.
- Docker images avoid baking `.env` into layers; use Secret Manager on Cloud Run.
- Use Secret Manager for Cloud Run runtime secrets.

## Cleanup

```bash
python klean.py --dry-run
python klean.py
```

## Notes

- `linkedIn/` contains separate/legacy LinkedIn-specific experiments and is not part of the main root scraper flow.
- `zata/` is ignored for runtime artifacts and logs.
