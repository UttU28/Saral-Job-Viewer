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
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

from utils.dataManager import updateApplyStatusByJobId
from utils.authService import (
    changeUserPassword,
    createUserSessionToken,
    getUserFromToken,
    loginUser,
    registerUser,
)
from utils.jobDecisionService import executeJobUiDecision
from utils.jobViewerQueries import (
    fetchDistinctPlatforms,
    fetchJobDataPage,
    fetchJobDetailByJobId,
    fetchJobSummaryCamel,
)
from utils.userWeeklyStats import (
    decrementWeeklyRejectedCount,
    fetchCurrentWeekAcceptedCount,
    fetchWeeklyReportByUser,
    incrementWeeklyDecisionCount,
)

app = FastAPI(title="Saral Job Viewer API", version="1.0.0")


class RegisterBody(BaseModel):
    name: str = ""
    email: str = ""
    password: str = ""


class LoginBody(BaseModel):
    email: str = ""
    password: str = ""


class ChangePasswordBody(BaseModel):
    currentPassword: str = ""
    newPassword: str = ""


class JobDecisionBody(BaseModel):
    """Job payload plus optional profile from Settings (browser cookie)."""

    decision: Literal["accept", "reject"]
    job: dict[str, Any] = Field(default_factory=dict)
    profileName: str = ""
    profileEmail: str = ""
    profilePassword: str = ""


def _extractBearerToken(authorization: str | None) -> str:
    value = str(authorization or "").strip()
    if not value or not value.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authorization token missing")
    token = value[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authorization token missing")
    return token


def requireAuth(authorization: str | None = Header(default=None)) -> dict[str, str]:
    token = _extractBearerToken(authorization)
    try:
        return getUserFromToken(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


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


@app.post("/api/auth/register")
def postAuthRegister(body: RegisterBody):
    try:
        user = registerUser(
            name=(body.name or "").strip(),
            email=(body.email or "").strip(),
            password=body.password or "",
        )
        token = createUserSessionToken(user)
        return {
            "ok": True,
            "token": token,
            "user": user,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/auth/login")
def postAuthLogin(body: LoginBody):
    try:
        user = loginUser(email=(body.email or "").strip(), password=body.password or "")
        token = createUserSessionToken(user)
        return {
            "ok": True,
            "token": token,
            "user": user,
        }
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/auth/me")
def getAuthMe(currentUser: dict[str, str] = Depends(requireAuth)):
    return {"ok": True, "user": currentUser}


@app.post("/api/auth/change-password")
def postAuthChangePassword(
    body: ChangePasswordBody, currentUser: dict[str, str] = Depends(requireAuth)
):
    try:
        changeUserPassword(
            userId=currentUser["userId"],
            currentPassword=body.currentPassword or "",
            newPassword=body.newPassword or "",
        )
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/auth/logout")
def postAuthLogout(currentUser: dict[str, str] = Depends(requireAuth)):
    return {"ok": True, "userId": currentUser["userId"]}


@app.get("/api/jobs/summary")
def getJobsSummary(currentUser: dict[str, str] = Depends(requireAuth)):
    try:
        summary = fetchJobSummaryCamel()
        return summary
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/jobs/platforms")
def getJobPlatforms(currentUser: dict[str, str] = Depends(requireAuth)):
    try:
        platforms = fetchDistinctPlatforms()
        return {"platforms": platforms}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/jobs/decision")
def postJobDecision(body: JobDecisionBody, currentUser: dict[str, str] = Depends(requireAuth)):
    """
    Reject: set applyStatus to REJECTED (blocked if APPLIED or APPLYING).
    Accept: requires APPLY in Mongo; atomically APPLY→APPLYING, then Midhtech login + suggest, then APPLIED;
    on Midhtech failure reverts APPLYING→APPLY. Duplicate accepts see APPLYING/APPLIED via skippedReason.
    Response always includes dbApplyStatus and skippedReason when applicable.
    """
    email = (body.profileEmail or "").strip()
    password = (body.profilePassword or "").strip()
    if body.decision == "accept" and (not email or not password):
        raise HTTPException(
            status_code=400,
            detail="profileEmail and profilePassword are required for Accept — save them in Settings first.",
        )

    try:
        result = executeJobUiDecision(
            decision=body.decision,
            job=dict(body.job),
            profileEmail=email,
            profilePassword=password,
            profileName=(body.profileName or "").strip(),
        )
        if result.get("ok"):
            if result.get("applyStatusUpdated") == "APPLIED":
                incrementWeeklyDecisionCount(
                    userId=currentUser["userId"],
                    decision="accept",
                    jobId=str((body.job or {}).get("jobId") or "").strip() or None,
                )
            elif result.get("applyStatusUpdated") == "REJECTED":
                incrementWeeklyDecisionCount(
                    userId=currentUser["userId"],
                    decision="reject",
                    jobId=str((body.job or {}).get("jobId") or "").strip() or None,
                )
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/jobs/{jobId}/rejected-to-apply")
def postRejectedJobToApply(jobId: str, currentUser: dict[str, str] = Depends(requireAuth)):
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
        decrementWeeklyRejectedCount(userId=currentUser["userId"], jobId=jobId)
        return {"ok": True, "applyStatus": "APPLY"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/profile/weekly-report")
def getProfileWeeklyReport(currentUser: dict[str, str] = Depends(requireAuth)):
    try:
        return fetchWeeklyReportByUser(userId=currentUser["userId"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/profile/current-week-accepts")
def getProfileCurrentWeekAccepts(currentUser: dict[str, str] = Depends(requireAuth)):
    try:
        return fetchCurrentWeekAcceptedCount(userId=currentUser["userId"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/jobs/{jobId}")
def getJobById(jobId: str, currentUser: dict[str, str] = Depends(requireAuth)):
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
    currentUser: dict[str, str] = Depends(requireAuth),
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
