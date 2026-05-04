from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)
except ImportError:
    pass

DB_FILE_NAME = "saralJobViewer.db"

JOB_DATA_COLLECTION = "jobData"
PAST_DATA_COLLECTION = "pastData"

_mongo_client: Any = None
_mongo_db: Any = None


def _databaseKind() -> str:
    raw = (os.getenv("DATABASE") or "sqlite").strip().lower()
    if raw in ("mongo", "mongodb"):
        return "mongo"
    return "sqlite"


def _getMongoDb():
    global _mongo_client, _mongo_db
    if _mongo_db is not None:
        return _mongo_db
    try:
        from pymongo import MongoClient
    except ImportError as exc:
        raise ImportError(
            "Install pymongo and dnspython when using DATABASE=mongo: "
            'pip install "pymongo>=4.6,<5" "dnspython>=2.0.0,<3"'
        ) from exc

    uri = (os.getenv("MONGODB_URI") or os.getenv("MONGO_URI") or "").strip()
    if not uri:
        raise ValueError("Set MONGODB_URI in .env when DATABASE=mongo")
    db_name = (
        (os.getenv("MONGODB_DATABASE") or os.getenv("MONGODB_DB_NAME") or "").strip()
        or "saralJobViewer"
    )
    _mongo_client = MongoClient(uri)
    _mongo_db = _mongo_client[db_name]
    return _mongo_db


def _projectRoot() -> Path:
    return Path(__file__).resolve().parent.parent


def getDatabasePath() -> Path:
    """SQLite file path under zata/. Used when DATABASE=sqlite (and by sqlite-only tools)."""
    return _projectRoot() / "zata" / DB_FILE_NAME


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


def createTables(*, recreate: bool = False) -> Path | None:
    """
    SQLite: create zata/saralJobViewer.db tables. Returns path to the DB file.
    MongoDB: ensure collections and indexes. Returns None.
    """
    if _databaseKind() == "mongo":
        _mongoEnsureIndexes(recreate)
        return None

    dbPath = getDatabasePath()
    dbPath.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(dbPath) as connection:
        cursor = connection.cursor()
        if recreate:
            cursor.execute("DROP TABLE IF EXISTS jobData")
            cursor.execute("DROP TABLE IF EXISTS pastData")

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS jobData (
                jobId VARCHAR(64) PRIMARY KEY NOT NULL,
                title VARCHAR(255),
                jobUrl TEXT NOT NULL,
                location VARCHAR(128),
                employmentType VARCHAR(32),
                workModel VARCHAR(32),
                seniority VARCHAR(64),
                experience VARCHAR(32),
                originalJobPostUrl TEXT NOT NULL,
                companyName VARCHAR(255) NOT NULL,
                jobDescription TEXT NOT NULL,
                timestamp VARCHAR(32),
                applyStatus VARCHAR(32),
                platform VARCHAR(32) NOT NULL
            )
            """
        )
        columns = cursor.execute("PRAGMA table_info(jobData)").fetchall()
        columnNames = {str(col[1]) for col in columns if len(col) > 1}
        if "title" not in columnNames:
            cursor.execute("ALTER TABLE jobData ADD COLUMN title VARCHAR(255)")

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS pastData (
                jobId VARCHAR(64) PRIMARY KEY NOT NULL,
                platform VARCHAR(32) NOT NULL,
                timestamp VARCHAR(32),
                companyName VARCHAR(255) NOT NULL
            )
            """
        )

        connection.commit()

    return dbPath


def _applyStatusSqlParam(row: dict) -> str | None:
    """Unset / blank -> None; classifier or manual statuses stay as non-empty strings."""
    if "applyStatus" not in row:
        return None
    raw = row.get("applyStatus")
    if raw is None:
        return None
    s = str(raw).strip()
    return s or None


def _mongoDocToJobRow(doc: dict) -> dict:
    """Normalize Mongo document keys/types to match sqlite Row dicts."""
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
    if _databaseKind() == "mongo":
        return _mongoUpsertJobs(rows)
    return _sqliteUpsertJobs(rows)


