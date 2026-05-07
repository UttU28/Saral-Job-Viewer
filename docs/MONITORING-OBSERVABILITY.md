# Monitoring & observability — goals, GCP services, and dashboards

This document describes **what we want to observe**, **which Google Cloud services cover it**, and **how they fit together** for Saral Job Viewer (Cloud Run, validation job, Scheduler, global HTTPS LB, Redis). It is a **planning / KT** guide: implementation can be done in the Console, Terraform, or gcloud; CI changes are optional.

**Related:** **`GCP-PLATFORM-KT.md`** (architecture & resource names), **`CICD-FULL-STACK.md`** (deploy workflows).

---

## 1. What we want to see

| Area | Questions we care about |
|------|-------------------------|
| **API (`saral-api`)** | Error rate, latency, request volume, instance count, cold starts, 5xx spikes |
| **UI (`saral-ui`)** | Same traffic health signals; nginx/access patterns via logs |
| **Load balancer** | Requests per backend, HTTPS proxy health, cert provisioning state, 4xx/5xx by URL map rule |
| **Validation job (`saral-dvalidate-job`)** | Executions started/succeeded/failed, duration, last run outcome |
| **Scheduler (`saral-dvalidate-midnight-utc`)** | Attempt results, missed schedules, auth failures calling Run Jobs API |
| **Redis (Memorystore)** | Memory pressure, connections, CPU/evictions if exposed |
| **End-to-end** | Synthetic checks: `GET /` on UI host, `GET /api/health` on API host through **public DNS** (LB) |

---

## 2. GCP services you need (core stack)

These are the **standard GCP-native** pieces. Everything listed below is **billing-eligible** under normal Cloud observability pricing (logs ingestion, metrics retention, uptime checks).

| GCP service | Role | Why we need it |
|-------------|------|----------------|
| **Cloud Monitoring** | Metrics, **dashboards**, **alerting policies**, **uptime checks**, SLOs | Single place for charts across Run, LB, Scheduler, Redis; alerts on thresholds |
| **Cloud Logging** | Centralized logs from Cloud Run, LB, Scheduler, Audit Logs | Search errors, correlate job failures with deploys; **log-based metrics** for custom counts |
| **Cloud Trace** *(recommended)* | Distributed traces for **FastAPI** requests | Find slow spans (MongoDB, Redis); optional OpenTelemetry export |
| **Error Reporting** *(optional)* | Groups exceptions from supported runtimes | Faster triage if enabled for Python stack traces |

You do **not** need a separate “dashboard product”: **Monitoring dashboards** are the primary UI for “see LB + jobs + services together.”

---

## 3. What is automatic vs what you configure

| Signal source | Automatic | You still configure |
|---------------|-----------|---------------------|
| **Cloud Run services** | Request/latency/instance metrics; stdout/stderr → Logging | Dashboard tiles; alerts on error ratio / latency; log exclusions if noisy |
| **Cloud Run job** | Execution metrics (e.g. completion/failure); execution logs | Alerts when failures exceed baseline; dashboard row for job |
| **External HTTPS LB** | Throughput, RTT, response codes (aggregated) | Tiles per backend service / NEG; cert expiry / provisioning alerts |
| **Cloud Scheduler** | Delivery attempt metrics; audit logs | Alert on repeated failures or job-not-found |
| **Memorystore Redis** | Instance metrics (memory, connections, etc.) | Threshold alerts |
| **MongoDB Atlas** | Not in GCP | Use Atlas UI/alerts for DB SLA (outside this repo’s GCP scope) |

---

## 4. Suggested “single project” dashboard layout

Create **one Cloud Monitoring dashboard** (or a small set: “Production overview” + “Validation”) with sections:

1. **SLO-style summary** — uptime check status (UI + API URLs), optional alert incident strip  
2. **Load balancer** — request rate, error rate, backend latency for **`sjv-ui-bes`** / **`sjv-api-bes`**  
3. **Cloud Run — API** — request count, `50x`, latency p95, active instances  
4. **Cloud Run — UI** — same  
5. **Cloud Run Job** — executions succeeded vs failed, execution duration for **`saral-dvalidate-job`**  
6. **Scheduler** — attempts / failures for **`saral-dvalidate-midnight-utc`**  
7. **Redis** — memory utilization, connections (if metrics available on tier)

