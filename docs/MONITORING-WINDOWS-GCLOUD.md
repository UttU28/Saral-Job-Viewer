# Monitoring setup — Windows PowerShell & `gcloud` commands

Use this guide on **Windows** (PowerShell 5.1+). It matches **`deployment.yml`** defaults: project **`saraljobviewer`**, hosts **`saral.thatinsaneguy.com`** / **`saralapi.thatinsaneguy.com`**, backends **`sjv-ui-bes`** / **`sjv-api-bes`**, Redis **`saral-memorystore-redis`**, region **`us-east1`**.

**Primary path:** run **`.github/workflows/setupMonitoring.yml`** from GitHub Actions (**workflow_dispatch**). Dashboard JSON and alert policy YAML are **embedded in that workflow** — there is **no `infra/` folder** and **no `.github/monitoring/` folder** (nothing reads from there). Uses the same WIF secrets as **`deployment.yml`**; add repository secret **`MONITORING_ALERT_EMAIL`** unless you enable workflow input **`skipNotificationChannelAndAlerts`**.

**Manual `gcloud` on Windows:** sections §0–§6 are optional if you want to run the same pieces locally.

**Conceptual overview:** **`MONITORING-OBSERVABILITY.md`**.

---

## 0) Prerequisites

1. Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) for Windows.
2. Sign in and select the project:

```powershell
gcloud auth login
gcloud auth application-default login
$PROJECT_ID = "saraljobviewer"
$REGION     = "us-east1"
gcloud config set project $PROJECT_ID
```

Your user (or the SA you impersonate) needs permission to enable services and create Monitoring resources (e.g. **Editor** or dedicated Monitoring Admin roles on the project).

---

## 1) Enable observability APIs

```powershell
gcloud services enable monitoring.googleapis.com `
  logging.googleapis.com `
  cloudtrace.googleapis.com `
  clouderrorreporting.googleapis.com `
  --project $PROJECT_ID --quiet
```

Logging is usually already on; Trace / Error Reporting are optional but cheap to enable.

---

## 2) Email notification channel (for alerts)

Create **one** channel and capture its **full resource name** (`projects/.../notificationChannels/...`):

```powershell
gcloud beta monitoring channels create `
  --project $PROJECT_ID `
  --display-name "Saral Job Viewer alerts" `
  --type email `
  --channel-labels email_address="you@example.com"
```

List channels (copy `name` — you will pass it as `$CHANNEL`):

```powershell
gcloud beta monitoring channels list --project $PROJECT_ID --format="table(name,displayName,type)"
$CHANNEL = "projects/$PROJECT_ID/notificationChannels/PASTE_UUID_HERE"
```

---

## 3) Uptime checks (through your LB + public DNS)

GCP probes from multiple regions. Use **at least three** regions (required):

```powershell
$REGIONS = "usa-virginia,usa-oregon,usa-iowa"

gcloud monitoring uptime create "Saral UI LB health (HTTPS /)" `
  --project $PROJECT_ID `
  --resource-type uptime-url `
  --resource-labels "host=saral.thatinsaneguy.com,project_id=$PROJECT_ID" `
  --protocol https --path / --validate-ssl true `
  --regions $REGIONS --period 1

gcloud monitoring uptime create "Saral API LB health (HTTPS /api/health)" `
  --project $PROJECT_ID `
  --resource-type uptime-url `
  --resource-labels "host=saralapi.thatinsaneguy.com,project_id=$PROJECT_ID" `
  --protocol https --path /api/health --validate-ssl true `
  --regions $REGIONS --period 1
```

Verify:

```powershell
gcloud monitoring uptime list --project $PROJECT_ID --format="table(displayName,name)"
```

---

## 4) Dashboard (manual only — spec lives in `setupMonitoring.yml`)

The mosaic dashboard JSON is embedded in **`.github/workflows/setupMonitoring.yml`** (heredoc **`DASHBOARD_EOF`**). To create or validate from your machine, copy that JSON block into **`saral-dashboard.json`**, then:

```powershell
cd C:\Users\utsav\OneDrive\Desktop\Saral-Job-Viewer
gcloud monitoring dashboards create --validate-only `
  --project $PROJECT_ID `
  --config-from-file saral-dashboard.json

gcloud monitoring dashboards create --project $PROJECT_ID `
  --config-from-file saral-dashboard.json