def _sqliteUpsertJobs(rows: list[dict]) -> int:
    dbPath = createTables(recreate=False)
    assert dbPath is not None
    values: list[tuple] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        values.append(
            (
                str(row.get("jobId") or ""),
                str(row.get("title") or ""),
                str(row.get("jobUrl") or ""),
                str(row.get("location") or ""),
                str(row.get("employmentType") or ""),
                str(row.get("workModel") or ""),
                str(row.get("seniority") or ""),
                str(row.get("experience") or ""),
                str(row.get("originalJobPostUrl") or ""),
                str(row.get("companyName") or ""),
                str(row.get("jobDescription") or ""),
                str(row.get("timestamp") or _utcNowIso()),
                _applyStatusSqlParam(row),
                str(row.get("platform") or "Unknown"),
            )
        )

    with sqlite3.connect(dbPath) as connection:
        cursor = connection.cursor()
        cursor.executemany(
            """
            INSERT INTO jobData (
                jobId, title, jobUrl, location, employmentType, workModel, seniority, experience,
                originalJobPostUrl, companyName, jobDescription, timestamp, applyStatus, platform
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(jobId) DO UPDATE SET
                title = excluded.title,
                jobUrl = excluded.jobUrl,
                location = excluded.location,
                employmentType = excluded.employmentType,
                workModel = excluded.workModel,
                seniority = excluded.seniority,
                experience = excluded.experience,
                originalJobPostUrl = excluded.originalJobPostUrl,
                companyName = excluded.companyName,
                jobDescription = excluded.jobDescription,
                timestamp = excluded.timestamp,
                applyStatus = COALESCE(excluded.applyStatus, jobData.applyStatus),
                platform = excluded.platform
            """,
            values,
        )
        connection.commit()
    return len(values)


def _mongoUpsertJobs(rows: list[dict]) -> int:
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
        apply_val = _applyStatusSqlParam(row)
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
    coll.bulk_write(ops, ordered=False)
    return len(ops)


def loadJobsByPlatform(platform: str) -> list[dict]:
    if _databaseKind() == "mongo":
        createTables(recreate=False)
        cur = _getMongoDb()[JOB_DATA_COLLECTION].find({"platform": platform})
        return [_mongoDocToJobRow(d) for d in cur]

    dbPath = createTables(recreate=False)
    assert dbPath is not None
    with sqlite3.connect(dbPath) as connection:
        connection.row_factory = sqlite3.Row
        cursor = connection.cursor()
        rows = cursor.execute(
            """
            SELECT
                jobId, title, jobUrl, location, employmentType, workModel, seniority, experience,
                originalJobPostUrl, companyName, jobDescription, timestamp, applyStatus, platform
            FROM jobData
            WHERE platform = ?
            """,
            (platform,),
        ).fetchall()
    return [dict(r) for r in rows]


def loadAllJobs() -> list[dict]:
    """All rows in jobData, FIFO by timestamp (oldest first), then jobId."""
    if _databaseKind() == "mongo":
        createTables(recreate=False)
        cur = _getMongoDb()[JOB_DATA_COLLECTION].find({})
        jobs = [_mongoDocToJobRow(d) for d in cur]
        return sortJobsFifoByTimestamp(jobs)

    dbPath = createTables(recreate=False)
    assert dbPath is not None
    with sqlite3.connect(dbPath) as connection:
        connection.row_factory = sqlite3.Row
        cursor = connection.cursor()
        rows = cursor.execute(
            """
            SELECT
                jobId, title, jobUrl, location, employmentType, workModel, seniority, experience,
                originalJobPostUrl, companyName, jobDescription, timestamp, applyStatus, platform
            FROM jobData
            ORDER BY
                CASE WHEN timestamp IS NULL OR TRIM(COALESCE(timestamp, '')) = '' THEN 1 ELSE 0 END,
                timestamp ASC,
                jobId
            """
        ).fetchall()
    return [dict(r) for r in rows]


def sortJobsFifoByTimestamp(jobs: list[dict]) -> list[dict]:
    """Oldest timestamp first; jobs with no timestamp last; tie-break jobId."""

    def sortKey(row: dict) -> tuple[int, str, str]:
        ts = str(row.get("timestamp") or "").strip()
        return (1 if not ts else 0, ts, str(row.get("jobId") or ""))

    return sorted(jobs, key=sortKey)


