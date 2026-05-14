"""
Job UI decisions (accept/reject → Midhtech suggest) and shared local job pre-checks.

Centralizes:
  - Citizenship / work authorization / clearance / sponsorship regex scanners
  - Years-of-experience description scan (1–4 YoE target; ≥5 blocks — aligned with frontend/src/lib/jobDescriptionExperience.ts)
  - findRestrictionTagsForJob() used by ingest skip, validation sync, and suggest pre-check
"""

from __future__ import annotations

import json
import re
import traceback
from typing import Any, Final, Literal

from utils.dataManager import (
    claimApplyingFromApply,
    finalizeAppliedFromApplying,
    getApplyStatusUpperByJobId,
    revertApplyingToApply,
    updateApplyStatusByJobId,
)
from utils.midhtechSuggestApi import authenticateMidhtechSessionWithCredentials, submitJobSuggestion

# --- Restriction regex scanners (title + visa note + responsibility + description) ---

RESTRICTION_SCANNERS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bu\.?\s*s\.?\s*citizen\b", re.I), "US citizen"),
    (re.compile(r"\bcitizenship\b", re.I), "Citizenship"),
    (
        re.compile(
            r"\blawful\s+permanent\s+resident\b|\bpermanent\s+resident\b|\bgreen\s+card\b",
            re.I,
        ),
        "Permanent resident / green card",
    ),
    (re.compile(r"\bauthorized\s+to\s+work\b", re.I), "Authorized to work"),
    (re.compile(r"\bwork\s+authorization\b", re.I), "Work authorization"),
    (re.compile(r"\bemployment\s+authorization\b", re.I), "Employment authorization"),
    (
        re.compile(
            r"\beligible\s+to\s+work\s+(?:in\s+)?(?:the\s+)?u\.?s\.?\b",
            re.I,
        ),
        "Eligible to work (US)",
    ),
    (re.compile(r"\bi-9\b|\be-?verify\b", re.I), "I-9 / E-Verify"),
    (re.compile(r"\btop\s+secret\b|\bt\/s\b|\bts\/sci\b", re.I), "Top secret / TS"),
    (re.compile(r"\bsecret\s+clearance\b", re.I), "Secret clearance"),
    (re.compile(r"\bpublic\s+trust\b", re.I), "Public trust"),
    (re.compile(r"\bclearance\b", re.I), "Clearance"),
    (
        re.compile(
            r"\bwill\s+not\s+sponsor\b|\bdoes\s+not\s+sponsor\b|\bunable\s+to\s+sponsor\b|\bcannot\s+sponsor\b",
            re.I,
        ),
        "Not sponsoring",
    ),
    (
        re.compile(
            r"\bno\s+visa\s+sponsorship\b|\bnot\s+offering\s+sponsorship\b|\bwithout\s+sponsorship\b",
            re.I,
        ),
        "No visa sponsorship",
    ),
    (re.compile(r"\bh-?1b\b|\bh1-b\b", re.I), "H-1B mentioned"),
    (re.compile(r"\bvisa\s+sponsorship\b", re.I), "Visa sponsorship"),
    (
        re.compile(r"\bsolely\s+authorized\b|\bonly\s+authorized\b", re.I),
        "Authorization restriction",
    ),
    (
        re.compile(r"\b(?:must|required\s+to)\s+be\s+eligible\b", re.I),
        "Eligibility requirement",
    ),
)

# --- Experience patterns (same strings as frontend EXPERIENCE_SCANNERS) ---

