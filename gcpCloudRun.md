# GCP Deployment Guide (Cloud Run Job + Scheduler + CI/CD)

This document sets up automated deploys for `dValidate.py` using:

- Docker image in Artifact Registry
- Cloud Run Job (run-to-completion)
- Cloud Scheduler (runs daily at `00:00` UTC)
- GitHub Actions CI/CD (build, push, update job)

Repository-specific values used below:

- **Project ID:** `saraljobviewer`
- **Artifact Registry repo:** `saral-job-viewer-cr`
- **Registry host:** `us-east1-docker.pkg.dev`
- **Image path base:** `us-east1-docker.pkg.dev/saraljobviewer/saral-job-viewer-cr`
- **Suggested image name:** `dvalidate`
- **Region:** `us-east1`

---

## 1) Prerequisites

- Dockerfile at repo root builds `dValidate.py` container (already present).
- GCP billing enabled + required APIs enabled.
- Artifact Registry Docker repository exists:
  `us-east1-docker.pkg.dev/saraljobviewer/saral-job-viewer-cr`
- Runtime env/secrets available:
  - `MONGODB_URI`
  - `MONGODB_DATABASE`
  - `MIDHTECH_EMAIL`
  - `MIDHTECH_PASSWORD`

Recommended: keep secrets in **Secret Manager** for Cloud Run Job runtime.

---

## 2) One-time local image push test

Use this once to validate your image path and permissions.

```bash
gcloud auth login
gcloud config set project saraljobviewer
gcloud auth configure-docker us-east1-docker.pkg.dev

docker build -t us-east1-docker.pkg.dev/saraljobviewer/saral-job-viewer-cr/dvalidate:latest .
docker push us-east1-docker.pkg.dev/saraljobviewer/saral-job-viewer-cr/dvalidate:latest
```

If push succeeds, the registry path is good.

---

## 3) Create Cloud Run Job

Console path:

1. **Cloud Run > Jobs > Create job**
2. Image URL:
   `us-east1-docker.pkg.dev/saraljobviewer/saral-job-viewer-cr/dvalidate:latest`
3. Region: `us-east1`
4. Tasks: `1`
5. Command/args:
   - If using current Dockerfile entrypoint/cmd, leave defaults
   - Effective run should be: `python dValidate.py -1`
6. Set env/secrets (or Secret Manager references):
   - `MONGODB_URI`
   - `MONGODB_DATABASE=saralJobViewer`
   - `MIDHTECH_EMAIL`
   - `MIDHTECH_PASSWORD`
7. Timeout: set to your expected max validation runtime (e.g. 1800s-3600s)
8. Run once manually to verify logs.

CLI equivalent:

```bash
gcloud run jobs create saral-dvalidate-job \
  --project=saraljobviewer \
  --region=us-east1 \
  --image=us-east1-docker.pkg.dev/saraljobviewer/saral-job-viewer-cr/dvalidate:latest \
  --command=python \
  --args=dValidate.py,-1 \
  --task-timeout=3600s \
  --max-retries=1 \
  --set-env-vars=MONGODB_DATABASE=saralJobViewer
```

---

## 4) Schedule at 00:00 UTC

Cloud Scheduler cron for daily midnight UTC:

- Schedule: `0 0 * * *`
- Timezone: `Etc/UTC`

You can create scheduler from Cloud Run Job UI or use CLI:

```bash
gcloud scheduler jobs create http saral-dvalidate-midnight-utc \
  --project=saraljobviewer \
  --location=us-east1 \
  --schedule="0 0 * * *" \
  --time-zone="Etc/UTC" \
  --uri="https://us-east1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/saraljobviewer/jobs/saral-dvalidate-job:run" \
  --http-method=POST \
  --oauth-service-account-email="<scheduler-sa>@saraljobviewer.iam.gserviceaccount.com"
```

---

## 5) GitHub Actions CI/CD

Current repo workflows:

- `.github/workflows/deployValidation.yml`
  - Trigger: push to `main` and manual dispatch
  - Build and push image to Artifact Registry (`:sha` + `:latest`)
  - Create/update Cloud Run Job (`dValidate.py -1`)
  - Deploy/update Cloud Scheduler (`00:00 UTC`)
- `.github/workflows/runValidationManual.yml`
  - Trigger: manual dispatch only
  - Executes existing Cloud Run Job once with selectable mode (`1/2/3/4`)
  - Optional wait for completion

### 5.1 GitHub secrets

Add these repository secrets:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

### 5.2 Required IAM roles (minimum practical set)

For deploy service account:

- `roles/artifactregistry.writer`
- `roles/run.admin`
- `roles/cloudscheduler.admin`
- `roles/iam.serviceAccountUser` (on runtime service account used by Cloud Run Job)

For WIF principal binding on the deploy SA itself:

- `roles/iam.workloadIdentityUser`
- `roles/iam.serviceAccountTokenCreator`

For runtime service account (Cloud Run Job execution):

- `roles/secretmanager.secretAccessor` on required secrets

---

## 6) Best practices

- Prefer image tag = `git sha` for reproducibility.
- If Artifact Registry has immutable tags enabled, avoid reusing same fixed tags except `latest` if policy allows.
- Keep runtime credentials out of Docker image; inject via env/secrets at job runtime.
- Start with one task and one daily run, then scale later.

---

## 7) Operational checklist

- [ ] Image exists in Artifact Registry
- [ ] Cloud Run Job executes successfully manually
- [ ] Scheduler next run time looks correct
- [ ] GitHub workflow passes on push to `main`
- [ ] Logs in Cloud Logging show successful completion

