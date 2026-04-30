from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from utils.dataManager import createTables, getDatabasePath


PlatformName = Literal["JobRight", "GlassDoor", "ZipRecruiter", "Unknown"]

app = FastAPI(
    title="Saral Job Viewer API",
    version="1.0.0",
    description="FastAPI backend for serving scraped jobs from SQLite.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _db_path() -> Path:
    createTables(recreate=False)
    return getDatabasePath()


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(_db_path())
    connection.row_factory = sqlite3.Row
    return connection


@app.get("/health")
def health() -> dict:
    db_path = _db_path()
    return {"status": "ok", "databasePath": str(db_path), "exists": db_path.is_file()}


@app.get("/api/jobs")
def list_jobs(
    platform: Annotated[PlatformName | None, Query()] = None,
    company: Annotated[str | None, Query()] = None,
    q: Annotated[
        str | None, Query(description="Search in companyName/jobDescription/jobId")
    ] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    sql = """
        SELECT
            jobId, title, jobUrl, location, employmentType, workModel, seniority, experience,
            originalJobPostUrl, companyName, jobDescription, timestamp, applyStatus, platform
        FROM jobData
    """
    clauses: list[str] = []
    params: list[object] = []

    if platform:
        clauses.append("platform = ?")
        params.append(platform)
    if company:
        clauses.append("companyName LIKE ?")
        params.append(f"%{company}%")
    if q:
        clauses.append(
            "(title LIKE ? OR companyName LIKE ? OR jobDescription LIKE ? OR jobId LIKE ?)"
        )
        like = f"%{q}%"
        params.extend([like, like, like, like])

    if clauses:
        sql += " WHERE " + " AND ".join(clauses)

    sql += " ORDER BY COALESCE(timestamp, '') DESC, jobId ASC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with _connect() as connection:
        rows = connection.execute(sql, params).fetchall()
        total_sql = "SELECT COUNT(*) FROM jobData"
        total_params: list[object] = []
        if clauses:
            total_sql += " WHERE " + " AND ".join(clauses)
            total_params = params[:-2]
        total = int(connection.execute(total_sql, total_params).fetchone()[0])

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "jobs": [dict(row) for row in rows],
    }


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT
                jobId, title, jobUrl, location, employmentType, workModel, seniority, experience,
                originalJobPostUrl, companyName, jobDescription, timestamp, applyStatus, platform
            FROM jobData
            WHERE jobId = ?
            """,
            (job_id,),
        ).fetchone()
    if not row:
        return {"found": False, "jobId": job_id}
    return {"found": True, "job": dict(row)}


@app.get("/api/past-data")
def list_past_data(
    platform: Annotated[PlatformName | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    sql = "SELECT jobId, platform, timestamp, companyName FROM pastData"
    params: list[object] = []
    if platform:
        sql += " WHERE platform = ?"
        params.append(platform)
    sql += " ORDER BY COALESCE(timestamp, '') DESC, jobId ASC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with _connect() as connection:
        rows = connection.execute(sql, params).fetchall()
        total_sql = "SELECT COUNT(*) FROM pastData"
        total_params: list[object] = []
        if platform:
            total_sql += " WHERE platform = ?"
            total_params.append(platform)
        total = int(connection.execute(total_sql, total_params).fetchone()[0])

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [dict(row) for row in rows],
    }


@app.get("/api/stats")
def get_stats() -> dict:
    with _connect() as connection:
        total_jobs = int(connection.execute("SELECT COUNT(*) FROM jobData").fetchone()[0])
        total_past = int(connection.execute("SELECT COUNT(*) FROM pastData").fetchone()[0])
        by_platform_rows = connection.execute(
            """
            SELECT platform, COUNT(*) AS count
            FROM jobData
            GROUP BY platform
            ORDER BY count DESC
            """
        ).fetchall()
    return {
        "jobDataCount": total_jobs,
        "pastDataCount": total_past,
        "jobDataByPlatform": [dict(row) for row in by_platform_rows],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
