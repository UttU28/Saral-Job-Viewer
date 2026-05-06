"""
Orchestrate Accept/Reject from the job viewer UI: Midhtech login + suggest, Mongo applyStatus updates.
Accept: only when DB status is APPLY; atomically moves to APPLYING, then APPLIED on success (reverts to APPLY on failure).
"""
from __future__ import annotations

import json
import traceback
from typing import Any, Literal

from utils.dataManager import (
    claimApplyingFromApply,
    finalizeAppliedFromApplying,
    getApplyStatusUpperByJobId,
    revertApplyingToApply,
    updateApplyStatusByJobId,
)
from utils.midhtechSuggestApi import authenticateMidhtechSessionWithCredentials, submitJobSuggestion

Decision = Literal["accept", "reject"]

SkippedReason = Literal[
    "ALREADY_APPLIED",
    "APPLY_IN_PROGRESS",
    "INVALID_STATUS_FOR_ACCEPT",
    "INVALID_STATUS_FOR_REJECT",
] | None


def buildStep(phase: str, ok: bool, message: str) -> dict[str, Any]:
    return {"phase": phase, "ok": ok, "message": message}


def _base_response(
    *,
    ok: bool,
    decision: Decision,
    steps: list[dict[str, Any]],
    apply_status_updated: str | None,
    error: str | None,
    db_apply_status: str | None,
    skipped_reason: SkippedReason = None,
) -> dict[str, Any]:
    return {
        "ok": ok,
        "decision": decision,
        "steps": steps,
        "applyStatusUpdated": apply_status_updated,
        "error": error,
        "dbApplyStatus": db_apply_status,
        "skippedReason": skipped_reason,
    }


