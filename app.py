"""
FastAPI backend for the job viewer UI: paginated MongoDB reads with filters.
Run: uvicorn app:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import logging
import math
import os
import time
import uuid
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google.cloud import run_v2

load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

from utils.dataManager import deleteJobsByApplyStatusNotIn, updateApplyStatusByJobId
from utils.authService import (
    changeUserPassword,
    createUserSessionToken,
    getUserFromToken,
    listAllUsersForAdmin,
    loginUser,
    requireAdminUser,
    registerUser,
    setUserAdminStatus,
    updateUserName,
)
from utils.jobDecisionService import executeJobUiDecision
from utils.jobViewerQueries import (
    fetchAdminJobStatusSummary,
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
from utils.redisCache import (
    bumpJobsListVersion,
    deleteCacheKey,
    keyAdminJobStatusSummary,
    getCachedJson,
    keyAdminUsers,
    keyJobDetail,
    keyJobPlatforms,
    keyJobsList,
    keyJobsSummary,
    keyProfileCurrentWeekAccepts,
    keyProfileWeeklyReport,
    setCachedJson,
)

app = FastAPI(title="Saral Job Viewer API", version="1.0.0")

_logLevelName = str(os.getenv("APP_LOG_LEVEL") or "INFO").strip().upper()
_logLevel = getattr(logging, _logLevelName, logging.INFO)
logger = logging.getLogger("saral.api")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(name)s | %(message)s"))
    logger.addHandler(handler)
logger.setLevel(_logLevel)
logger.propagate = False


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


class UpdateProfileBody(BaseModel):
    name: str = ""


class SetUserAdminBody(BaseModel):
    isAdmin: bool = False


class AdminJobActionBody(BaseModel):
    action: str = ""


class AdminJobExecutionStatusBody(BaseModel):
    executionName: str = ""


class JobDecisionBody(BaseModel):
    """Job payload plus optional profile from Settings (browser cookie)."""

    decision: Literal["accept", "reject"]
    job: dict[str, Any] = Field(default_factory=dict)
    profileName: str = ""
    profileEmail: str = ""
    profilePassword: str = ""


def _adminStatusDebugSnapshot() -> dict[str, int]:
    snap = fetchAdminJobStatusSummary()
    return {
        "total": int(snap.get("total") or 0),
        "nullPending": int(snap.get("nullPending") or 0),
        "apply": int(snap.get("apply") or 0),
        "applied": int(snap.get("applied") or 0),
        "doNotApply": int(snap.get("doNotApply") or 0),
        "rejected": int(snap.get("rejected") or 0),
        "existing": int(snap.get("existing") or 0),
        "applying": int(snap.get("applying") or 0),
        "redo": int(snap.get("redo") or 0),
        "otherStatus": int(snap.get("otherStatus") or 0),
    }


def _cloudRunConfigFromEnv() -> tuple[str, str, str]:
    projectId = str(os.getenv("GCP_PROJECT_ID") or "").strip()
    region = str(os.getenv("GCP_REGION") or "").strip()
    jobName = str(os.getenv("RUN_JOB_NAME") or "").strip()
    if not projectId or not region or not jobName:
        raise HTTPException(
            status_code=500,
            detail=(
                "Cloud Run job config missing. Set GCP_PROJECT_ID, GCP_REGION, and RUN_JOB_NAME "
                "in backend environment."
            ),
        )
    return projectId, region, jobName


def _executionStateFromExecution(execution: run_v2.Execution) -> str:
    if int(getattr(execution, "failed_count", 0) or 0) > 0:
        return "FAILED"
    if int(getattr(execution, "succeeded_count", 0) or 0) > 0:
        return "SUCCEEDED"
    if int(getattr(execution, "cancelled_count", 0) or 0) > 0:
        return "CANCELLED"
    return "RUNNING"


def _executionShortName(fullName: str) -> str:
    parts = str(fullName or "").rstrip("/").split("/")
    return parts[-1] if parts else str(fullName or "")


def _executionToPayload(execution: run_v2.Execution) -> dict[str, Any]:
    """Serialize a Cloud Run v2 Execution for API responses."""
    full_name = str(getattr(execution, "name", "") or "")
    return {
        "executionName": full_name,
        "shortName": _executionShortName(full_name),
        "jobName": str(getattr(execution, "job", "") or ""),
        "state": _executionStateFromExecution(execution),
        "succeededCount": int(getattr(execution, "succeeded_count", 0) or 0),
        "failedCount": int(getattr(execution, "failed_count", 0) or 0),
        "cancelledCount": int(getattr(execution, "cancelled_count", 0) or 0),
        "runningCount": int(getattr(execution, "running_count", 0) or 0),
        "startTime": str(getattr(execution, "start_time", "") or ""),
        "completionTime": str(getattr(execution, "completion_time", "") or ""),
    }


def listCloudRunExecutions(*, limit: int, pageToken: str = "") -> dict[str, Any]:
    """List recent executions for the configured job (newest first within each page)."""
    projectId, region, jobName = _cloudRunConfigFromEnv()
    jobs_client = run_v2.JobsClient()
    executions_client = run_v2.ExecutionsClient()
    full_job_name = jobs_client.job_path(projectId, region, jobName)
    cap = min(max(1, limit), 50)
    request = run_v2.ListExecutionsRequest(
        parent=full_job_name,
        page_size=cap,
        page_token=str(pageToken or "").strip(),
    )
    pager = executions_client.list_executions(request=request)
    page = next(iter(pager.pages))
    executions = [_executionToPayload(ex) for ex in page.executions]
    return {
        "parentJob": full_job_name,
        "executions": executions,
        "nextPageToken": str(getattr(page, "next_page_token", "") or ""),
    }


def triggerCloudRunJob(*, modeNumber: str) -> dict[str, str]:
    projectId, region, jobName = _cloudRunConfigFromEnv()
    jobsClient = run_v2.JobsClient()
    executionsClient = run_v2.ExecutionsClient()
    fullJobName = jobsClient.job_path(projectId, region, jobName)
    runRequest = run_v2.RunJobRequest(
        name=fullJobName,
        overrides=run_v2.RunJobRequest.Overrides(
            container_overrides=[
                run_v2.RunJobRequest.Overrides.ContainerOverride(
                    args=["validation.py", f"-{modeNumber}"]
                )
            ]
        ),
    )
    operation = jobsClient.run_job(request=runRequest)
    operationName = str(getattr(getattr(operation, "operation", None), "name", "") or "")

    executionName = ""
    try:
        latestExecution = next(iter(executionsClient.list_executions(parent=fullJobName)), None)
        if latestExecution is not None:
            executionName = str(getattr(latestExecution, "name", "") or "")
    except Exception:
        executionName = ""

    logger.info(
        "[CLOUD_RUN_TRIGGER] job=%s mode=%s operation=%s execution=%s",
        fullJobName,
        modeNumber,
        operationName or "n/a",
        executionName or "n/a",
    )
    return {
        "projectId": projectId,
        "region": region,
        "jobName": jobName,
        "fullJobName": fullJobName,
        "operationName": operationName,
        "executionName": executionName,
    }


def fetchCloudRunExecutionStatus(*, executionName: str) -> dict[str, Any]:
    name = str(executionName or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="executionName is required.")
    executionsClient = run_v2.ExecutionsClient()
    execution = executionsClient.get_execution(name=name)
    payload = _executionToPayload(execution)
    if name and not payload.get("executionName"):
        payload["executionName"] = name
    return payload


@app.middleware("http")
async def logApiRequests(request: Request, call_next):
    requestId = str(uuid.uuid4())[:8]
    start = time.perf_counter()
    path = request.url.path
    method = request.method
    try:
        response = await call_next(request)
        elapsedMs = int((time.perf_counter() - start) * 1000)
        logger.info(
            "[REQ] id=%s method=%s path=%s status=%s tookMs=%s",
            requestId,
            method,
            path,
            response.status_code,
            elapsedMs,
        )
        return response
    except Exception:
        elapsedMs = int((time.perf_counter() - start) * 1000)
        logger.exception(
            "[REQ] id=%s method=%s path=%s status=500 tookMs=%s",
            requestId,
            method,
            path,
            elapsedMs,
        )
        raise


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


def requireAdmin(currentUser: dict[str, Any] = Depends(requireAuth)) -> dict[str, Any]:
    try:
        requireAdminUser(user=currentUser)
        return currentUser
    except Exception as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


def invalidateJobCaches(*, userId: str | None = None, jobId: str | None = None) -> None:
    deleteCacheKey(keyJobsSummary())
    deleteCacheKey(keyJobPlatforms())
    deleteCacheKey(keyAdminJobStatusSummary())
    if jobId:
        deleteCacheKey(keyJobDetail(jobId))
    bumpJobsListVersion()
    if userId:
        deleteCacheKey(keyProfileWeeklyReport(userId))
        deleteCacheKey(keyProfileCurrentWeekAccepts(userId))


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    """Cloud Run root URL has no nginx path prefix; API lives under /api/…."""
    return {
        "service": "saral-job-viewer-api",
        "health": "/api/health",
        "docs": "/docs",
    }


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


@app.post("/api/auth/update-profile")
def postAuthUpdateProfile(
    body: UpdateProfileBody, currentUser: dict[str, str] = Depends(requireAuth)
):
    try:
        nextUser = updateUserName(userId=currentUser["userId"], nextName=body.name or "")
        deleteCacheKey(keyAdminUsers())
        return {"ok": True, "user": nextUser}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/auth/logout")
def postAuthLogout(currentUser: dict[str, str] = Depends(requireAuth)):
    return {"ok": True, "userId": currentUser["userId"]}


@app.get("/api/admin/users")
def getAdminUsers(currentUser: dict[str, Any] = Depends(requireAdmin)):
    try:
        cacheKey = keyAdminUsers()
        cached = getCachedJson(cacheKey)
        if cached is not None:
            return cached
        payload = listAllUsersForAdmin()
        setCachedJson(cacheKey, payload, ttlSeconds=20)
        return payload
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/admin/users/{targetUserId}/set-admin")
def postAdminSetUserAdmin(
    targetUserId: str,
    body: SetUserAdminBody,
    currentUser: dict[str, Any] = Depends(requireAdmin),
):
    try:
        if str(currentUser.get("userId") or "") == str(targetUserId or ""):
            raise HTTPException(status_code=400, detail="You cannot change your own admin access.")
        setUserAdminStatus(targetUserId=targetUserId, isAdmin=bool(body.isAdmin))
        deleteCacheKey(keyAdminUsers())
        return {"ok": True}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/admin/jobs/status-summary")
def getAdminJobStatusSummary(currentUser: dict[str, Any] = Depends(requireAdmin)):
    try:
        cacheKey = keyAdminJobStatusSummary()
        cached = getCachedJson(cacheKey)
        if cached is not None:
            return cached
        payload = fetchAdminJobStatusSummary()
        setCachedJson(cacheKey, payload, ttlSeconds=20)
        return payload
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/admin/jobs/actions")
def postAdminJobAction(
    body: AdminJobActionBody,
    currentUser: dict[str, Any] = Depends(requireAdmin),
):
    action = str(body.action or "").strip()
    allowedActions = {
        "classify_all_pending_null_jobs",
        "delete_unwanted_classified_jobs",
        "push_apply_jobs",
        "push_apply_jobs_then_cleanup",
    }
    if action not in allowedActions:
        raise HTTPException(status_code=400, detail="Unsupported admin action.")
    adminDetails = {
        "userId": str(currentUser.get("userId") or ""),
        "email": str(currentUser.get("email") or ""),
        "name": str(currentUser.get("name") or ""),
        "isAdmin": bool(currentUser.get("isAdmin")),
    }
    logger.info("[ADMIN_ACTION_START] action=%s admin=%s", action, adminDetails)
    if action == "classify_all_pending_null_jobs":
        cloudRun = triggerCloudRunJob(modeNumber="1")
        message = "Verify job started on Cloud Run."
        return {
            "ok": True,
            "action": action,
            "admin": adminDetails,
            "message": message,
            "cloudRun": cloudRun,
        }
    if action in {"push_apply_jobs", "push_apply_jobs_then_cleanup"}:
        cloudRun = triggerCloudRunJob(modeNumber="2")
        message = "Apply job started on Cloud Run."
        return {
            "ok": True,
            "action": action,
            "admin": adminDetails,
            "message": message,
            "cloudRun": cloudRun,
        }

    before = _adminStatusDebugSnapshot()
    beforeMergedRejected = int(before["rejected"]) + int(before["doNotApply"]) + int(before["existing"])
    if action == "delete_unwanted_classified_jobs":
        deletedCount = int(deleteJobsByApplyStatusNotIn(("APPLY",)))
        invalidateJobCaches()
        after = _adminStatusDebugSnapshot()
        afterMergedRejected = (
            int(after["rejected"]) + int(after["doNotApply"]) + int(after["existing"])
        )
        message = (
            "Delete completed successfully. "
            f"Removed {deletedCount} job(s). Kept NULL/blank and APPLY jobs."
        )
        logger.info(
            "[ADMIN_ACTION_DONE] action=%s deleted=%s keep=%s admin=%s before=%s "
            "mergedRejectedBefore=%s after=%s mergedRejectedAfter=%s",
            action,
            deletedCount,
            ["NULL/blank", "APPLY"],
            adminDetails,
            before,
            beforeMergedRejected,
            after,
            afterMergedRejected,
        )
        return {
            "ok": True,
            "action": action,
            "admin": adminDetails,
            "message": message,
            "deletedCount": deletedCount,
            "before": before,
            "after": after,
            "mergedRejectedBefore": beforeMergedRejected,
            "mergedRejectedAfter": afterMergedRejected,
        }
    logger.info("[ADMIN_ACTION_DONE] action=%s admin=%s before=%s", action, adminDetails, before)
    return {"ok": True, "action": action, "admin": adminDetails, "message": "Action logged."}


@app.post("/api/admin/jobs/execution-status")
def postAdminJobExecutionStatus(
    body: AdminJobExecutionStatusBody,
    currentUser: dict[str, Any] = Depends(requireAdmin),
):
    try:
        statusPayload = fetchCloudRunExecutionStatus(executionName=body.executionName)
        logger.info(
            "[CLOUD_RUN_STATUS] admin=%s execution=%s state=%s",
            str(currentUser.get("email") or ""),
            statusPayload.get("executionName"),
            statusPayload.get("state"),
        )
        return {"ok": True, **statusPayload}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/admin/jobs/cloud-run-executions")
def getAdminCloudRunExecutions(
    limit: int = Query(default=20, ge=1, le=50),
    page_token: str = Query(default="", alias="pageToken"),
    currentUser: dict[str, Any] = Depends(requireAdmin),
):
    try:
        payload = listCloudRunExecutions(limit=limit, pageToken=page_token)
        running = sum(1 for row in payload["executions"] if row.get("state") == "RUNNING")
        logger.info(
            "[CLOUD_RUN_LIST] admin=%s count=%s runningInPage=%s",
            str(currentUser.get("email") or ""),
            len(payload.get("executions") or []),
            running,
        )
        return {"ok": True, **payload}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/jobs/summary")
def getJobsSummary(currentUser: dict[str, str] = Depends(requireAuth)):
    try:
        cacheKey = keyJobsSummary()
        cached = getCachedJson(cacheKey)
        if cached is not None:
            return cached
        summary = fetchJobSummaryCamel()
        setCachedJson(cacheKey, summary, ttlSeconds=60)
        return summary
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/jobs/platforms")
def getJobPlatforms(currentUser: dict[str, str] = Depends(requireAuth)):
    try:
        cacheKey = keyJobPlatforms()
        cached = getCachedJson(cacheKey)
        if cached is not None:
            return cached
        platforms = fetchDistinctPlatforms()
        payload = {"platforms": platforms}
        setCachedJson(cacheKey, payload, ttlSeconds=300)
        return payload
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
            jobIdValue = str((body.job or {}).get("jobId") or "").strip() or None
            if result.get("applyStatusUpdated") == "APPLIED":
                incrementWeeklyDecisionCount(
                    userId=currentUser["userId"],
                    decision="accept",
                    jobId=jobIdValue,
                )
            elif result.get("applyStatusUpdated") == "REJECTED":
                incrementWeeklyDecisionCount(
                    userId=currentUser["userId"],
                    decision="reject",
                    jobId=jobIdValue,
                )
            invalidateJobCaches(userId=currentUser["userId"], jobId=jobIdValue)
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
        invalidateJobCaches(userId=currentUser["userId"], jobId=jobId)
        return {"ok": True, "applyStatus": "APPLY"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/profile/weekly-report")
def getProfileWeeklyReport(currentUser: dict[str, str] = Depends(requireAuth)):
    try:
        cacheKey = keyProfileWeeklyReport(currentUser["userId"])
        cached = getCachedJson(cacheKey)
        if cached is not None:
            return cached
        payload = fetchWeeklyReportByUser(userId=currentUser["userId"])
        setCachedJson(cacheKey, payload, ttlSeconds=30)
        return payload
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/profile/current-week-accepts")
def getProfileCurrentWeekAccepts(currentUser: dict[str, str] = Depends(requireAuth)):
    try:
        cacheKey = keyProfileCurrentWeekAccepts(currentUser["userId"])
        cached = getCachedJson(cacheKey)
        if cached is not None:
            return cached
        payload = fetchCurrentWeekAcceptedCount(userId=currentUser["userId"])
        setCachedJson(cacheKey, payload, ttlSeconds=15)
        return payload
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/jobs/{jobId}")
def getJobById(jobId: str, currentUser: dict[str, str] = Depends(requireAuth)):
    try:
        cacheKey = keyJobDetail(jobId)
        cached = getCachedJson(cacheKey)
        if cached is not None:
            return cached
        row = fetchJobDetailByJobId(jobId)
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        setCachedJson(cacheKey, row, ttlSeconds=20)
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

        cacheParams = {
            "page": page,
            "pageSize": pageSize,
            "platform": platformValue or "",
            "applyStatus": applyValue or "",
            "search": searchValue or "",
        }
        cacheKey = keyJobsList(cacheParams)
        cached = getCachedJson(cacheKey)
        if cached is not None:
            return cached

        items, total = fetchJobDataPage(
            page=page,
            pageSize=pageSize,
            platform=platformValue,
            applyStatus=applyValue,
            search=searchValue,
        )
        totalPages = max(1, math.ceil(total / pageSize)) if pageSize else 1
        payload = {
            "items": items,
            "total": total,
            "page": page,
            "pageSize": pageSize,
            "totalPages": totalPages,
        }
        setCachedJson(cacheKey, payload, ttlSeconds=30)
        return payload
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    host = (os.getenv("API_HOST") or "0.0.0.0").strip()
    port = int((os.getenv("API_PORT") or "8000").strip())
    uvicorn.run("app:app", host=host, port=port, reload=True)
