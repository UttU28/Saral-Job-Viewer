# Database schema — MongoDB collections, fields, indexes

This document is the **single source of truth** for the MongoDB layout used by Saral Job Viewer. It covers every collection, every field written by the codebase, all indexes (and the file that creates them), the `applyStatus` state machine, and the typical read paths used by the API and validation pipeline.

Companion docs: **`GCP-PLATFORM-KT.md`** (where Mongo lives in the architecture), **`CICD-FULL-STACK.md`** (how `MONGODB_URI` / `MONGODB_DATABASE` are injected at deploy time), **`PROJECT-STATUS-CHECKLIST.md`** (what is implemented).

---

## 1. Engine, database name, connection

| Item | Value |
|------|-------|
| Engine | **MongoDB** (Atlas in production; any 5.x+ compatible cluster locally). |
| Connection string | **`MONGODB_URI`** (env). Fallback alias **`MONGO_URI`**. Set via Secret Manager in production. |
| Database name | **`MONGODB_DATABASE`** (env). Fallback alias **`MONGODB_DB_NAME`**. Default: **`saralJobViewer`**. |
| Driver / client | **`pymongo>=4.6,<5`** (+ **`dnspython>=2.0,<3`** for `mongodb+srv://`). |
| Lazy connection | Single `MongoClient` per process, cached in `utils/dataManager.py::_getMongoDb`. All other modules pull the same handle via `getMongoDb()`. |

The default values come from `utils/dataManager.py`:

```40:48:utils/dataManager.py
    uri = (os.getenv("MONGODB_URI") or os.getenv("MONGO_URI") or "").strip()
    if not uri:
        raise ValueError("Set MONGODB_URI in .env")
    db_name = (
        (os.getenv("MONGODB_DATABASE") or os.getenv("MONGODB_DB_NAME") or "").strip()
        or "saralJobViewer"
    )
    _mongo_client = MongoClient(uri)
    _mongo_db = _mongo_client[db_name]
```

There is **no SQL/relational layer** in this project; MongoDB is the only database. There is no ORM — every read/write goes through `pymongo` calls inside `utils/`.

---

## 2. Collections at a glance

The database holds **five collections** (plus the implicit `_id` indexes):

| # | Collection | Purpose | Owner module | Document key (besides `_id`) |
|---|------------|---------|--------------|------------------------------|
| 1 | **`jobData`** | Primary live jobs scraped from JobRight / Glassdoor / ZipRecruiter; tracks application lifecycle via `applyStatus`. | `utils/dataManager.py`, `utils/jobViewerQueries.py`, `utils/jobDecisionService.py` | `jobId` (unique) |
| 2 | **`pastData`** | Historical jobId archive so scrapers can skip already-known list cards across runs. | `utils/dataManager.py` (`recordPastData`, `loadKnownJobIdsByPlatform`, `deletePastDataOlderThanHours`) | `jobId` (unique) |
| 3 | **`scraperSettings`** | Singleton config (currently the scraper search keywords list). | `utils/dataManager.py` (`load/saveScraperSearchKeywords`) | `_id` = `"searchKeywords"` |
| 4 | **`users`** | User accounts for the SPA (login, admin flag, avatar). Passwords stored plain today — see "Known issues" below. | `utils/authService.py` | `userId` (also unique `email`) |
| 5 | **`userWeeklyStats`** | Per-user, per–ISO-week accepted / rejected decision counters with an `events[]` audit trail. | `utils/userWeeklyStats.py` | `(userId, weekKey)` (unique compound) |

Collection names and the constants used by the code:

```20:23:utils/dataManager.py
JOB_DATA_COLLECTION = "jobData"
PAST_DATA_COLLECTION = "pastData"
SCRAPER_SETTINGS_COLLECTION = "scraperSettings"
SCRAPER_KEYWORDS_DOCUMENT_ID = "searchKeywords"
```

```13:13:utils/authService.py
USER_COLLECTION = "users"
```

```8:8:utils/userWeeklyStats.py
USER_WEEKLY_STATS_COLLECTION = "userWeeklyStats"
```

## 3. `jobData` — primary jobs collection

Holds one document per uniquely-identified job (jobId is the natural key — also used in URLs / by the validation flow). Inserted/updated by the scrapers via `upsertJobs`, then later mutated by the validation pipeline and the SPA accept/reject UI.

