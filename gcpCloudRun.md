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

Goal on push to `main`:

1. Build Docker image
2. Push to Artifact Registry (`:sha` and optionally `:latest`)
3. Update Cloud Run Job to new image
4. Ensure scheduler exists/updated

### 5.1 GitHub secrets

Add these repo secrets:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

Recommended `GCP_SERVICE_ACCOUNT` (example):
`github-actions-deployer@saraljobviewer.iam.gserviceaccount.com`

### 5.2 Required IAM roles for deploy service account

- `roles/artifactregistry.writer`
- `roles/run.admin`
- `roles/iam.serviceAccountUser`
- `roles/cloudscheduler.admin` (if workflow manages scheduler)
- `roles/secretmanager.secretAccessor` (if setting secret refs from workflow)

### 5.3 Workflow file

Create `.github/workflows/deploy-dvalidate-job.yml`:

```yaml
name: Build and Deploy dValidate Job

on:
  push:
    branches: ["main"]
  workflow_dispatch:

env:
  GCP_PROJECT_ID: saraljobviewer
  GCP_REGION: us-east1
  AR_REPOSITORY: saral-job-viewer-cr
  IMAGE_NAME: dvalidate
  RUN_JOB_NAME: saral-dvalidate-job
  SCHEDULER_JOB_NAME: saral-dvalidate-midnight-utc

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Setup gcloud
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker auth
        run: gcloud auth configure-docker ${{ env.GCP_REGION }}-docker.pkg.dev --quiet

      - name: Build and push image
        id: build
        run: |
          IMAGE_URI="${{ env.GCP_REGION }}-docker.pkg.dev/${{ env.GCP_PROJECT_ID }}/${{ env.AR_REPOSITORY }}/${{ env.IMAGE_NAME }}"
          IMAGE_TAG="${GITHUB_SHA}"
          FULL_IMAGE="${IMAGE_URI}:${IMAGE_TAG}"

          docker build -t "${FULL_IMAGE}" .
          docker push "${FULL_IMAGE}"

          docker tag "${FULL_IMAGE}" "${IMAGE_URI}:latest"
          docker push "${IMAGE_URI}:latest"

          echo "full_image=${FULL_IMAGE}" >> "$GITHUB_OUTPUT"

      - name: Ensure APIs are enabled
        run: |
          gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com

      - name: Create or update Cloud Run Job
        run: |
          set -e
          FULL_IMAGE="${{ steps.build.outputs.full_image }}"
          if gcloud run jobs describe "${{ env.RUN_JOB_NAME }}" --region "${{ env.GCP_REGION }}" >/dev/null 2>&1; then
            gcloud run jobs update "${{ env.RUN_JOB_NAME }}" \
              --region "${{ env.GCP_REGION }}" \
              --image "${FULL_IMAGE}" \
              --command python \
              --args dValidate.py,-1 \
              --task-timeout 3600s \
              --max-retries 1 \
              --set-env-vars MONGODB_DATABASE=saralJobViewer
          else
            gcloud run jobs create "${{ env.RUN_JOB_NAME }}" \
              --region "${{ env.GCP_REGION }}" \
              --image "${FULL_IMAGE}" \
              --command python \
              --args dValidate.py,-1 \
              --task-timeout 3600s \
              --max-retries 1 \
              --set-env-vars MONGODB_DATABASE=saralJobViewer
          fi

      - name: Ensure scheduler (00:00 UTC daily)
        run: |
          set -e
          JOB_URI="https://${{ env.GCP_REGION }}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${{ env.GCP_PROJECT_ID }}/jobs/${{ env.RUN_JOB_NAME }}:run"
          if gcloud scheduler jobs describe "${{ env.SCHEDULER_JOB_NAME }}" --location "${{ env.GCP_REGION }}" >/dev/null 2>&1; then
            gcloud scheduler jobs update http "${{ env.SCHEDULER_JOB_NAME }}" \
              --location "${{ env.GCP_REGION }}" \
              --schedule "0 0 * * *" \
              --time-zone "Etc/UTC" \
              --uri "${JOB_URI}" \
              --http-method POST \
              --oauth-service-account-email "${{ secrets.GCP_SERVICE_ACCOUNT }}"
          else
            gcloud scheduler jobs create http "${{ env.SCHEDULER_JOB_NAME }}" \
              --location "${{ env.GCP_REGION }}" \
              --schedule "0 0 * * *" \
              --time-zone "Etc/UTC" \
              --uri "${JOB_URI}" \
              --http-method POST \
              --oauth-service-account-email "${{ secrets.GCP_SERVICE_ACCOUNT }}"
          fi
```

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

