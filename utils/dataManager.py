from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)
except ImportError:
    pass

try:
    from pymongo.errors import PyMongoError
except ImportError:  # pragma: no cover - fallback when pymongo missing at import time
    PyMongoError = Exception  # type: ignore[misc,assignment]

JOB_DATA_COLLECTION = "jobData"
PAST_DATA_COLLECTION = "pastData"

_mongo_client: Any = None
_mongo_db: Any = None


def _getMongoDb():
    global _mongo_client, _mongo_db
    if _mongo_db is not None:
        return _mongo_db
    try:
        from pymongo import MongoClient
    except ImportError as exc:
        raise ImportError(
            "Install pymongo and dnspython: pip install 'pymongo>=4.6,<5' 'dnspython>=2.0.0,<3'"
        ) from exc

    uri = (os.getenv("MONGODB_URI") or os.getenv("MONGO_URI") or "").strip()
    if not uri:
        raise ValueError("Set MONGODB_URI in .env")
    db_name = (
        (os.getenv("MONGODB_DATABASE") or os.getenv("MONGODB_DB_NAME") or "").strip()
        or "saralJobViewer"
    )
    _mongo_client = MongoClient(uri)
    _mongo_db = _mongo_client[db_name]
    return _mongo_db


def getMongoDb():
    """Primary pymongo Database (same connection as all job/past helpers)."""
    return _getMongoDb()


def _projectRoot() -> Path:
    return Path(__file__).resolve().parent.parent


def _logsDirectory() -> Path:
    return _projectRoot() / "zata" / "logs"


def _utcNowIso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def appendScrapeLog(message: str, *, platform: str = "Unknown") -> Path:
    logsDir = _logsDirectory()
    logsDir.mkdir(parents=True, exist_ok=True)
    logPath = logsDir / f"scrape-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.log"
    line = f"[{_utcNowIso()}] [{platform}] {message}\n"
    with logPath.open("a", encoding="utf-8") as handle:
        handle.write(line)
    return logPath


def _mongoEnsureIndexes(recreate: bool) -> None:
    try:
        db = _getMongoDb()
        if recreate:
            names = set(db.list_collection_names())
            if JOB_DATA_COLLECTION in names:
                db[JOB_DATA_COLLECTION].drop()
            if PAST_DATA_COLLECTION in names:
                db[PAST_DATA_COLLECTION].drop()
        job_col = db[JOB_DATA_COLLECTION]
        past_col = db[PAST_DATA_COLLECTION]
        job_col.create_index("jobId", unique=True)
        past_col.create_index("jobId", unique=True)
        job_col.create_index("platform")
        past_col.create_index("platform")
    except PyMongoError as exc:
        appendScrapeLog(
            f"Mongo index ensure skipped due to transient error: {type(exc).__name__}: {exc}",
            platform="MongoDB",
        )


def createTables(*, recreate: bool = False) -> None:
    """Ensure MongoDB collections and indexes exist (no-op when already present)."""
    _mongoEnsureIndexes(recreate)


def _applyStatusParam(row: dict) -> str | None:
    """Unset / blank -> None; classifier or manual statuses stay as non-empty strings."""
    if "applyStatus" not in row:
        return None
    raw = row.get("applyStatus")
    if raw is None:
        return None
    s = str(raw).strip()
    return s or None


def _mongoDocToJobRow(doc: dict) -> dict:
    keys = (
        "jobId",
        "title",
        "jobUrl",
        "location",
        "employmentType",
        "workModel",
        "seniority",
        "experience",
        "originalJobPostUrl",
        "companyName",
        "jobDescription",
        "timestamp",
        "applyStatus",
        "platform",
    )
    out: dict[str, Any] = {}
    for k in keys:
        v = doc.get(k)
        if v is None:
            out[k] = None
        elif k == "applyStatus" and v == "":
            out[k] = ""
        else:
            out[k] = v if isinstance(v, str) else str(v)
    return out


def upsertJobs(rows: list[dict]) -> int:
    if not rows:
        return 0
    from pymongo import UpdateOne

    createTables(recreate=False)
    coll = _getMongoDb()[JOB_DATA_COLLECTION]
    ops: list[Any] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        jid = str(row.get("jobId") or "").strip()
        if not jid:
            continue
        apply_val = _applyStatusParam(row)
        set_doc: dict[str, Any] = {
            "jobId": jid,
            "title": str(row.get("title") or ""),
            "jobUrl": str(row.get("jobUrl") or ""),
            "location": str(row.get("location") or ""),
            "employmentType": str(row.get("employmentType") or ""),
            "workModel": str(row.get("workModel") or ""),
            "seniority": str(row.get("seniority") or ""),
            "experience": str(row.get("experience") or ""),
            "originalJobPostUrl": str(row.get("originalJobPostUrl") or ""),
            "companyName": str(row.get("companyName") or ""),
            "jobDescription": str(row.get("jobDescription") or ""),
            "timestamp": str(row.get("timestamp") or _utcNowIso()),
            "platform": str(row.get("platform") or "Unknown"),
        }
        if apply_val is not None:
            set_doc["applyStatus"] = apply_val
        ops.append(UpdateOne({"jobId": jid}, {"$set": set_doc}, upsert=True))
    if not ops:
        return 0
    try:
        coll.bulk_write(ops, ordered=False)
    except PyMongoError as exc:
        appendScrapeLog(
            f"Mongo upsert skipped (transient error): {type(exc).__name__}: {exc}",
            platform="MongoDB",
        )
        return 0
    return len(ops)


