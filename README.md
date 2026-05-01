# Saral Job Viewer

DB-first job scraping, storage, and viewing pipeline for multiple sources (JobRight, GlassDoor, ZipRecruiter), with a FastAPI backend and frontend UI.

## Current Architecture

- **Scrapers**
  - `aJobRight.py`
  - `bGlassDoor.py`
  - `cZipRecruiter.py`
- **Automation helper**
  - `dFillForm.py`
- **Backend API**
  - `server.py` (FastAPI)
- **Core utilities**
  - `utils/fileManagement.py` (normalization, dedupe flow, DB-write orchestration)
  - `utils/dataManager.py` (SQLite schema + CRUD helpers + scrape logging)
- **Maintenance**
  - `zClean.py` (delete `__pycache__` and temp/cache files)
- **Data storage**
  - `zata/saralJobViewer.db`
  - `zata/logs/`

## Key Behavior

- JSON output files are not used for persistence.
- Jobs are normalized and saved to SQLite.
- Logs are written to `zata/logs/scrape-YYYY-MM-DD.log`.
- Deduplication is DB-first (`jobData` + `pastData` by platform).
- Blocked domains are skipped from `jobData` and tracked in `pastData`.

## Database Schema

### `jobData`

- `jobId` (PRIMARY KEY, NOT NULL)
- `title`
- `jobUrl` (NOT NULL)
- `location`
- `employmentType`
- `workModel`
- `seniority`
- `experience`
- `originalJobPostUrl` (NOT NULL)
- `companyName` (NOT NULL)
- `jobDescription` (NOT NULL)
- `timestamp`
- `applyStatus`
- `platform` (NOT NULL)

### `pastData`

- `jobId` (PRIMARY KEY, NOT NULL)
- `platform` (NOT NULL)
- `timestamp`
- `companyName` (NOT NULL)

## API Endpoints (`server.py`)

- `GET /health`
- `GET /api/jobs`
  - Query params: `platform`, `company`, `q`, `limit`, `offset`
- `GET /api/jobs/{job_id}`
- `GET /api/past-data`
  - Query params: `platform`, `limit`, `offset`
- `GET /api/stats`

## Setup

### 1) Python environment

```bash
python -m venv env
venv\Scripts\activate
pip install -r requirements.txt
```

### 2) Environment file

Copy `.env.example` to `.env` and set values you need (Chrome path/profile/port and scraping behavior flags).

### 3) Run API server

```bash
python server.py
```

FastAPI runs on `http://127.0.0.1:8000` by default.

### 4) Run scrapers

```bash
python aJobRight.py
python bGlassDoor.py
python cZipRecruiter.py
```

## Frontend

Frontend source is under `frontend/src` and is built to consume the API from `server.py`.

## Cleanup Script

Use `zClean.py` to delete temp/cache files.

```bash
python zClean.py --dry-run
python zClean.py
```

## Notes

- Some scraper failures are expected in live browser automation (timeouts, non-interactable rows, closed windows) and should be handled by reruns/retries.
- Keep `linkedIn/` scripts isolated if you use them for separate experiments; core flow is the root scraper + `utils/` pipeline above.
