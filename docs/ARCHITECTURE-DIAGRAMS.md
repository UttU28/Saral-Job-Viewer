# Architecture diagrams

Resource names, secrets, and workflow matrix: [`GCP-PLATFORM-KT.md`](./GCP-PLATFORM-KT.md).

---

## 1. Big picture — on-prem scrapers, cloud, data, scheduler, GitHub Actions

Not a deep dive: **where** things run, **what** talks to MongoDB, **Artifact Registry** as the image store between CI and Cloud Run, and **who triggers** deploys vs nightly validation.

```mermaid
flowchart TB
  subgraph On_prem["On-prem or your machine"]
    SCR[Python scrapers<br/>write scraped jobs]
  end
  subgraph People
    U[Browser users]
  end
  subgraph GCP["GCP · containers and automation"]
    GH[GitHub Actions<br/>CI/CD]
    AR[(Artifact Registry<br/>Docker images)]
    LB[HTTPS load balancer<br/>optional in prod]
    UI[Frontend container<br/>Cloud Run UI]
    API[Backend API container<br/>Cloud Run]
    REDIS[(Redis Memorystore)]
    SCH[Cloud Scheduler]
    JOB[Validation container job]
  end
  subgraph Data["Managed database"]
    DB[(MongoDB Atlas)]
  end
  SCR -->|persist rows| DB
  U --> LB
  LB --> UI
  LB --> API
  UI -.->|SPA calls API| API
  API --> REDIS
  API --> DB
  SCH -->|cron starts run| JOB
  JOB --> DB
  GH -->|build push| AR
  GH -->|deploy configure| UI
  GH --> API
  GH --> JOB
  AR -.->|image for service| UI
  AR -.->|image for service| API
  AR -.->|image for job| JOB
  GH -.->|workflow ensures schedule| SCH
```

---

## 2. Connectivity — load balancer, API, Redis, and database

```mermaid
flowchart TB
  subgraph Internet
    U[Users / browsers]
  end
  subgraph GCP["GCP project (e.g. us-east1 + global LB)"]
    LB[Global HTTPS LB<br/>host routing]
    UI[Cloud Run saral-ui]
    API[Cloud Run saral-api]
    VPC[VPC Serverless connector]
    REDIS[(Memorystore Redis<br/>private IP)]
  end
  subgraph External
    ATLAS[(MongoDB Atlas)]
  end
  U -->|HTTPS UI host| LB
  LB --> UI
  U -->|HTTPS API host<br/>includes SPA XHR from VITE_API_URL| LB
  LB --> API
  API -->|private ranges<br/>via connector| VPC
  VPC --> REDIS
  API -->|TLS, MONGODB_URI| ATLAS
```

---

## 3. Scraper ingress vs API / UI egress

**Writers:** Python scrapers use **`utils/dataManager.py`** and land rows in **MongoDB** (same Atlas cluster the API uses). **Readers:** the SPA loads jobs through the **API** (Redis-backed where enabled), not by talking to Mongo directly.

```mermaid
flowchart TB
  subgraph Write_path["Write path (batch / manual)"]
    S1[aJobRight.py]
    S2[bGlassDoor.py]
    S3[cZipRecruiter.py]
    DM[dataManager.py]
  end
  subgraph Store
    DB[(MongoDB Atlas)]
  end
  subgraph Read_path["Read path (interactive)"]
    UI[Vite SPA]
    LB[HTTPS LB optional]
    API[FastAPI saral-api]
    REDIS[(Redis)]
  end
  S1 --> DM
  S2 --> DM
  S3 --> DM
  DM -->|persist| DB
  UI --> LB
  LB --> API
  UI -. direct API URL .-> API
  API --> REDIS
  API --> DB
```

---

## 4. Deploy — `Main Deploy` workflow (approval, push, LB)

Source of truth: **`.github/workflows/deployment.yml`**. No CI/CodeQL gate — deploy runs after **`detectChanges`** and **`production-approval`**. Secrets, IAM, and command-level detail: [`CICD-FULL-STACK.md`](./CICD-FULL-STACK.md). **Workload Identity Federation** + **`google-github-actions/auth`** mint short-lived GCP credentials for the **pipeline** service account (no JSON key in the repo).

```mermaid
flowchart TB
  T[Trigger: push to main or workflow_dispatch]
  DC[detectChanges<br/>paths-filter outputs + optional WIF gcloud<br/>probe global HTTPS LB + Cloud Run]
  AP[GitHub Environment<br/>production-approval human gate]
  subgraph P4["Conditional CD · WIF + Docker + gcloud"]
    DAPI[deployApi<br/>build push image deploy saral-api<br/>set-secrets from Secret Manager]
    DFE[deployFrontend<br/>read VITE_API_URL secret build push<br/>deploy saral-ui]
    DVAL[deployValidation<br/>build push update saral-dvalidate-job]
  end
  ELB[ensureGlobalLoadBalancer<br/>runs only if UI or API path deployed<br/>AND LB probe marked missing]
  AR[(Artifact Registry)]
  RUN[Cloud Run revisions<br/>UI API validation job]
  T --> DC
  DC --> AP
  AP --> DAPI
  AP --> DFE
  AP --> DVAL
  DAPI --> AR
  DFE --> AR
  DVAL --> AR
  DAPI --> RUN
  DFE --> RUN
  DVAL --> RUN
  DAPI --> ELB
  DFE --> ELB
  ELB -->|Compute NEGs backends URL map<br/>managed cert forwarding rules| RUN
```

**Edges in words:** **`detectChanges`** waits for **CI** and **CodeQL** to finish with compatible results (see workflow `if:`), then sets which of **`deployApi`** / **`deployFrontend`** / **`deployValidation`** run. Each deploy job **authenticates with WIF**, pushes to **Artifact Registry**, and **`gcloud run deploy`** (or job update). **`ensureGlobalLoadBalancer`** is a separate job that runs **after** API and UI deploy jobs succeed or skip, **only** when change detection said the LB stack was missing or incomplete.