def loadJobsByPlatform(platform: str) -> list[dict]:
    createTables(recreate=False)
    cur = _getMongoDb()[JOB_DATA_COLLECTION].find({"platform": platform})
    return [_mongoDocToJobRow(d) for d in cur]


def loadAllJobs() -> list[dict]:
    """All rows in jobData, FIFO by timestamp (oldest first), then jobId."""
    createTables(recreate=False)
    cur = _getMongoDb()[JOB_DATA_COLLECTION].find({})
    jobs = [_mongoDocToJobRow(d) for d in cur]
    return sortJobsFifoByTimestamp(jobs)


def sortJobsFifoByTimestamp(jobs: list[dict]) -> list[dict]:
    def sortKey(row: dict) -> tuple[int, str, str]:
        ts = str(row.get("timestamp") or "").strip()
        return (1 if not ts else 0, ts, str(row.get("jobId") or ""))

    return sorted(jobs, key=sortKey)


def loadJobsWithEmptyApplyStatus(platform: str | None = None) -> list[dict]:
    """
    Jobs where applyStatus is null/missing only.
    Ordered FIFO: oldest timestamp first; rows with no timestamp sort last, then jobId.
    """
    createTables(recreate=False)
    query: dict[str, Any] = {"applyStatus": None}
    if platform:
        query["platform"] = platform
    cur = _getMongoDb()[JOB_DATA_COLLECTION].find(query)
    jobs = [_mongoDocToJobRow(d) for d in cur]
    return sortJobsFifoByTimestamp(jobs)


def updateApplyStatusByJobId(jobId: str, applyStatus: str) -> bool:
    jid = str(jobId or "").strip()
    status = str(applyStatus or "").strip()
    if not jid:
        return False
    createTables(recreate=False)
    res = _getMongoDb()[JOB_DATA_COLLECTION].update_one(
        {"jobId": jid}, {"$set": {"applyStatus": status}}
    )
    return res.matched_count > 0


def getApplyStatusUpperByJobId(jobId: str) -> str | None:
    """Return trimmed upper-case applyStatus for jobId, or None if missing/blank/job not found."""
    jid = str(jobId or "").strip()
    if not jid:
        return None
    createTables(recreate=False)
    doc = _getMongoDb()[JOB_DATA_COLLECTION].find_one({"jobId": jid}, {"applyStatus": 1})
    if not doc:
        return None
    raw = doc.get("applyStatus")
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None
    return str(raw).strip().upper()


def claimApplyingFromApply(jobId: str) -> tuple[str, str | None]:
    """
    Atomically set applyStatus from APPLY -> APPLYING.
    Returns (outcome, db_status_hint):
      claimed -> ("claimed", "APPLY") pre-image was APPLY
      not_found -> ("not_found", None)
      already_applied / already_applying / wrong_status -> second element is current status upper or None
    """
    jid = str(jobId or "").strip()
    if not jid:
        return "not_found", None
    createTables(recreate=False)
    col = _getMongoDb()[JOB_DATA_COLLECTION]
    before = col.find_one_and_update(
        {"jobId": jid, "applyStatus": "APPLY"},
        {"$set": {"applyStatus": "APPLYING"}},
    )
    if before is not None:
        return "claimed", "APPLY"
    row = col.find_one({"jobId": jid}, {"applyStatus": 1})
    if not row:
        return "not_found", None
    st = str(row.get("applyStatus") or "").strip().upper()
    if st == "APPLIED":
        return "already_applied", "APPLIED"
    if st == "APPLYING":
        return "already_applying", "APPLYING"
    return "wrong_status", st or None


def finalizeAppliedFromApplying(jobId: str) -> bool:
    jid = str(jobId or "").strip()
    if not jid:
        return False
    createTables(recreate=False)
    res = _getMongoDb()[JOB_DATA_COLLECTION].update_one(
        {"jobId": jid, "applyStatus": "APPLYING"},
        {"$set": {"applyStatus": "APPLIED"}},
    )
    return res.matched_count > 0


def revertApplyingToApply(jobId: str) -> bool:
    """After failed Midhtech submit: APPLYING -> APPLY so another attempt is possible."""
    jid = str(jobId or "").strip()
    if not jid:
        return False
    createTables(recreate=False)
    res = _getMongoDb()[JOB_DATA_COLLECTION].update_one(
        {"jobId": jid, "applyStatus": "APPLYING"},
        {"$set": {"applyStatus": "APPLY"}},
    )
    return res.matched_count > 0


