# Saral Job Viewer

Job scraping + validation pipeline for JobRight, Glassdoor, and ZipRecruiter, with MongoDB as the source of truth.

**Docs:** see **[docs/README.md](docs/README.md)** (CI/CD, GCP inventory, Cloud Run).

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
  - `.github/workflows/deployValidation.yml` (build + deploy job + deploy scheduler)
  - `.github/workflows/deployApi.yml` / **`deployFrontend.yml`** (Cloud Run API + UI)
  - `.github/workflows/runValidationManual.yml` (manual one-time run)
  - **[docs/gcpCloudRun.md](docs/gcpCloudRun.md)** (GCP setup guide)

## Environment Variables

Copy `.env.example` to `.env` and set values.

### Scraping

- `CHROME_APP_PATH`
- `SCRAPING_CHROME_DIR`
- `SCRAPING_PORT`
- `DATA_DIR`
- `SCRAPER_SEARCH_KEYWORDS`
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

Automated deploy flow is documented in **[docs/gcpCloudRun.md](docs/gcpCloudRun.md)** and **[docs/CICD-FULL-STACK.md](docs/CICD-FULL-STACK.md)**. Current GCP/UI/API/Redis status: **[docs/PROJECT-STATUS-CHECKLIST.md](docs/PROJECT-STATUS-CHECKLIST.md)**. Custom domain (paths vs subdomains): **[docs/CustomDomainCloudRun.md](docs/CustomDomainCloudRun.md)**.

Current workflow:

- Build and push Docker image to Artifact Registry (`docker/Dockerfile.validation`)
- Update/create Cloud Run Job (container entrypoint uses `validation.py`)
- Ensure Cloud Scheduler runs job daily at `00:00 UTC`

After this repo change, run **Deploy Validation** once in GitHub Actions so the live job image and args match `validation.py`.

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
