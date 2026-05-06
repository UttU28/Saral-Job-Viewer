"""
FastAPI backend for the job viewer UI: paginated MongoDB reads with filters.
Run: uvicorn app:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

from utils.dataManager import updateApplyStatusByJobId
from utils.jobDecisionService import executeJobUiDecision
from utils.jobViewerQueries import (
    fetchDistinctPlatforms,
    fetchJobDataPage,
    fetchJobDetailByJobId,
    fetchJobSummaryCamel,
)

app = FastAPI(title="Saral Job Viewer API", version="1.0.0")


class JobDecisionBody(BaseModel):
    """Job payload plus optional profile from Settings (browser cookie)."""

    decision: Literal["accept", "reject"]
    job: dict[str, Any] = Field(default_factory=dict)
    profileName: str = ""
    profileEmail: str = ""
    profilePassword: str = ""

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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


@app.post("/api/jobs/decision")
def postJobDecision(body: JobDecisionBody):
    """
    Reject: set applyStatus to REJECTED in Mongo.
    Accept: Midhtech login (Settings email/password) + submit suggestion + set applyStatus to APPLIED on success (unchanged on failure).
    Returns structured steps for the UI; logs phases to stdout.
    """
    email = (body.profileEmail or "").strip()
    password = (body.profilePassword or "").strip()
    if body.decision == "accept" and (not email or not password):
        raise HTTPException(
            status_code=400,
            detail="profileEmail and profilePassword are required for Accept — save them in Settings first.",
        )

    try:
        return executeJobUiDecision(
            decision=body.decision,
            job=dict(body.job),
            profileEmail=email,
            profilePassword=password,
            profileName=(body.profileName or "").strip(),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/jobs/{jobId}/rejected-to-apply")
def postRejectedJobToApply(jobId: str):
    """
    Set applyStatus from REJECTED to APPLY (local DB only; no Midhtech call).
    """
    try:
        row = fetchJobDetailByJobId(jobId)
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        current = str(row.get("applyStatus") or "").strip().upper()
        if current != "REJECTED":
            raise HTTPException(
                status_code=400,
                detail="Only jobs with status REJECTED can be moved to APPLY.",
            )
        if not updateApplyStatusByJobId(jobId, "APPLY"):
            raise HTTPException(status_code=404, detail="Job not found")
        return {"ok": True, "applyStatus": "APPLY"}
    except HTTPException:
        raise
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
        platformValue = platform.strip() if platform and platform.strip() else None
        applyValue = applyStatus.strip() if applyStatus and applyStatus.strip() else None
        searchValue = search.strip() if search and search.strip() else None
        if applyValue and applyValue.lower() == "all":
            applyValue = None
        if platformValue and platformValue.lower() == "all":
            platformValue = None

        items, total = fetchJobDataPage(
            page=page,
            pageSize=pageSize,
            platform=platformValue,
            applyStatus=applyValue,
            search=searchValue,
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
