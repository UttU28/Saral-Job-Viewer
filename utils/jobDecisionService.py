"""
Orchestrate Accept/Reject from the job viewer UI: Midhtech login + suggest, Mongo applyStatus updates.
"""
from __future__ import annotations

import json
import traceback
from typing import Any, Literal

from utils.dataManager import updateApplyStatusByJobId
from utils.midhtechSuggestApi import authenticateMidhtechSessionWithCredentials, submitJobSuggestion

Decision = Literal["accept", "reject"]


def buildStep(phase: str, ok: bool, message: str) -> dict[str, Any]:
    return {"phase": phase, "ok": ok, "message": message}


def executeJobUiDecision(
    *,
    decision: Decision,
    job: dict[str, Any],
    profileEmail: str,
    profilePassword: str,
    profileName: str = "",
) -> dict[str, Any]:
    """
    reject -> Mongo applyStatus REJECTED.
    accept  -> Midhtech login (profile creds) -> submitJobSuggestion -> Mongo applyStatus APPLIED (on success only).
    Returns JSON-serializable dict for the UI (always HTTP 200 from route unless uncaught exception).
    """
    steps: list[dict[str, Any]] = []
    jobIdStr = str(job.get("jobId") or "").strip()

    line = "=" * 72
    print(f"\n{line}", flush=True)
    print(f"  UI JOB DECISION: {decision.upper()}", flush=True)
    print(line, flush=True)
    nameShow = (profileName or "").strip() or "(empty)"
    print(f"  PROFILE: name={nameShow!r} email={profileEmail!r}", flush=True)
    print(f"  jobId: {jobIdStr!r}", flush=True)
    try:
        print("  job payload (summary keys):", flush=True)
        summaryKeys = {k: job.get(k) for k in ("title", "companyName", "platform") if k in job}
        print(json.dumps(summaryKeys, indent=2, default=str), flush=True)
    except Exception:
        pass
    print(line, flush=True)

    if not jobIdStr:
        steps.append(buildStep("validate", False, "Missing jobId in payload"))
        return {
            "ok": False,
            "decision": decision,
            "steps": steps,
            "error": "Job payload must include jobId",
            "applyStatusUpdated": None,
        }

    if decision == "reject":
        print("[reject] Updating MongoDB applyStatus -> REJECTED", flush=True)
        steps.append(buildStep("database", True, "Updating applyStatus to REJECTED"))
        if not updateApplyStatusByJobId(jobIdStr, "REJECTED"):
            steps[-1] = buildStep("database", False, "No document matched jobId")
            print("[reject] FAILED: job not found", flush=True)
            return {
                "ok": False,
                "decision": decision,
                "steps": steps,
                "error": "Job not found in database",
                "applyStatusUpdated": None,
            }
        print("[reject] SUCCESS: REJECTED saved", flush=True)
        steps[-1] = buildStep("database", True, "REJECTED saved")
        return {
            "ok": True,
            "decision": decision,
            "steps": steps,
            "applyStatusUpdated": "REJECTED",
            "error": None,
        }

    # --- accept ---
    print("[accept] Phase 1: Midhtech login with Settings credentials", flush=True)
    steps.append(buildStep("login", False, "Connecting to Midhtech…"))
    try:
        session, _, suggestUrl, _, csrfToken = authenticateMidhtechSessionWithCredentials(
            profileEmail,
            profilePassword,
        )
        steps[-1] = buildStep("login", True, "Login successful; loaded suggest page and CSRF token")
        print("[accept] Phase 1 SUCCESS: session authenticated", flush=True)
    except Exception as exc:
        msg = str(exc).strip() or exc.__class__.__name__
        traceback.print_exc()
        steps[-1] = buildStep("login", False, msg)
        print(f"[accept] Phase 1 FAILED: {msg}", flush=True)
        return {
            "ok": False,
            "decision": decision,
            "steps": steps,
            "error": f"Login failed: {msg}",
            "applyStatusUpdated": None,
        }

    print("[accept] Phase 2: submitJobSuggestion (full payload from viewer)", flush=True)
    steps.append(buildStep("submit", False, "Posting job to /jobs/suggest/…"))
    try:
        submitOk, detail = submitJobSuggestion(session, suggestUrl, csrfToken, job)
        if not submitOk:
            steps[-1] = buildStep("submit", False, detail)
            print(f"[accept] Phase 2 FAILED: {detail}", flush=True)
            return {
                "ok": False,
                "decision": decision,
                "steps": steps,
                "error": detail,
                "applyStatusUpdated": None,
            }
        steps[-1] = buildStep("submit", True, detail)
        print(f"[accept] Phase 2 SUCCESS: {detail}", flush=True)
    except Exception as exc:
        msg = str(exc).strip() or exc.__class__.__name__
        traceback.print_exc()
        steps[-1] = buildStep("submit", False, msg)
        print(f"[accept] Phase 2 FAILED: {msg}", flush=True)
        return {
            "ok": False,
            "decision": decision,
            "steps": steps,
            "error": msg,
            "applyStatusUpdated": None,
        }

    print("[accept] Phase 3: MongoDB applyStatus -> APPLIED", flush=True)
    steps.append(buildStep("database", False, "Saving APPLIED…"))
    if not updateApplyStatusByJobId(jobIdStr, "APPLIED"):
        steps[-1] = buildStep("database", False, "No document matched jobId")
        print("[accept] Phase 3 FAILED: job not found (submit already succeeded)", flush=True)
        return {
            "ok": False,
            "decision": decision,
            "steps": steps,
            "error": "Suggestion submitted but failed to update job status in MongoDB",
            "applyStatusUpdated": None,
        }
    steps[-1] = buildStep("database", True, "APPLIED saved")
    print("[accept] Phase 3 SUCCESS: complete", flush=True)
    return {
        "ok": True,
        "decision": decision,
        "steps": steps,
        "applyStatusUpdated": "APPLIED",
        "error": None,
    }