_EXPERIENCE_SCANNER_SOURCES: Final[tuple[str, ...]] = (
    r"\b(?:minimum|min\.|at\s+least|more\s+than|over|greater\s+than|no\s+less\s+than|a\s+minimum\s+of|minimum\s+of)\s+(?:of\s+)?(\d+\s*[-–—]\s*\d+|\d+\s*\+|\d+)\s*\+?\s*(?:years?|yrs?\.?)\s*(?:'|’)?(?:\s+of)?(?:\s+(?:relevant|related|professional|work|hands-on|direct|prior|industry))?[\s,]*(?:experienc[a-z]*|experien\b|experi[a-z]{3,})\b",
    r"\b(\d+\s*[-–—]\s*\d+|\d+\s*\+|\d+)\s*\+?\s*(?:years?|yrs?\.?)\s*(?:'|’)(?:\s+of)?\s*(?:experienc[a-z]*|experien\b|experi[a-z]{3,})\b",
    r"\b(\d+\s*[-–—]\s*\d+|\d+\s*\+|\d+)\s*\+?\s*(?:years?|yrs?\.?)\s*(?:'|’)?(?:\s+of)?(?:\s+(?:relevant|related|professional|work|hands-on|direct))?[\s,]*(?:experienc[a-z]*|of\s+(?:experien\b|experi[a-z]{3,}))\b",
    r"\b\d+\s+or\s+more\s+(?:years?|yrs?\.?)(?:\s+of)?(?:\s+(?:relevant|professional|work))?[\s,]*(?:experienc[a-z]*|experien\b|experi[a-z]{3,})\b",
    r"\b\d+\s*yrs?\.?\s+or\s+more\s+(?:experienc[a-z]*|experien\b|experi[a-z]{3,})\b",
    r"\b\d+\s*\+\s*(?:years?|yrs?\.?)(?:'|’)?\s+of\b",
    r"\bbetween\s+\d+\s+and\s+\d+\s+years?(?:\s+of)?(?:\s+(?:relevant|professional|work))?[\s,]*(?:experienc[a-z]*|experien\b|experi[a-z]{3,})?\b",
    r"\bexperienc[a-z]*\s*[:-]?\s*(?:of|with)?\s*(?:at\s+least\s+|minimum\s+|a\s+minimum\s+of\s+)?(\d+\s*[-–—]\s*\d+|\d+\s*\+|\d+)\s*\+?\s*(?:years?|yrs?\.?)\b",
    r"\b(?:\d+\s*[-–—]\s*\d+|\d+\s*\+|\d+)\s*\+?\s*(?:years?|yrs?\.?)\s+(?:in|with)(?:\s+a)?\s+(?:similar|comparable|related|corresponding)\s+(?:role|position|field|environment|capacity)\b",
    r"\b(?:proven|solid|strong)\s+(?:track\s+record|background)(?:\s+with)?\s*(?:of\s+)?(\d+\s*[-–—]\s*\d+|\d+\s*\+|\d+)\s*\+?\s*(?:years?|yrs?\.?)\b",
    r"\b\d+\s*\+\s*(?:years?|yrs?\.?)\s+(?:working|developing|building|designing|shipping|leading|managing)\b",
    r"\b\d+\s*months?(?:\s+of)?\s+(?:experienc[a-z]*|experien\b|experi[a-z]{3,})\b",
    r"\b\d+\s*\+\s*(?:years?|yrs?\.?)\s+(?:required|preferred|desired|mandatory)\b",
    r"\b\d+\s*\+\s*(?:years?|yrs?\.?)\s*\(?yoe\)?\b",
    r"\b(?:yoe|y\.\s*o\.\s*e\.)\s*[:-]?\s*(?:\d+\s*[-–—]\s*\d+|\d+)\s*\+\b",
    r"\b(?:yoe|y\.\s*o\.\s*e\.)\s*[:-]?\s*(?:\d+\s*[-–—]\s*\d+|\d+)\s*(?:years?|yrs?\.?)\b",
)

_EXPERIENCE_SCANNERS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(src, re.IGNORECASE) for src in _EXPERIENCE_SCANNER_SOURCES
)

_DIGIT_RUN: Final[re.Pattern[str]] = re.compile(r"\d+")