def executeJobUiDecision(
    *,
    decision: Decision,
    job: dict[str, Any],
    profileEmail: str,
    profilePassword: str,
    profileName: str = "",
) -> dict[str, Any]:
    """
    reject -> Mongo applyStatus REJECTED (blocked if APPLIED or APPLYING).
    accept  -> requires APPLY in DB; APPLY -> APPLYING (atomic), then Midhtech flow, then APPLIED; revert to APPLY on failure.
    Every response includes dbApplyStatus (and skippedReason when the action did not proceed).
    """
    steps: list[dict[str, Any]] = []
    job_id_str = str(job.get("jobId") or "").strip()

    line = "=" * 72
    print(f"\n{line}", flush=True)
    print(f"  UI JOB DECISION: {decision.upper()}", flush=True)
    print(line, flush=True)
    name_show = (profileName or "").strip() or "(empty)"
    print(f"  PROFILE: name={name_show!r} email={profileEmail!r}", flush=True)
    print(f"  jobId: {job_id_str!r}", flush=True)
    try:
        print("  job payload (summary keys):", flush=True)
        summary_keys = {k: job.get(k) for k in ("title", "companyName", "platform") if k in job}
        print(json.dumps(summary_keys, indent=2, default=str), flush=True)
    except Exception:
        pass
    print(line, flush=True)

    if not job_id_str:
        steps.append(buildStep("validate", False, "Missing jobId in payload"))
        return _base_response(
            ok=False,
            decision=decision,
            steps=steps,
            apply_status_updated=None,
            error="Job payload must include jobId",
            db_apply_status=None,
            skipped_reason=None,
        )

    db_before = getApplyStatusUpperByJobId(job_id_str)
    steps.append(
        buildStep(
            "precheck",
            True,
            f"Database applyStatus before action: {db_before or '(empty / pending)'}",
        )
    )

    if decision == "reject":
        if db_before == "APPLIED":
            steps.append(buildStep("precheck", False, "Cannot reject: already APPLIED"))
            return _base_response(
                ok=False,
                decision=decision,
                steps=steps,
                apply_status_updated=None,
                error="This job is already marked APPLIED — reject is not allowed.",
                db_apply_status="APPLIED",
                skipped_reason="ALREADY_APPLIED",
            )
        if db_before == "APPLYING":
            steps.append(
                buildStep(
                    "precheck",
                    False,
                    "Cannot reject while another session is submitting (APPLYING)",
                )
            )
            return _base_response(
                ok=False,
                decision=decision,
                steps=steps,
                apply_status_updated=None,
                error="Another session is currently submitting this job (APPLYING). Try again shortly.",
                db_apply_status="APPLYING",
                skipped_reason="APPLY_IN_PROGRESS",
            )

        print("[reject] Updating MongoDB applyStatus -> REJECTED", flush=True)
        steps.append(buildStep("database", True, "Updating applyStatus to REJECTED"))
        if not updateApplyStatusByJobId(job_id_str, "REJECTED"):
            steps[-1] = buildStep("database", False, "No document matched jobId")
            print("[reject] FAILED: job not found", flush=True)
            return _base_response(
                ok=False,
                decision=decision,
                steps=steps,
                apply_status_updated=None,
                error="Job not found in database",
                db_apply_status=db_before,
                skipped_reason=None,
            )
        print("[reject] SUCCESS: REJECTED saved", flush=True)
        steps[-1] = buildStep("database", True, "REJECTED saved")
        return _base_response(
            ok=True,
            decision=decision,
            steps=steps,
            apply_status_updated="REJECTED",
            error=None,
            db_apply_status="REJECTED",
            skipped_reason=None,
        )

    # --- accept ---
    outcome, _hint = claimApplyingFromApply(job_id_str)
    if outcome == "not_found":
        steps.append(buildStep("precheck", False, "Job not found"))
        return _base_response(
            ok=False,
            decision=decision,
            steps=steps,
            apply_status_updated=None,
            error="Job not found in database",
            db_apply_status=None,
            skipped_reason=None,
        )
    if outcome == "already_applied":
        steps.append(buildStep("precheck", False, "Already APPLIED in database"))
        return _base_response(
            ok=False,
            decision=decision,
            steps=steps,
            apply_status_updated=None,
            error="This job is already marked APPLIED.",
            db_apply_status="APPLIED",
            skipped_reason="ALREADY_APPLIED",
        )
    if outcome == "already_applying":
        steps.append(buildStep("precheck", False, "Another client holds APPLYING"))
        return _base_response(
            ok=False,
            decision=decision,
            steps=steps,
            apply_status_updated=None,
            error="Someone else is currently submitting this job (status APPLYING). Try again when it finishes.",
            db_apply_status="APPLYING",
            skipped_reason="APPLY_IN_PROGRESS",
        )
    if outcome == "wrong_status":
        cur = (_hint or "empty").strip() or "empty"
        steps.append(buildStep("precheck", False, f"Status must be APPLY (current: {cur})"))
        return _base_response(
            ok=False,
            decision=decision,
            steps=steps,
            apply_status_updated=None,
            error=(
                "Accept is only allowed when the job is in APPLY status in the database "
                f"(current: {cur})."
            ),
            db_apply_status=_hint,
            skipped_reason="INVALID_STATUS_FOR_ACCEPT",
        )

    # outcome == "claimed" -> row is now APPLYING
    print("[accept] Reserved APPLYING in Mongo (atomic from APPLY)", flush=True)
    steps.append(buildStep("database", True, "Reserved APPLYING (ready to submit)"))

    print("[accept] Phase 1: Midhtech login with Settings credentials", flush=True)
    steps.append(buildStep("login", False, "Connecting to Midhtech…"))
    try:
        session, _, suggest_url, _, csrf_token = authenticateMidhtechSessionWithCredentials(
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
        revertApplyingToApply(job_id_str)
        st = getApplyStatusUpperByJobId(job_id_str)
        return _base_response(
            ok=False,
            decision=decision,
            steps=steps,
            apply_status_updated=None,
            error=f"Login failed: {msg}",
            db_apply_status=st,
            skipped_reason=None,
        )

    print("[accept] Phase 2: submitJobSuggestion (full payload from viewer)", flush=True)
    steps.append(buildStep("submit", False, "Posting job to /jobs/suggest/…"))
    try:
        submit_ok, detail = submitJobSuggestion(session, suggest_url, csrf_token, job)
        if not submit_ok:
            steps[-1] = buildStep("submit", False, detail)
            print(f"[accept] Phase 2 FAILED: {detail}", flush=True)
            revertApplyingToApply(job_id_str)
            st = getApplyStatusUpperByJobId(job_id_str)
            return _base_response(
                ok=False,
                decision=decision,
                steps=steps,
                apply_status_updated=None,
                error=detail,
                db_apply_status=st,
                skipped_reason=None,
            )
        steps[-1] = buildStep("submit", True, detail)
        print(f"[accept] Phase 2 SUCCESS: {detail}", flush=True)
    except Exception as exc:
        msg = str(exc).strip() or exc.__class__.__name__
        traceback.print_exc()
        steps[-1] = buildStep("submit", False, msg)
        print(f"[accept] Phase 2 FAILED: {msg}", flush=True)
        revertApplyingToApply(job_id_str)
        st = getApplyStatusUpperByJobId(job_id_str)
        return _base_response(
            ok=False,
            decision=decision,
            steps=steps,
            apply_status_updated=None,
            error=msg,
            db_apply_status=st,
            skipped_reason=None,
        )

    print("[accept] Phase 3: MongoDB APPLYING -> APPLIED", flush=True)
    steps.append(buildStep("database", False, "Saving APPLIED…"))
    if not finalizeAppliedFromApplying(job_id_str):
        steps[-1] = buildStep("database", False, "Expected APPLYING row not found — trying unconditional set")
        if not updateApplyStatusByJobId(job_id_str, "APPLIED"):
            steps[-1] = buildStep("database", False, "No document matched jobId")
            print("[accept] Phase 3 FAILED: job not found (submit already succeeded)", flush=True)
            return _base_response(
                ok=False,
                decision=decision,
                steps=steps,
                apply_status_updated=None,
                error="Suggestion submitted but failed to update job status in MongoDB",
                db_apply_status=getApplyStatusUpperByJobId(job_id_str),
                skipped_reason=None,
            )
    steps[-1] = buildStep("database", True, "APPLIED saved")
    print("[accept] Phase 3 SUCCESS: complete", flush=True)
    return _base_response(
        ok=True,
        decision=decision,
        steps=steps,
        apply_status_updated="APPLIED",
        error=None,
        db_apply_status="APPLIED",
        skipped_reason=None,
    )