### 3.1 Field reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `_id` | `ObjectId` | yes | Mongo default. Not exposed by the API (`{_id: 0}` projection). |
| **`jobId`** | `string` | yes | **Primary identifier**, unique. JobRight: 24-char hex (the route id from the listing URL). Glassdoor: numeric / "gd-" prefixed id from listing element. ZipRecruiter: site-encoded `lvk`. Always trimmed. |
| `title` | `string` | yes | Job title; coerced to `""` if missing. |
| `jobUrl` | `string` | yes | Direct link to the job posting on the source platform. |
| `location` | `string` | yes | Free-form text from the source listing (e.g. `Remote`, `New York, NY`). |
| `employmentType` | `string` | yes | Free-form (`Full-time`, `Contract`, …). |
| `workModel` | `string` | yes | `Remote` / `Hybrid` / `On-site` / source-specific text. |
| `seniority` | `string` | yes | `Entry` / `Mid` / `Senior` / source text. |
| `experience` | `string` | yes | Years/range text, source-dependent. |
| `originalJobPostUrl` | `string` | yes | Outbound apply / source URL when known (e.g. employer ATS). Empty when only the platform listing is available. |
| `companyName` | `string` | yes | Company display name; coerced to `""` if missing. |
| `jobDescription` | `string` | yes | Full description text; can be very large. The list endpoint **never** returns the full string — only `descriptionPreview` (first 280 chars) plus `hasLongDescription`. |
| `timestamp` | `string` | yes | ISO-8601 UTC string (`YYYY-MM-DDTHH:MM:SSZ`) recorded at scrape time. Used for FIFO sort. |
| `platform` | `string` | yes | One of `JobRight`, `Glassdoor`, `ZipRecruiter`, `Midhtech`, or `Unknown`. |
| `applyStatus` | `string` &#124; `null` &#124; absent | no | Decision-pipeline state — see §3.3. |

Field list comes from `_mongoDocToJobRow` and `upsertJobs`:

### 3.2 `applyStatus` state machine

`applyStatus` is the heart of the apply pipeline. **Absent / `null` / `""` all mean "pending — validation has not classified this job yet".**

| Value | Meaning | Set by | Visible in viewer? |
|-------|---------|--------|---------------------|
| *(missing / null / empty)* | Pending — newly scraped, awaiting validation. | Scrapers (default). | Yes (when filter is `pending`). |
| `APPLY` | Validation classifier said "apply" — this job should be pushed to Midhtech. | `validation.py` (`-1` mode). | Yes (default list). |
| `APPLYING` | A user pressed Accept; an atomic claim transition from `APPLY → APPLYING` is in flight to Midhtech. | `claimApplyingFromApply` in `utils/dataManager.py`. | **Hidden** — see §3.4. |
| `APPLIED` | Midhtech submission succeeded. Terminal success state. | `finalizeAppliedFromApplying`. | Yes (under "applied" filter; merged with `EXISTING`). |
| `EXISTING` | Validation found the job already exists at Midhtech (no submit needed). Treated as `APPLIED` for filtering. | `validation.py`. | Yes (under "applied" filter). |
| `DO_NOT_APPLY` | Classifier ruled out the job (e.g. requires clearance, staffing agency, US citizen only). | `validation.py`. | **Hidden** by default. |
| `REJECTED` | User pressed Reject in the UI. | `executeJobUiDecision` in `utils/jobDecisionService.py`. | Yes (under "rejected" filter). |
| `REDO` | Recoverable error during validation/submission; pipeline will reprocess. | `validation.py`. | **Hidden** — see §3.4. |
| *anything else* | Custom/manual statuses, counted under "otherStatus" in the admin summary. | Admin tooling. | Filter-dependent. |

Allowed transitions (only the ones the code actually performs):

```
absent/null/""
   │
   │  validation.py classifier
   ▼
 APPLY ──── user presses Accept ─── claimApplyingFromApply (atomic) ───► APPLYING
   ▲                                                                    │
   │                                                                    │ Midhtech success
   │                                                                    ▼
   │                                                                  APPLIED
   │                                                                    ▲
   │                                       validation.py "exists"  ─────┤
   │                                                                  EXISTING
   │
   │ Midhtech failure: revertApplyingToApply
   └────────────────────────────────────────────────────────────────────┘

absent/null/""  ── validation classifier ──► DO_NOT_APPLY
absent/null/""  ── validation classifier ──► REDO  (reprocess)

(any non-APPLIED, non-APPLYING)  ── user presses Reject ──► REJECTED
```

The atomic `APPLY → APPLYING` claim is what prevents two browser tabs from double-submitting the same job:

```302:329:utils/dataManager.py
def claimApplyingFromApply(jobId: str) -> tuple[str, str | None]:
    """
    Atomically set applyStatus from APPLY -> APPLYING.
    """
```

---

## 4. `pastData` — scraper deduplication archive

Lightweight archive of every `jobId` the scrapers have ever seen, keyed by platform. Each scraper consults `loadKnownJobIdsByPlatform(platform)` to skip listing cards already represented in `jobData ∪ pastData`, so you don't re-scrape the same posting on every run.

### 4.1 Field reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `_id` | `ObjectId` | yes | Mongo default. |
| **`jobId`** | `string` | yes | Unique. Same value as `jobData.jobId`. |
| `platform` | `string` | yes | One of `JobRight`, `Glassdoor`, `ZipRecruiter`. |
| `timestamp` | `string` | yes | ISO-8601 UTC string. Either the scraper's original timestamp or `recordPastData`'s "now". Used by the 48-hour cleanup. |
| `companyName` | `string` | yes | Defaults to `"Unknown"` when missing. Kept so admins can eyeball recently-seen entries. |