Resource names match **`GCP-PLATFORM-KT.md`** / **`PROJECT-STATUS-CHECKLIST.md`**.

---

## 5. Alerting (minimal recommended set)

| Alert | Typical signal |
|-------|----------------|
| API/UI **error rate** | Cloud Run `50x` fraction or LB backend `5xx` rate |
| API/UI **latency** | p95 latency above budget |
| **Uptime check failed** | HTTPS GET to `/` and `/api/health` via public hostnames |
| **Validation job failures** | Job execution failure count in rolling window |
| **Scheduler failures** | Scheduler delivery / Cloud Logging filter for errors |
| **Redis memory** | Memorystore memory usage ratio |
| **LB certificate** | Managed cert not `ACTIVE` (via Logging alert or periodic check) |

Use **notification channels** (email, PagerDuty, Slack webhook via Cloud Monitoring integrations).

---

## 6. Logs: saved queries and log-based metrics

In **Logs Explorer**, save queries for:

- **API:** `resource.type="cloud_run_revision"` AND `resource.labels.service_name="saral-api"` AND severity≥ERROR  
- **Job:** filter by job name **`saral-dvalidate-job`** (Cloud Run Job resource type)  
- **Scheduler:** `resource.type="cloud_scheduler_job"` OR audit logs for failed HTTP targets  

Promote important patterns to **log-based metrics** + alerts (e.g. `"validation failed"` string counts).

---

## 7. IAM (who can view dashboards)

| Role | Use |
|------|-----|
| **`roles/monitoring.viewer`** | Read dashboards and metrics |
| **`roles/logging.viewer`** | Read logs |
| **`roles/cloudtrace.agent`** | Usually for workloads emitting traces; viewers use Trace UI with broader project viewer |

Grant viewers **at project level** or via a custom role for least privilege.

---

## 8. Optional additions

| Addition | When |
|----------|------|
| **Cloud Profiler** | CPU/memory hotspots in API after baseline tracing |
| **Budgets + billing alerts** | Cost guardrails (Logging ingest can grow with traffic) |
| **Log sinks → BigQuery** | Long retention / SQL analytics |
| **Third-party APM** (Datadog, Grafana Cloud, etc.) | Multi-cloud or advanced UX — extra cost and agents |

---

## 9. APIs to enable (if not already)

Ensure these are on in **`saraljobviewer`** (often already enabled with Run/LB):

- `monitoring.googleapis.com`  
- `logging.googleapis.com`  
- `cloudtrace.googleapis.com` *(if using Trace)*  

**`ensurePrereq.yml`** can be extended later to assert these APIs like other prerequisites.

---

## 10. Implementation order (practical)

1. Confirm **Logging** and **Monitoring** APIs; open **Observability → Dashboards** and pin **Cloud Run** recommended dashboards.  
2. Add **two uptime checks** (UI + API health) with alerting.  
3. Build the **custom dashboard** in §4 using metrics explorer filters for your service/job/LB names.  
4. Add **alert policies** from §5.  
5. *(Optional)* Instrument **Trace** in FastAPI / enable Error Reporting.

**Windows / optional manual `gcloud`:** **`MONITORING-WINDOWS-GCLOUD.md`**. **CI (authoritative):** **`.github/workflows/setupMonitoring.yml`** — embeds dashboard + alert YAML; run manually from Actions.

---

## 11. Keeping docs in sync

When dashboards, alert names, or observability scope change materially, edit **`.github/workflows/setupMonitoring.yml`** (embedded **`DASHBOARD_EOF`** / **`YAML_EOF`** blocks), then update **this file** and **`PROJECT-STATUS-CHECKLIST.md`** optional rows as needed.

---

*Last updated: 2026-05 — planning doc; does not replace GCP Console product naming if Google rebrands “Cloud Monitoring” UI sections.*