```

Open dashboards:

```powershell
Start-Process "https://console.cloud.google.com/monitoring/dashboards?project=$PROJECT_ID"
```

---

## 5) Alert policies (manual — YAML embedded in `setupMonitoring.yml`)

Alert definitions are written by the workflow from heredocs (**`YAML_EOF`** blocks). For manual CLI setup, paste those YAML fragments into files under a temp folder and run:

```powershell
$ROOT = "$env:TEMP\saralMonitoringPolicies"
# Save uptimeUi.yaml, uptimeApi.yaml, api5xx.yaml, redisMemory.yaml from the workflow file

gcloud monitoring policies create --project $PROJECT_ID `
  --notification-channels $CHANNEL `
  --policy-from-file "$ROOT\uptimeUi.yaml"
# ... repeat for other policies (same displayNames as in the workflow).
```

List policies:

```powershell
gcloud monitoring policies list --project $PROJECT_ID --format="table(displayName,name,enabled)"
```

---

## 6) IAM for teammates (read-only)

```powershell
$MEMBER = "user:colleague@example.com"
gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member $MEMBER `
  --role roles/monitoring.viewer
gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member $MEMBER `
  --role roles/logging.viewer
```

---

## 7) GitHub Actions workflow IAM (`setupMonitoring.yml`)

The workflow **`.github/workflows/setupMonitoring.yml`** uses the same **`GCP_WORKLOAD_IDENTITY_PROVIDER`** and **`GCP_SERVICE_ACCOUNT`** secrets as **`deployment.yml`**. The **`ensureMonitoringStack`** step runs idempotent bash inline (APIs, uptime checks, dashboard JSON, optional email channel + alert policies).

### Repository secret (for alerting)

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|------|--------|
| **`MONITORING_ALERT_EMAIL`** | Email address that receives alert notifications (must match a verified identity acceptable to Cloud Monitoring email channels). |

Workflow input **`skipNotificationChannelAndAlerts`**: when **false**, **`MONITORING_ALERT_EMAIL`** must be set or the job fails. When **true**, only APIs + uptime checks + dashboard are ensured (no channel/policies).

### Grant the pipeline service account (run in Cloud Shell or PowerShell)

Replace **`PIPELINE_SA`** with the email of **`GCP_SERVICE_ACCOUNT`** (the deploy / WIF SA).

```powershell
$PROJECT_ID = "saraljobviewer"
$PIPELINE_SA = "YOUR_PIPELINE_SA@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:${PIPELINE_SA}" `
  --role="roles/monitoring.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:${PIPELINE_SA}" `
  --role="roles/serviceusage.serviceUsageAdmin"
```

**Why two roles:** **`monitoring.admin`** covers dashboards, uptime checks, notification channels, and alert policies. **`serviceusage.serviceUsageAdmin`** allows **`gcloud services enable`** for observability APIs (skip if your SA already has **`roles/editor`** / **`roles/owner`** on the project).

Run **`setupMonitoring.yml`** from the **Actions** tab → **Run workflow**.

---

## 8) Troubleshooting

| Issue | What to do |
|-------|------------|
| Dashboard tile empty for **Redis** | In Metrics Explorer, inspect labels on `redis.googleapis.com/stats/memory/usage_ratio` — `instance_id` may differ from short name; edit the dashboard JSON in **`setupMonitoring.yml`** (`DASHBOARD_EOF`) and re-run the workflow (delete old dashboard in Console first if needed). |
| Dashboard tile empty for **HTTPS LB** | Confirm backend service names (`sjv-api-bes`, `sjv-ui-bes`) and that traffic flows through the LB. Verify metric filter in Metrics Explorer for `loadbalancing.googleapis.com/https/request_count`. |
| Uptime alert never fires | Confirm uptime checks show green in **Monitoring → Uptime**; confirm alert filter `resource.labels.host` / `project_id` match §3. |
| `gcloud beta monitoring channels` missing | Install/update SDK; beta commands ship with current Cloud SDK. |

---

## 9) Source of truth

| Path | Purpose |
|------|---------|
| **`.github/workflows/setupMonitoring.yml`** | **Single source:** dashboard JSON, alert YAML heredocs, idempotent **`ensureMonitoringStack`** bash |

---

*Last updated: 2026-05 — monitoring definitions live only in **`setupMonitoring.yml`** (no `infra/`). Aligns with **`deployment.yml`** resource names.*