### 4.2 Cleanup policy

`deletePastDataOlderThanHours(hours=48)` removes entries whose `timestamp` parses to more than 48 hours in the past. Anything malformed/unparseable stays. This is what prevents the archive from growing forever while still de-duping recent runs.

---

## 5. `scraperSettings` — singleton config

Currently holds a single document — the scraper search-keyword list — that the SPA admin page edits and the scrapers read at start-up. Modeled as a singleton via `_id`.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| **`_id`** | `string` | yes | Always the literal `"searchKeywords"` (constant `SCRAPER_KEYWORDS_DOCUMENT_ID`). |
| `keywords` | `string[]` | yes | Trimmed, case-fold-deduped list of search terms. First entry is the "primary" used for default search params. |
| `updatedAt` | `string` | yes | ISO-8601 UTC string set on every save. |

The list is reshaped (trimmed, deduped) on save:

Adding new singleton settings? Use a different `_id` (e.g. `"scrapingSchedule"`) in the same collection rather than introducing a new collection.

---

## 6. `users` — accounts

User accounts for the SPA. Created at registration, mutated by profile updates and admin actions.

### 6.1 Field reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `_id` | `ObjectId` | yes | Mongo default. Not exposed by API. |
| **`userId`** | `string` | yes | Stable identifier (`f"user_{email}"`). Used as JWT `sub` and as the foreign key in `userWeeklyStats`. |
| **`email`** | `string` | yes | Unique. Lower-cased + trimmed (`_normalizeEmail`). |
| `name` | `string` | yes | Display name (trimmed). |
| `password` | `string` | yes | **Stored plain-text today.** See "Known issues" below. |
| `isAdmin` | `boolean` | yes | Backfilled to `false` for legacy rows. Admin-only routes call `requireAdminUser`. |
| `profilePhotoUrl` | `string` | yes | Generated DiceBear URL keyed off `userId`/`email`. Backfilled on the fly when missing. |
| `createdAt` | `string` | yes | ISO-8601 UTC. |
| `updatedAt` | `string` | yes | ISO-8601 UTC; bumped on `setUserAdminStatus`, `updateUserName`, `changeUserPassword`. |

---

## 7. `userWeeklyStats` — per-week decision counters

One document per `(userId, weekKey)` recording how many jobs the user accepted vs rejected in a given ISO week, plus an `events[]` audit trail.

### 7.1 Field reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `_id` | `ObjectId` | yes | Mongo default. |
| **`userId`** | `string` | yes | Foreign key into `users.userId`. |
| **`weekKey`** | `string` | yes | Format `"YYYY-Www"` (ISO week, zero-padded), e.g. `"2026-W19"`. |
| `weekStartIso` | `string` | yes | ISO date (`YYYY-MM-DD`) of the Monday that starts the week. |
| `weekEndIso` | `string` | yes | ISO date of the Sunday that ends the week. |
| `acceptedCount` | `number (int)` | yes | `$inc`-incremented on each accept. |
| `rejectedCount` | `number (int)` | yes | `$inc`-incremented on each reject; can be `$inc -1` when an undo flips reject → apply. |
| `totalCount` | `number (int)` | yes | Sum of accepted + rejected (also kept consistent on undo). |
| `events[]` | `array<object>` | yes | Append-only audit trail. See below. |
| `createdAt` | `string` | yes | ISO-8601 UTC; set on first event of the week (via `$setOnInsert`). |
| `updatedAt` | `string` | yes | ISO-8601 UTC; set on every update. |

`events[]` element shape:


| Sub-field | Type | Notes |
|-----------|------|-------|
| `eventType` | `string` | One of `"accepted"`, `"rejected"`, `"rejectedToApply"` (undo). |
| `jobId` | `string \| null` | Optional reference to `jobData.jobId`. |
| `delta` | `int` | `+1` for accept/reject, `-1` for undo. |
| `timestampIso` | `string` | ISO-8601 UTC. |

### 7.2 Update pattern (concurrency-safe)

Counters are updated with a single atomic `update_one(..., upsert=True)` that combines `$setOnInsert`, `$set`, `$inc`, and `$push`. The week document is **created on demand** the first time a user makes a decision in a new ISO week. Care is taken to avoid putting any field in both `$setOnInsert` and `$inc`/`$push` (Mongo path conflict `error 40`).

### 7.3 Why ISO week?

Monday-anchored ISO weeks are computed from `datetime.now(UTC)` so every server runs the same week boundary regardless of timezone. The admin dashboard's "currentWeekStreak" and "currentWeekRejects" come from `fetchCurrentWeekAcceptedCountsByUsers` / `…RejectedCountsByUsers` keyed by today's `weekKey`.

---

*Last updated: keep in sync with `utils/dataManager.py`, `utils/authService.py`, `utils/userWeeklyStats.py`, `utils/jobViewerQueries.py`, `utils/jobDecisionService.py`. When any of those files add/remove a Mongo field or index, update the matching section here.*
