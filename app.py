"""
FastAPI backend for the job viewer UI: paginated MongoDB reads with filters.
Run: uvicorn app:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import math
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

from utils.jobViewerQueries import (
    fetchDistinctPlatforms,
    fetchJobDataPage,
    fetchJobDetailByJobId,
    fetchJobSummaryCamel,
)

defaultOrigins = "http://localhost:5173,http://127.0.0.1:5173"
corsRaw = (os.getenv("API_CORS_ORIGINS") or defaultOrigins).strip()
allowOrigins = [o.strip() for o in corsRaw.split(",") if o.strip()]

app = FastAPI(title="Saral Job Viewer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowOrigins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def healthCheck():
    return {"ok": True}


@app.get("/api/jobs/summary")
def getJobsSummary():
    try:
        summary = fetchJobSummaryCamel()
        return summary
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/jobs/platforms")
def getJobPlatforms():
    try:
        platforms = fetchDistinctPlatforms()
        return {"platforms": platforms}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/jobs/{jobId}")
def getJobById(jobId: str):
    try:
        row = fetchJobDetailByJobId(jobId)
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        return row
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/jobs")
def listJobs(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=50),
    platform: str | None = Query(None),
    applyStatus: str | None = Query(None),
    search: str | None = Query(None),
):
    try:
        platformVal = platform.strip() if platform and platform.strip() else None
        applyVal = applyStatus.strip() if applyStatus and applyStatus.strip() else None
        searchVal = search.strip() if search and search.strip() else None
        if applyVal and applyVal.lower() == "all":
            applyVal = None
        if platformVal and platformVal.lower() == "all":
            platformVal = None

        items, total = fetchJobDataPage(
            page=page,
            pageSize=pageSize,
            platform=platformVal,
            applyStatus=applyVal,
            search=searchVal,
        )
        totalPages = max(1, math.ceil(total / pageSize)) if pageSize else 1
        return {
            "items": items,
            "total": total,
            "page": page,
            "pageSize": pageSize,
            "totalPages": totalPages,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    host = (os.getenv("API_HOST") or "0.0.0.0").strip()
    port = int((os.getenv("API_PORT") or "8000").strip())
    uvicorn.run("app:app", host=host, port=port, reload=True)