def composeRestrictionStyleText(job: object) -> str:
    """Concatenate fields scanned for restrictions and experience (ingest + API pre-check)."""
    if not isinstance(job, dict):
        return ""
    parts = (
        str(job.get("title") or "").strip(),
        str(job.get("visaOrMatchNote") or "").strip(),
        str(job.get("jobResponsibility") or "").strip(),
        str(job.get("jobDescription") or "").strip(),
    )
    return "\n".join(p for p in parts if p)


def _normalizeExperienceSnippet(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def findJobDescriptionExperienceTags(body: str | None) -> list[str]:
    """Distinct matched snippets in document order (mirrors frontend findJobDescriptionExperienceTags)."""
    text = (body or "").strip()
    if not text:
        return []
    byKey: dict[str, tuple[int, str]] = {}
    for pattern in _EXPERIENCE_SCANNERS:
        for m in pattern.finditer(text):
            display = _normalizeExperienceSnippet(m.group(0))
            if not display:
                continue
            key = display.lower()
            idx = m.start()
            prev = byKey.get(key)
            if prev is None or idx < prev[0]:
                byKey[key] = (idx, display)
    ordered = sorted(byKey.values(), key=lambda t: (t[0], t[1]))
    return [display for _, display in ordered]


def maxNumericFromExperienceTag(tag: str) -> int | None:
    """Largest integer from digit runs in the snippet (same heuristic as JobDetailPane chips)."""
    nums = [int(x) for x in _DIGIT_RUN.findall(tag) if x.isdigit()]
    if not nums:
        return None
    return max(nums)


def experienceTagImpliesAboveFiveYears(tag: str) -> bool:
    """True when the tag's max parsed whole number is five or more (outside 1–4 YoE target)."""
    hi = maxNumericFromExperienceTag(tag)
    return hi is not None and hi >= 5


def scanTextImpliesExperienceAboveFive(text: str | None) -> bool:
    """True if any experience-style tag implies five or more years (outside 1–4 YoE target)."""
    for tag in findJobDescriptionExperienceTags(text):
        if experienceTagImpliesAboveFiveYears(tag):
            return True
    return False


def jobImpliesExperienceAboveFive(job: object) -> bool:
    return scanTextImpliesExperienceAboveFive(composeRestrictionStyleText(job))


def findRestrictionTagsForJob(job: object) -> list[str]:
    """
    Human-readable labels for restriction matches (citizenship, sponsorship, clearance, etc.)
    plus years-of-experience outside the 1–4 target (≥5 detected). Empty list means no local blockers.
    """
    if not isinstance(job, dict):
        return []
    text = composeRestrictionStyleText(job)
    if not text:
        return []
    labels: set[str] = set()
    for regex, label in RESTRICTION_SCANNERS:
        if regex.search(text):
            labels.add(label)
    if labels and "Clearance" in labels and (
        "Secret clearance" in labels
        or "Top secret / TS" in labels
        or "Public trust" in labels
    ):
        labels.discard("Clearance")
    if scanTextImpliesExperienceAboveFive(text):
        labels.add("Requires 5+ years experience — outside 1–4 YoE target (detected)")
    return sorted(labels)


# --- UI accept / reject + Midhtech submit ---

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

    blockTags = findRestrictionTagsForJob(job)
    if blockTags:
        print(
            f"[accept] Pre-check blocked (local rules): {', '.join(blockTags)}",
            flush=True,
        )
        steps.append(
            buildStep(
                "precheck",
                False,
                f"Blocked by local rules: {', '.join(blockTags)}",
            )
        )
        revertApplyingToApply(job_id_str)
        st = getApplyStatusUpperByJobId(job_id_str)
        return _base_response(
            ok=False,
            decision=decision,
            steps=steps,
            apply_status_updated=None,
            error="This job matches a local restriction or requires 5+ years experience (outside 1–4 YoE target) and cannot be submitted.",
            db_apply_status=st,
            skipped_reason=None,
        )

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
