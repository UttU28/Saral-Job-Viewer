from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path


DB_FILE_NAME = "saralJobViewer.db"


def _projectRoot() -> Path:
    return Path(__file__).resolve().parent.parent


def getDatabasePath() -> Path:
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


def createTables(*, recreate: bool = False) -> Path:
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
        # Keep existing DBs compatible without requiring table recreation.
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
    """Unset / blank -> SQL NULL; classifier or manual statuses stay as non-empty strings."""
    if "applyStatus" not in row:
        return None
    raw = row.get("applyStatus")
    if raw is None:
        return None
    s = str(raw).strip()
    return s or None


def upsertJobs(rows: list[dict]) -> int:
    if not rows:
        return 0

    dbPath = createTables(recreate=False)
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


def loadJobsByPlatform(platform: str) -> list[dict]:
    dbPath = createTables(recreate=False)
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
    dbPath = createTables(recreate=False)
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
    Jobs where applyStatus is NULL only (not yet classified / not set).
    Rows with APPLY, EXISTING, DO_NOT_APPLY, legacy '', etc. are skipped.
    If platform is set, restrict to that platform.
    Ordered FIFO: oldest timestamp first; rows with no timestamp sort last, then jobId.
    """
    dbPath = createTables(recreate=False)
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
    dbPath = createTables(recreate=False)
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
    dbPath = createTables(recreate=False)
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
    dbPath = createTables(recreate=False)
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

    placeholders = ", ".join("?" for _ in normalized)
    sql = f"""
        DELETE FROM jobData
        WHERE TRIM(COALESCE(applyStatus, '')) != ''
          AND TRIM(COALESCE(applyStatus, '')) NOT IN ({placeholders})
    """
    dbPath = createTables(recreate=False)
    with sqlite3.connect(dbPath) as connection:
        cursor = connection.cursor()
        cursor.execute(sql, tuple(normalized))
        deleted = int(cursor.rowcount or 0)
        connection.commit()
    return deleted


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
    dbPath = createTables(recreate=False)
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


def loadKnownJobIdsByPlatform(platform: str) -> set[str]:
    dbPath = createTables(recreate=False)
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
    dbPath = createTables(recreate=False)
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