def loadJobsWithEmptyApplyStatus(platform: str | None = None) -> list[dict]:
    """
    Jobs where applyStatus is NULL only (SQLite parity).
    Ordered FIFO: oldest timestamp first; rows with no timestamp sort last, then jobId.
    """
    if _databaseKind() == "mongo":
        createTables(recreate=False)
        query: dict[str, Any] = {"applyStatus": None}
        if platform:
            query["platform"] = platform
        cur = _getMongoDb()[JOB_DATA_COLLECTION].find(query)
        jobs = [_mongoDocToJobRow(d) for d in cur]
        return sortJobsFifoByTimestamp(jobs)

    dbPath = createTables(recreate=False)
    assert dbPath is not None
    sql = """
        SELECT
            jobId, title, jobUrl, location, employmentType, workModel, seniority, experience,
            originalJobPostUrl, companyName, jobDescription, timestamp, applyStatus, platform
        FROM jobData
        WHERE applyStatus IS NULL
    """
    params: tuple[str, ...] = ()
    if platform:
        sql += " AND platform = ?"
        params = (platform,)
    sql += """
        ORDER BY
            CASE WHEN timestamp IS NULL OR TRIM(COALESCE(timestamp, '')) = '' THEN 1 ELSE 0 END,
            timestamp ASC,
            jobId
    """
    with sqlite3.connect(dbPath) as connection:
        connection.row_factory = sqlite3.Row
        cursor = connection.cursor()
        rows = cursor.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def updateApplyStatusByJobId(jobId: str, applyStatus: str) -> bool:
    """Set applyStatus for one row. Returns True if a row was updated."""
    jid = str(jobId or "").strip()
    status = str(applyStatus or "").strip()
    if not jid:
        return False
    if _databaseKind() == "mongo":
        createTables(recreate=False)
        res = _getMongoDb()[JOB_DATA_COLLECTION].update_one(
            {"jobId": jid}, {"$set": {"applyStatus": status}}
        )
        return res.matched_count > 0

    dbPath = createTables(recreate=False)
    assert dbPath is not None
    with sqlite3.connect(dbPath) as connection:
        cursor = connection.cursor()
        cursor.execute(
            "UPDATE jobData SET applyStatus = ? WHERE jobId = ?",
            (status, jid),
        )
        connection.commit()
        return cursor.rowcount > 0


def loadJobsByApplyStatus(applyStatus: str) -> list[dict]:
    """Return jobs whose applyStatus matches exactly."""
    status = str(applyStatus or "").strip()
    if not status:
        return []
    if _databaseKind() == "mongo":
        createTables(recreate=False)
        cur = _getMongoDb()[JOB_DATA_COLLECTION].find({"applyStatus": status})
        jobs = [_mongoDocToJobRow(d) for d in cur]
        return sortJobsFifoByTimestamp(jobs)

    dbPath = createTables(recreate=False)
    assert dbPath is not None
    with sqlite3.connect(dbPath) as connection:
        connection.row_factory = sqlite3.Row
        cursor = connection.cursor()
        rows = cursor.execute(
            """
            SELECT
                jobId, title, jobUrl, location, employmentType, workModel, seniority, experience,
                originalJobPostUrl, companyName, jobDescription, timestamp, applyStatus, platform
            FROM jobData
            WHERE applyStatus = ?
            ORDER BY
                CASE WHEN timestamp IS NULL OR TRIM(COALESCE(timestamp, '')) = '' THEN 1 ELSE 0 END,
                timestamp ASC,
                jobId
            """,
            (status,),
        ).fetchall()
    return [dict(r) for r in rows]


def jobDataApplyStatusSummary() -> dict[str, int]:
    """
    Counts for jobData: total rows, pending (NULL/blank applyStatus), APPLY,
    DO_NOT_APPLY, EXISTING, and any other non-empty applyStatus; plus pastData row count.
    """
    if _databaseKind() == "mongo":
        return _mongoJobDataApplyStatusSummary()

    dbPath = createTables(recreate=False)
    assert dbPath is not None
    with sqlite3.connect(dbPath) as connection:
        cursor = connection.cursor()
        row = cursor.execute(
            """
            SELECT
                COUNT(*) AS total,
                COALESCE(
                    SUM(
                        CASE
                            WHEN applyStatus IS NULL
                                OR TRIM(COALESCE(applyStatus, '')) = ''
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS null_pending,
                COALESCE(
                    SUM(
                        CASE
                            WHEN TRIM(COALESCE(applyStatus, '')) = 'APPLY'
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS apply_cnt,
                COALESCE(
                    SUM(
                        CASE
                            WHEN TRIM(COALESCE(applyStatus, '')) = 'DO_NOT_APPLY'
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS do_not_apply_cnt,
                COALESCE(
                    SUM(
                        CASE
                            WHEN TRIM(COALESCE(applyStatus, '')) = 'EXISTING'
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS existing_cnt,
                COALESCE(
                    SUM(
                        CASE
                            WHEN TRIM(COALESCE(applyStatus, '')) != ''
                                AND TRIM(COALESCE(applyStatus, '')) NOT IN (
                                    'APPLY',
                                    'DO_NOT_APPLY',
                                    'EXISTING'
                                )
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS other_cnt
            FROM jobData
            """
        ).fetchone()
        past_rows = cursor.execute("SELECT COUNT(*) FROM pastData").fetchone()
    total, n_null, n_apply, n_dna, n_ex, n_other = (int(x or 0) for x in row)
    return {
        "total": total,
        "nullPending": n_null,
        "apply": n_apply,
        "doNotApply": n_dna,
        "existing": n_ex,
        "otherStatus": n_other,
        "pastDataRows": int(past_rows[0] or 0) if past_rows else 0,
    }


