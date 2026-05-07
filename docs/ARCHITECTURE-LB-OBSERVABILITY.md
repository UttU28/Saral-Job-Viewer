# Architecture — Load Balancer + Logging + Monitoring

This document shows the target production architecture for Saral Job Viewer with:

- Global HTTPS Load Balancer
- Centralized logging
- Monitoring + alerting
- Existing Cloud Run services/jobs + Scheduler + Redis + MongoDB

---

## Updated architecture diagram

```mermaid
flowchart TB
  subgraph Users
    U[Browser / Admin]
  end

  subgraph DNS_TLS["DNS + TLS"]
    DNS[Cloud DNS]
    CERT[Managed SSL certs]
  end

  subgraph Edge["Edge"]
    LB[Global HTTPS Load Balancer]
    ARMOR[Cloud Armor\nWAF / Rate limits]
    CDN[Cloud CDN (optional for UI)]
  end

  subgraph Compute["Runtime on GCP"]
    FE[Cloud Run Service\nsaral-ui]
    API[Cloud Run Service\nsaral-api]
    JOB[Cloud Run Job\nsaral-dvalidate-job]
    SCH[Cloud Scheduler\nsaral-dvalidate-midnight-utc]
  end

  subgraph Data["Data Layer"]
    REDIS[(Memorystore Redis)]
    MONGO[(MongoDB Atlas)]
    SM[Secret Manager]
  end

  subgraph Obs["Observability"]
    LOG[Cloud Logging]
    MON[Cloud Monitoring]
    DASH[Dashboards]
    ALERT[Alert Policies\n(email/Slack/Pager)]
    UPTIME[Uptime Checks]
    ERR[Error Reporting (optional)]
  end

  U --> DNS
  DNS --> LB
  CERT --> LB
  ARMOR --> LB
  CDN --> FE
  LB --> FE
  LB --> API
  FE -->|HTTPS| API
  API --> REDIS
  API --> MONGO
  API --> JOB
  SCH --> JOB
  JOB --> MONGO
  API -. secrets .-> SM
  JOB -. secrets .-> SM

  FE --> LOG
  API --> LOG
  JOB --> LOG
  SCH --> LOG
  LOG --> MON
  MON --> DASH
  MON --> ALERT
  UPTIME --> MON
  LOG --> ERR
```

---

## What to add (implementation plan)

## 1) Load Balancer in front of Cloud Run

- Create serverless NEGs:
  - NEG for `saral-ui` (Cloud Run service)
  - NEG for `saral-api` (Cloud Run service)
- Create LB resources:
  - backend services
  - URL map (host/path routing)
  - HTTPS target proxy
  - forwarding rule (global IP)
- Attach Google-managed SSL cert(s).
- Point DNS records to LB public IP.
- Keep existing Cloud Run domain mappings until traffic is stable, then optionally remove.

Routing patterns:

- Option A (current host split):
  - `saral.thatinsaneguy.com` -> UI backend
  - `saralapi.thatinsaneguy.com` -> API backend
- Option B (single host):
  - `saral.thatinsaneguy.com/*` -> UI
  - `saral.thatinsaneguy.com/api/*` -> API

---

## 2) Logging baseline

- Ensure structured logs in API and job:
  - include `requestId`, `action`, `jobId`, `userId` (when available)
  - include severity (`INFO`, `WARNING`, `ERROR`)
- Enable/verify log sinks if exporting is needed (BigQuery or bucket optional).
- Add filters for quick troubleshooting:
  - API 5xx logs
  - Cloud Run job execution failures
  - Scheduler trigger failures

---

## 3) Monitoring + alerting

Create Cloud Monitoring alerts for:

- API availability:
  - high 5xx ratio
  - high p95 latency
- API capacity:
  - high instance CPU/memory (if using metrics from Cloud Run)
- Validation job reliability:
  - execution failure count > 0
  - no successful run in last 24h
- Scheduler reliability:
  - trigger attempt failures
- Redis health:
  - connection error spikes in API logs/metrics

Create uptime checks:

- `GET /api/health` on public API hostname
- Optional UI homepage check

Create a dashboard:

- request rate, p95 latency, 4xx/5xx
- latest job execution state + counts
- scheduler success/failure trend
- Redis/API error trend

---

## 4) Security and edge controls (recommended)

- Add Cloud Armor policy to LB:
  - basic OWASP managed protection
  - rate limiting for abusive IPs
  - geo/IP allow/deny if required
- Restrict CORS in API to known UI host(s) instead of `*` when ready.
- Keep all credentials in Secret Manager only.

---

## 5) CI/CD orchestration changes

You can keep current app deploy workflows and add one new infra workflow:

- New workflow purpose:
  - create/update LB
  - update URL map / cert / backend attachments
  - update Cloud Armor policy
  - (optional) setup dashboards/alerts via Terraform or gcloud commands

Suggested sequencing:

1. Deploy API/UI images
2. Run LB/infra workflow only when infra paths change
3. Use approval gate before production deploy

No separate diff script is strictly required if path-based workflow triggers are used.

---

## 6) “How to know it is working”

After rollout, verify in this order:

1. DNS resolves to LB IP.
2. HTTPS certificate status is `ACTIVE`.
3. UI and API routes return expected responses through LB.
4. `/api/health` uptime check is green.
5. Cloud Scheduler trigger still executes Cloud Run job successfully.
6. Dashboard shows fresh metrics and logs.
7. Alert test (forced test incident) notifies expected channel.

---

## 7) Next incremental tasks

- Add Terraform for LB + monitoring resources (repeatable infra).
- Add staging environment with same topology.
- Add canary rollout policy for API revisions.
- Add SLOs (availability + latency) and error budget view.

