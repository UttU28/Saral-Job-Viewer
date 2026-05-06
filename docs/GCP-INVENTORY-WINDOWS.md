# gcloud inventory commands (Windows)

Use these to **list what already exists** in GCP (artifacts, Cloud Run, secrets, scheduler) and plan next steps.

**Checklist vs full project:** see **`PROJECT-STATUS-CHECKLIST.md`** (what you have / what’s empty).

**Prereq:** [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed, `gcloud auth login` done.

---

## 1) Set project and region (each session)

**PowerShell**

```powershell
gcloud config set project saraljobviewer
gcloud config set run/region us-east1
$env:GCP_PROJECT = "saraljobviewer"
$env:GCP_REGION  = "us-east1"
```

**Command Prompt (cmd)**

```cmd
gcloud config set project saraljobviewer
gcloud config set run/region us-east1
set GCP_PROJECT=saraljobviewer
set GCP_REGION=us-east1
```

**Confirm**

```powershell
gcloud config list
```

---

## 2) Artifact Registry (repos + images)

**List repositories** (project-wide)

**PowerShell** — use `$env:GCP_PROJECT` (not `%GCP_PROJECT%`; that is **cmd.exe** only).

```powershell
gcloud artifacts repositories list --project=$env:GCP_PROJECT
```

**Command Prompt (cmd)**

```cmd
gcloud artifacts repositories list --project=%GCP_PROJECT%
```

**List Docker images** in your repo (matches `deployValidation.yml`: `saral-job-viewer-cr`)

```powershell
gcloud artifacts docker images list us-east1-docker.pkg.dev/saraljobviewer/saral-job-viewer-cr
```

**Show only image names / tags** (compact)

```powershell
gcloud artifacts docker images list us-east1-docker.pkg.dev/saraljobviewer/saral-job-viewer-cr --format="table(package,version,create_time)"
```

---

## 3) Cloud Run — services (HTTP APIs / frontends)

**All services in region**

```powershell
gcloud run services list --region=us-east1 --project=saraljobviewer
```

**Details + URLs**

```powershell
gcloud run services list --region=us-east1 --project=saraljobviewer --format="table(metadata.name,status.url,status.latestReadyRevisionName)"
```

**Describe one service** (replace `SERVICE_NAME`)

```powershell
gcloud run services describe SERVICE_NAME --region=us-east1 --project=saraljobviewer
```

---

## 4) Cloud Run — jobs (`validation.py` / Cloud Run Job)

**List jobs**

```powershell
gcloud run jobs list --region=us-east1 --project=saraljobviewer
```

**Describe your job** (name from workflow: `saral-dvalidate-job`)

```powershell
gcloud run jobs describe saral-dvalidate-job --region=us-east1 --project=saraljobviewer
```

**Recent executions** (if supported in your gcloud version)

```powershell
gcloud run jobs executions list --job=saral-dvalidate-job --region=us-east1 --project=saraljobviewer --limit=10
```

---

## 5) Secret Manager (names only — safe to list)

```powershell
gcloud secrets list --project=saraljobviewer
```

**Do not** print secret values in tickets; use Console or `gcloud secrets versions access` only when needed locally.

---

## 6) Cloud Scheduler

```powershell
gcloud scheduler jobs list --location=us-east1 --project=saraljobviewer
```

**Describe** (name from workflow: `saral-dvalidate-midnight-utc`)

```powershell
gcloud scheduler jobs describe saral-dvalidate-midnight-utc --location=us-east1 --project=saraljobviewer
```

---

## 7) Service accounts (who runs what)

```powershell
gcloud iam service-accounts list --project=saraljobviewer
```

---

## 8) Optional: APIs enabled

```powershell
gcloud services list --enabled --project=saraljobviewer --format="table(config.name)"
```

Useful to confirm `run.googleapis.com`, `artifactregistry.googleapis.com`, `secretmanager.googleapis.com`, `cloudscheduler.googleapis.com`, etc.

---

## 9) Export JSON for a checklist (PowerShell)

Write one file per resource type:

```powershell
New-Item -ItemType Directory -Force -Path .\gcp-snapshots | Out-Null
gcloud artifacts repositories list --project=saraljobviewer --format=json | Out-File .\gcp-snapshots\artifacts-repos.json -Encoding utf8
gcloud artifacts docker images list us-east1-docker.pkg.dev/saraljobviewer/saral-job-viewer-cr --format=json | Out-File .\gcp-snapshots\docker-images.json -Encoding utf8
gcloud run services list --region=us-east1 --project=saraljobviewer --format=json | Out-File .\gcp-snapshots\run-services.json -Encoding utf8
gcloud run jobs list --region=us-east1 --project=saraljobviewer --format=json | Out-File .\gcp-snapshots\run-jobs.json -Encoding utf8
gcloud secrets list --project=saraljobviewer --format=json | Out-File .\gcp-snapshots\secrets.json -Encoding utf8
gcloud scheduler jobs list --location=us-east1 --project=saraljobviewer --format=json | Out-File .\gcp-snapshots\scheduler.json -Encoding utf8
```

Add `gcp-snapshots/` to `.gitignore` if you keep secrets-adjacent metadata out of git (images list is usually fine; still optional).

---

## What to write down for your plan

| Check | Command section |
|--------|------------------|
| Images you have (`dvalidate`, future `api`, `frontend`) | §2 |
| Any **Cloud Run services** already (API/UI) | §3 |
| **Job** config + image | §4 |
| **Secrets** names expected by job/API | §5 |
| **Scheduler** linked to job | §6 |
| **Service accounts** for Run vs GitHub WIF | §7 |

Repo constants: `docs/CICD-FULL-STACK.md`, `.github/workflows/deployValidation.yml` (`RUN_JOB_NAME`, `AR_REPOSITORY`, `IMAGE_NAME`).