def _mongoJobDataApplyStatusSummary() -> dict[str, int]:
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
    """
    Delete rows whose applyStatus is a non-empty string not in allowedStatuses.
    Rows with NULL or blank applyStatus are kept (pending / not yet classified).
    """
    normalized = sorted(
        {str(item or "").strip() for item in allowedStatuses if str(item or "").strip()}
    )
    if not normalized:
        raise ValueError("allowedStatuses must include at least one non-empty status")

    if _databaseKind() == "mongo":
        return _mongoDeleteJobsByApplyStatusNotIn(normalized)

    placeholders = ", ".join("?" for _ in normalized)
    sql = f"""
        DELETE FROM jobData
        WHERE TRIM(COALESCE(applyStatus, '')) != ''
          AND TRIM(COALESCE(applyStatus, '')) NOT IN ({placeholders})
    """
    dbPath = createTables(recreate=False)
    assert dbPath is not None
    with sqlite3.connect(dbPath) as connection:
        cursor = connection.cursor()
        cursor.execute(sql, tuple(normalized))
        deleted = int(cursor.rowcount or 0)
        connection.commit()
    return deleted


def _mongoDeleteJobsByApplyStatusNotIn(normalized: list[str]) -> int:
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
    """
    Delete pastData rows with a parseable timestamp older than `hours` (UTC).
    Rows with NULL/blank or unparseable timestamps are kept.
    """
    if hours <= 0:
        raise ValueError("hours must be positive")
    if _databaseKind() == "mongo":
        return _mongoDeletePastDataOlderThanHours(hours=hours)

    dbPath = createTables(recreate=False)
    assert dbPath is not None
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    with sqlite3.connect(dbPath) as connection:
        connection.row_factory = sqlite3.Row
        cursor = connection.cursor()
        rows = cursor.execute(
            "SELECT jobId, timestamp FROM pastData WHERE timestamp IS NOT NULL AND TRIM(timestamp) != ''"
        ).fetchall()
    staleIds: list[str] = []
    for row in rows:
        jid = str(row["jobId"]).strip()
        parsed = _parseStoredTimestampToUtc(row["timestamp"])
        if parsed is not None and parsed < cutoff and jid:
            staleIds.append(jid)
    if not staleIds:
        return 0
    placeholders = ",".join("?" for _ in staleIds)
    with sqlite3.connect(dbPath) as connection:
        cursor = connection.cursor()
        cursor.execute(f"DELETE FROM pastData WHERE jobId IN ({placeholders})", staleIds)
        connection.commit()
        return int(cursor.rowcount or 0)


def _mongoDeletePastDataOlderThanHours(*, hours: float) -> int:
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
    if _databaseKind() == "mongo":
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

    dbPath = createTables(recreate=False)
    assert dbPath is not None
    with sqlite3.connect(dbPath) as connection:
        cursor = connection.cursor()
        rows = cursor.execute(
            """
            SELECT jobId FROM jobData WHERE platform = ?
            UNION
            SELECT jobId FROM pastData WHERE platform = ?
            """,
            (platform, platform),
        ).fetchall()
    return {str(r[0]).strip() for r in rows if r and r[0]}


def recordPastData(rows: list[dict], *, platform: str) -> int:
    if not rows:
        return 0
    if _databaseKind() == "mongo":
        return _mongoRecordPastData(rows, platform=platform)
    return _sqliteRecordPastData(rows, platform=platform)


def _sqliteRecordPastData(rows: list[dict], *, platform: str) -> int:
    dbPath = createTables(recreate=False)
    assert dbPath is not None
    now = _utcNowIso()
    values: list[tuple[str, str, str, str]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        jobId = str(row.get("jobId") or "").strip()
        companyName = str(row.get("companyName") or "").strip() or "Unknown"
        if not jobId:
            continue
        ts = str(row.get("timestamp") or now).strip() or now
        values.append((jobId, platform, ts, companyName))
    if not values:
        return 0
    with sqlite3.connect(dbPath) as connection:
        cursor = connection.cursor()
        cursor.executemany(
            """
            INSERT INTO pastData (jobId, platform, timestamp, companyName)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(jobId) DO UPDATE SET
                platform = excluded.platform,
                timestamp = excluded.timestamp,
                companyName = excluded.companyName
            """,
            values,
        )
        connection.commit()
    return len(values)


def _mongoRecordPastData(rows: list[dict], *, platform: str) -> int:
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
    coll.bulk_write(ops, ordered=False)
    return len(ops)
