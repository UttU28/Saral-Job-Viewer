# Saral Job Viewer

Job scraping + validation pipeline for JobRight, Glassdoor, and ZipRecruiter, with MongoDB as the source of truth.

## What This Repo Does

- Scrapes jobs from multiple platforms:
  - `aJobRight.py`
  - `bGlassDoor.py`
  - `cZipRecruiter.py`
- Normalizes and writes jobs to MongoDB via `utils/dataManager.py`.
- Runs validation/push flow against Midhtech using `dValidate.py`.
- Supports local Docker runs and Cloud Run Job + Scheduler CI/CD.

## Current Architecture

- **Scrapers**: browser-based collection and normalization
- **Data layer**: `utils/dataManager.py` (MongoDB only)
- **Validation pipeline**: `dValidate.py`
- **Maintenance**: `klean.py` for temp/cache cleanup
- **Deploy**:
  - `Dockerfile` (container for `dValidate.py`)
  - `docker-compose.yml` (local one-shot run)
  - `.github/workflows/deploy-dvalidate-job.yml` (CI/CD)
  - `docs/gcp-cloud-run-job-cicd.md` (GCP setup guide)

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

## Run Validation (`dValidate.py`)

Interactive mode:

```bash
python dValidate.py
```

CLI mode:

```bash
python dValidate.py -1
python dValidate.py -2
python dValidate.py -3
python dValidate.py -4
```

Where:

- `-1`: validate pending jobs
- `-2`: cleanup non-APPLY + prune old pastData
- `-3`: push APPLY jobs, then cleanup
- `-4`: show DB status report

## Docker (Local)

Build:

```bash
docker build -t saral-dvalidate .
```

Run once:

```bash
docker run --rm \
  -e MONGODB_URI="..." \
  -e MONGODB_DATABASE="saralJobViewer" \
  -e MIDHTECH_EMAIL="..." \
  -e MIDHTECH_PASSWORD="..." \
  saral-dvalidate
```

Compose one-shot:

```bash
docker compose up
```

## CI/CD + Cloud Run Job

Automated deploy flow is documented in:

- `docs/gcp-cloud-run-job-cicd.md`

Current workflow:

- Build and push Docker image to Artifact Registry
- Update/create Cloud Run Job
- Ensure Cloud Scheduler runs job daily at `00:00 UTC`

## Security Notes

- Never commit real credentials in `.env`.
- Docker image is configured to avoid baking `.env` into image layers.
- Use Secret Manager for Cloud Run runtime secrets.

## Cleanup

```bash
python klean.py --dry-run
python klean.py
```

## Notes

- `linkedIn/` contains separate/legacy LinkedIn-specific experiments and is not part of the main root scraper flow.
- `zata/` is ignored for runtime artifacts and logs.