def loadJobsByApplyStatus(applyStatus: str) -> list[dict]:
    status = str(applyStatus or "").strip()
    if not status:
        return []
    createTables(recreate=False)
    cur = _getMongoDb()[JOB_DATA_COLLECTION].find({"applyStatus": status})
    jobs = [_mongoDocToJobRow(d) for d in cur]
    return sortJobsFifoByTimestamp(jobs)


def jobDataApplyStatusSummary() -> dict[str, int]:
    createTables(recreate=False)
    db = _getMongoDb()
    job_col = db[JOB_DATA_COLLECTION]
    past_col = db[PAST_DATA_COLLECTION]
    total = job_col.count_documents({})
    past_n = past_col.count_documents({})

    def _trim_status(doc: dict) -> str:
        return str(doc.get("applyStatus") or "").strip()

    pending = 0
    n_apply = 0
    n_dna = 0
    n_ex = 0
    n_other = 0
    for doc in job_col.find({}):
        s = _trim_status(doc)
        if not s:
            pending += 1
        elif s == "APPLY":
            n_apply += 1
        elif s == "DO_NOT_APPLY":
            n_dna += 1
        elif s == "EXISTING":
            n_ex += 1
        else:
            n_other += 1

    return {
        "total": total,
        "nullPending": pending,
        "apply": n_apply,
        "doNotApply": n_dna,
        "existing": n_ex,
        "otherStatus": n_other,
        "pastDataRows": past_n,
    }


def deleteJobsByApplyStatusNotIn(allowedStatuses: list[str] | tuple[str, ...]) -> int:
    normalized = sorted(
        {str(item or "").strip() for item in allowedStatuses if str(item or "").strip()}
    )
    if not normalized:
        raise ValueError("allowedStatuses must include at least one non-empty status")

    createTables(recreate=False)
    coll = _getMongoDb()[JOB_DATA_COLLECTION]
    to_delete: list[str] = []
    for doc in coll.find(
        {"applyStatus": {"$exists": True, "$nin": [None, ""]}},
        {"jobId": 1, "applyStatus": 1},
    ):
        s = str(doc.get("applyStatus") or "").strip()
        if s and s not in normalized:
            jid = str(doc.get("jobId") or "").strip()
            if jid:
                to_delete.append(jid)
    if not to_delete:
        return 0
    res = coll.delete_many({"jobId": {"$in": to_delete}})
    return int(res.deleted_count or 0)


def _parseStoredTimestampToUtc(raw: object) -> datetime | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        if s.endswith("Z") or s.endswith("z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        pass
    try:
        if len(s) >= 10 and s[4] == "-" and s[7] == "-":
            return datetime.strptime(s[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    return None


def deletePastDataOlderThanHours(*, hours: float = 48) -> int:
    if hours <= 0:
        raise ValueError("hours must be positive")
    createTables(recreate=False)
    coll = _getMongoDb()[PAST_DATA_COLLECTION]
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    stale_ids: list[str] = []
    for doc in coll.find(
        {"timestamp": {"$exists": True, "$nin": [None, ""]}},
        {"jobId": 1, "timestamp": 1},
    ):
        jid = str(doc.get("jobId") or "").strip()
        parsed = _parseStoredTimestampToUtc(doc.get("timestamp"))
        if parsed is not None and parsed < cutoff and jid:
            stale_ids.append(jid)
    if not stale_ids:
        return 0
    res = coll.delete_many({"jobId": {"$in": stale_ids}})
    return int(res.deleted_count or 0)


def loadKnownJobIdsByPlatform(platform: str) -> set[str]:
    createTables(recreate=False)
    db = _getMongoDb()
    job_ids = {
        str(d["jobId"]).strip()
        for d in db[JOB_DATA_COLLECTION].find({"platform": platform}, {"jobId": 1})
        if d.get("jobId")
    }
    past_ids = {
        str(d["jobId"]).strip()
        for d in db[PAST_DATA_COLLECTION].find({"platform": platform}, {"jobId": 1})
        if d.get("jobId")
    }
    return job_ids | past_ids


def recordPastData(rows: list[dict], *, platform: str) -> int:
    if not rows:
        return 0
    from pymongo import UpdateOne

    createTables(recreate=False)
    coll = _getMongoDb()[PAST_DATA_COLLECTION]
    now = _utcNowIso()
    ops: list[Any] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        job_id = str(row.get("jobId") or "").strip()
        company_name = str(row.get("companyName") or "").strip() or "Unknown"
        if not job_id:
            continue
        ts = str(row.get("timestamp") or now).strip() or now
        doc = {
            "jobId": job_id,
            "platform": platform,
            "timestamp": ts,
            "companyName": company_name,
        }
        ops.append(
            UpdateOne(
                {"jobId": job_id},
                {"$set": doc},
                upsert=True,
            )
        )
    if not ops:
        return 0
    try:
        coll.bulk_write(ops, ordered=False)
    except PyMongoError as exc:
        appendScrapeLog(
            f"Mongo pastData upsert skipped (transient error): {type(exc).__name__}: {exc}",
            platform=platform,
        )
        return 0
    return len(ops)
