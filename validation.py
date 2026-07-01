import json
import os
import sys
import time

import requests

from utils.dataManager import (
    deleteJobsKeepingOnlyApply,
    deletePastDataOlderThanHours,
    loadAllJobs,
    loadJobsByApplyStatus,
    loadJobsWithEmptyApplyStatus,
    updateApplyStatusByJobId,
)
from utils.jobDecisionService import findRestrictionTagsForJob
from utils.midhtechSuggestApi import (
    authenticateMidhtechSession,
    buildCheckPayload,
    classifierApplyStatusFromResponse,
    errorsIndicateMaasExistingOrDuplicate,
    postJobCheck,
    printCheckSummary,
    submitJobSuggestion,
)
from utils.scraperTerminalLog import (
    PLATFORM_MIDHTECH,
    ScraperRunLog,
    formatApplyStatusBadge,
    formatPushResultSuffix,
)


def _displayJobId(jobId: str, maxLen: int = 44) -> str:
    j = (jobId or "").strip()
    if len(j) <= maxLen:
        return j
    return j[: maxLen - 1] + "…"


def loadJobAtIndex(jobIndex: int = 0) -> dict:
    jobs = loadAllJobs()
    if not jobs:
        raise ValueError("No jobs found in database (jobData).")
    if jobIndex < 0 or jobIndex >= len(jobs):
        raise ValueError(f"job index out of range: {jobIndex} (jobs: {len(jobs)})")
    job = jobs[jobIndex]
    if not isinstance(job, dict):
        raise ValueError(f"Job at index {jobIndex} must be an object")
    return job


def normalizeClassifierDecisionForDb(raw: str) -> str:
    """Canonical labels in DB (apply -> APPLY; hold / do_not_apply -> DO_NOT_APPLY)."""
    s = (raw or "").strip()
    if not s:
        return ""
    key = s.lower().replace(" ", "_").replace("-", "_")
    if key == "apply":
        return "APPLY"
    if key in ("do_not_apply", "donotapply", "hold"):
        return "DO_NOT_APPLY"
    return s.upper().replace(" ", "_")


APPLY_STATUS_EXISTING = "EXISTING"
KEEP_STATUS = "APPLY"
STATUS_APPLIED = "APPLIED"
STATUS_REDO = "REDO"
DEFAULT_CONSECUTIVE_CHECK_ABORT = 3
EXIT_CONSECUTIVE_CHECK_ABORT = 3


class ConsecutiveCheckFailureAbort(Exception):
    """Raised when the same check API failure repeats enough times to stop the batch."""

    def __init__(self, message: str, *, count: int, limit: int):
        super().__init__(message)
        self.count = count
        self.limit = limit


def _consecutiveCheckAbortLimit() -> int:
    raw = os.getenv("MIDHTECH_CHECK_ABORT_AFTER_CONSECUTIVE_ERRORS")
    if not raw:
        return DEFAULT_CONSECUTIVE_CHECK_ABORT
    try:
        return max(1, int(raw))
    except ValueError:
        return DEFAULT_CONSECUTIVE_CHECK_ABORT


def extractCheckFailureMessage(parsed: object, checkResp) -> str:
    """Stable error text for logging and consecutive-failure matching."""
    if isinstance(parsed, dict):
        errs = parsed.get("errors")
        if isinstance(errs, dict) and errs:
            return json.dumps(errs, ensure_ascii=False, sort_keys=True)
        detail = parsed.get("detail") or parsed.get("message") or parsed.get("error")
        if detail is not None:
            text = str(detail).strip()
            if text:
                return text
    raw = (checkResp.text or "").strip().replace("\n", " ")[:200]
    if raw:
        return f"HTTP {checkResp.status_code}: {raw}"
    return f"HTTP {checkResp.status_code} non-JSON or empty body"


class _ConsecutiveFailureTracker:
    def __init__(self, limit: int):
        self.limit = limit
        self._last: str | None = None
        self._count = 0

    def reset(self) -> None:
        self._last = None
        self._count = 0

    def record(self, message: str) -> None:
        if message == self._last:
            self._count += 1
        else:
            self._last = message
            self._count = 1
        if self._count >= self.limit:
            raise ConsecutiveCheckFailureAbort(
                f"Aborting after {self._count} consecutive identical check failure(s): "
                f"{message!r}",
                count=self._count,
                limit=self.limit,
            )


def maybePersistClassifierApplyStatus(
    job: dict, parsed: dict, *, quiet: bool = False
) -> tuple[bool, str | None]:
    """
    If the check JSON is OK and we have a classifier decision string, write applyStatus in SQLite.
    Decisions are normalized (e.g. apply -> APPLY).
    Returns (updated_in_db, status_string_or_none).
    """
    if not isinstance(parsed, dict) or not bool(parsed.get("ok")):
        return False, None
    raw = classifierApplyStatusFromResponse(parsed)
    applyStatus = normalizeClassifierDecisionForDb(raw)
    if not applyStatus:
        return False, None
    jobId = str(job.get("jobId") or "").strip()
    if not jobId:
        return False, None
    if updateApplyStatusByJobId(jobId, applyStatus):
        if not quiet:
            print(f"Updated applyStatus for jobId={jobId!r} -> {applyStatus!r}")
        return True, applyStatus
    if not quiet:
        print(f"No DB row updated for jobId={jobId!r} (missing job?)")
    return False, None


def maybePersistExistingFromMaasErrors(
    job: dict, parsed: dict, *, quiet: bool = False
) -> tuple[bool, str | None]:
    """When /check/ returns duplicate/existing MAAS errors, set applyStatus to EXISTING."""
    if not isinstance(parsed, dict) or bool(parsed.get("ok")):
        return False, None
    errs = parsed.get("errors")
    if not errorsIndicateMaasExistingOrDuplicate(errs):
        return False, None
    jobId = str(job.get("jobId") or "").strip()
    if not jobId:
        return False, None
    if updateApplyStatusByJobId(jobId, APPLY_STATUS_EXISTING):
        if not quiet:
            print(
                f"Updated applyStatus for jobId={jobId!r} -> {APPLY_STATUS_EXISTING!r} "
                "(MAAS duplicate / already exists)"
            )
        return True, APPLY_STATUS_EXISTING
    if not quiet:
        print(f"No DB row updated for jobId={jobId!r} (missing job?)")
    return False, None


def loginAndCheck(jobIndex: int = 0) -> None:
    """Log in, POST one job (FIFO index in jobData), print summary, persist applyStatus if ok."""
    session, _baseUrl, suggestUrl, checkUrl, csrfToken = authenticateMidhtechSession()

    job = loadJobAtIndex(jobIndex)
    preTags = findRestrictionTagsForJob(job)
    if preTags:
        print(
            "Skipping Midhtech check — local pre-check matched:",
            ", ".join(preTags),
        )
        return

    print("Check request:")
    preview = buildCheckPayload(job)
    print(
        json.dumps(
            {
                "endpoint": checkUrl,
                "jobId": job.get("jobId"),
                "platform": job.get("platform"),
                "title": preview.get("title", ""),
                "company_name": preview.get("company_name", ""),
                "url": preview.get("url", ""),
            },
            indent=2,
            ensure_ascii=False,
        )
    )

    checkResp, parsed = postJobCheck(session, checkUrl, suggestUrl, csrfToken, job)
    printCheckSummary(checkResp, parsed)
    if isinstance(parsed, dict):
        maybePersistClassifierApplyStatus(job, parsed, quiet=False)
        maybePersistExistingFromMaasErrors(job, parsed, quiet=False)


def syncEmptyApplyStatuses() -> None:
    """
    FIFO (oldest timestamp first): every job in jobData with applyStatus IS NULL,
    all platforms. Optional delay between requests: MIDHTECH_SYNC_DELAY_SEC in .env.
    Aborts early when the same /check/ failure repeats
    MIDHTECH_CHECK_ABORT_AFTER_CONSECUTIVE_ERRORS times (default 3).
    """
    log = ScraperRunLog(PLATFORM_MIDHTECH, "validate", mirrorToScrapeLog=False)
    delaySec = _parseDelay(os.getenv("MIDHTECH_SYNC_DELAY_SEC"))
    pending = loadJobsWithEmptyApplyStatus(None)
    if not pending:
        log.info("No jobs with applyStatus NULL (nothing pending).")
        return

    session, _baseUrl, suggestUrl, checkUrl, csrfToken = authenticateMidhtechSession()
    total = len(pending)
    log.info(
        f"Syncing applyStatus for {total} job(s) with NULL applyStatus (FIFO, all platforms)…",
    )

    written = 0
    rejectedPrecheck = 0
    processed = 0
    failureTracker = _ConsecutiveFailureTracker(_consecutiveCheckAbortLimit())
    try:
        for i, job in enumerate(pending):
            processed = i + 1
            jid = str(job.get("jobId") or "")
            plat = (str(job.get("platform") or "") or "?").strip()
            head = f"[{i + 1}/{total}] {plat} {_displayJobId(jid)}"
            try:
                preTags = findRestrictionTagsForJob(job)
                if preTags:
                    failureTracker.reset()
                    if updateApplyStatusByJobId(jid, "REJECTED"):
                        rejectedPrecheck += 1
                        log.warning(
                            f"{head} → {formatApplyStatusBadge('REJECTED')} local pre-check: "
                            f"{', '.join(preTags)}"
                        )
                    else:
                        log.warning(f"{head} → pre-check matched but no DB row updated for jobId={jid!r}")
                    continue

                checkResp, parsed = postJobCheck(session, checkUrl, suggestUrl, csrfToken, job)
                if not isinstance(parsed, dict):
                    failMsg = extractCheckFailureMessage(parsed, checkResp)
                    log.warning(f"{head} → non-JSON HTTP {checkResp.status_code} — {failMsg}")
                    failureTracker.record(failMsg)
                    continue
                if not bool(parsed.get("ok")):
                    ex_ok, ex_st = maybePersistExistingFromMaasErrors(job, parsed, quiet=True)
                    if ex_ok:
                        failureTracker.reset()
                        written += 1
                        badge = formatApplyStatusBadge(ex_st or APPLY_STATUS_EXISTING)
                        log.info(f"{head} → {badge}")
                        continue
                    failMsg = extractCheckFailureMessage(parsed, checkResp)
                    err_blob = failMsg if len(failMsg) <= 160 else failMsg[:157] + "…"
                    log.warning(f"{head} → check ok=false: {err_blob!r}")
                    failureTracker.record(failMsg)
                    continue
                cl_ok, cl_st = maybePersistClassifierApplyStatus(job, parsed, quiet=True)
                if cl_ok:
                    failureTracker.reset()
                    written += 1
                    badge = formatApplyStatusBadge(cl_st or "")
                    log.info(f"{head} → {badge}")
                else:
                    failMsg = "ok response but no applyStatus written (no decision?)"
                    log.warning(f"{head} → {failMsg}")
                    failureTracker.record(failMsg)
            except ConsecutiveCheckFailureAbort:
                raise
            except KeyboardInterrupt:
                raise
            except requests.RequestException as exc:
                log.error(f"{head} → network error: {exc}")
            except Exception as exc:
                log.error(f"{head} → exception: {exc}")
            if delaySec > 0:
                time.sleep(delaySec)
    except ConsecutiveCheckFailureAbort as exc:
        _logConsecutiveCheckAbort(
            log,
            exc,
            written=written,
            rejectedPrecheck=rejectedPrecheck,
            processed=processed,
            total=total,
        )
        raise

    log.info(
        f"Done. Wrote applyStatus from classifier/MAAS for {written} job(s); "
        f"REJECTED from local pre-check (restrictions / 6+ years experience): {rejectedPrecheck}."
    )


def _logConsecutiveCheckAbort(log: ScraperRunLog, exc: ConsecutiveCheckFailureAbort, *, written: int, rejectedPrecheck: int, processed: int, total: int) -> None:
    remaining = max(0, total - processed)
    log.error(str(exc))
    log.error(
        f"Stopped validation early ({processed}/{total} processed, {remaining} skipped). "
        f"Classifier writes={written}; local REJECTED={rejectedPrecheck}. "
        f"Fix the Midhtech check API or set MIDHTECH_CHECK_ABORT_AFTER_CONSECUTIVE_ERRORS "
        f"to change the abort threshold (current limit={exc.limit})."
    )


def pushApplyJobsAfterValidate() -> int:
    """Submit rows with applyStatus APPLY to suggest endpoint; set APPLIED or REDO."""
    log = ScraperRunLog(PLATFORM_MIDHTECH, "suggest", mirrorToScrapeLog=False)
    applyJobs = loadJobsByApplyStatus(KEEP_STATUS)
    if not applyJobs:
        log.info("No APPLY jobs found to submit.")
        return 0

    log.info(f"Submitting {len(applyJobs)} APPLY job(s) to suggest endpoint...")
    session, _baseUrl, suggestUrl, _checkUrl, csrfToken = authenticateMidhtechSession()

    applied = 0
    redo = 0
    rejected = 0
    total = len(applyJobs)
    for i, job in enumerate(applyJobs, start=1):
        jobId = str(job.get("jobId") or "").strip()
        title = str(job.get("title") or "").strip()
        company = str(job.get("companyName") or "").strip()
        jid = _displayJobId(jobId)
        head = f"[{i}/{total}] submit {jid} :: {company} :: {title}"
        restrictionTags = findRestrictionTagsForJob(job)
        if restrictionTags:
            updateApplyStatusByJobId(jobId, "REJECTED")
            rejected += 1
            log.warning(
                f"{head} → {formatApplyStatusBadge('REJECTED')} local restriction match: "
                f"{', '.join(restrictionTags)}"
            )
            continue
        try:
            success, info = submitJobSuggestion(
                session=session,
                suggestUrl=suggestUrl,
                csrfToken=csrfToken,
                job=job,
            )
        except Exception as exc:
            success = False
            info = f"exception: {exc}"

        suffix = formatPushResultSuffix(info)
        if success:
            updateApplyStatusByJobId(jobId, STATUS_APPLIED)
            applied += 1
            badge = formatApplyStatusBadge(STATUS_APPLIED)
            log.info(f"{head} → {badge} {suffix}")
        else:
            updateApplyStatusByJobId(jobId, STATUS_REDO)
            redo += 1
            badge = formatApplyStatusBadge(STATUS_REDO)
            log.warning(f"{head} → {badge} {suffix}")

    log.info("── suggest summary ──")
    log.info(
        f"  total: {total}  "
        f"{formatApplyStatusBadge(STATUS_APPLIED)}: {applied}  "
        f"{formatApplyStatusBadge(STATUS_REDO)}: {redo}  "
        f"{formatApplyStatusBadge('REJECTED')}: {rejected}"
    )
    return applied


def cleanupDeleteUnwantedPlusNullAndPastData(*, pastHours: float = 48) -> tuple[int, int]:
    """
    Match app.py action `delete_unwanted_plus_null_jobs`:
    - keep APPLY rows only in jobData (remove NULL/empty + all non-APPLY)
    - delete pastData rows older than `pastHours`
    """
    log = ScraperRunLog(PLATFORM_MIDHTECH, "cleanup", mirrorToScrapeLog=False)
    log.info("Running cleanup: keep APPLY only in jobData + trim old pastData…")
    deleted_jobs = int(deleteJobsKeepingOnlyApply())
    deleted_past = int(deletePastDataOlderThanHours(hours=pastHours))
    log.info(
        f"Cleanup done. jobData deleted={deleted_jobs}; "
        f"pastData older than {int(pastHours)}h deleted={deleted_past}."
    )
    return deleted_jobs, deleted_past


def _parseDelay(raw: str | None) -> float:
    if not raw:
        return 0.0
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 0.0


def promptMenu() -> str | None:
    print()
    print("  1  Validate all pending (applyStatus NULL -> check API, FIFO)")
    print("  2  Push all APPLY jobs to API (suggest)")
    print("  3  Cleanup (Delete Unwanted + NULL; pastData older than 48h)")
    print("  q  Quit")
    while True:
        raw = input("Choose 1, 2, 3, or q: ").strip().lower()
        if raw in ("q", "quit", ""):
            return None
        if raw in ("1", "2", "3"):
            return raw
        print("Invalid choice. Enter 1, 2, 3, or q.")


def _parseCliChoice(argv: list[str]) -> str | None:
    """
    If the first argument is -1..-3 (or 1..3), return normalized '1'..'3'.
    If there are no arguments, return None → caller shows interactive menu.
    """
    if len(argv) < 2:
        return None
    raw = argv[1].strip()
    if raw in ("-h", "--help"):
        print(
            "Usage: python validation.py [-1|-2|-3]\n\n"
            "  -1  Validate all pending (applyStatus NULL -> check API, FIFO)\n"
            "  -2  Push all APPLY jobs to suggest API\n\n"
            "  -3  Cleanup: Delete Unwanted + NULL (keep APPLY only) and "
            "delete pastData older than 48h\n\n"
            "With no arguments, an interactive menu is shown.\n\n"
            "Exit code 3: validation (-1) aborted after consecutive identical check failures "
            "(see MIDHTECH_CHECK_ABORT_AFTER_CONSECUTIVE_ERRORS)."
        )
        raise SystemExit(0)
    mapping = {
        "-1": "1",
        "-2": "2",
        "-3": "3",
        "1": "1",
        "2": "2",
        "3": "3",
    }
    if raw in mapping:
        return mapping[raw]
    print(
        f"Unknown argument: {raw!r}. Use -1, -2, -3, or run with no arguments for the menu.\n"
        "Try: python validation.py --help",
        file=sys.stderr,
    )
    raise SystemExit(2)


def main() -> int:
    choice = _parseCliChoice(sys.argv)
    if choice is None:
        choice = promptMenu()
    if choice is None:
        print("Cancelled.")
        return 0
    try:
        if choice == "1":
            syncEmptyApplyStatuses()
        elif choice == "2":
            pushApplyJobsAfterValidate()
        else:
            cleanupDeleteUnwantedPlusNullAndPastData(pastHours=48)
    except ConsecutiveCheckFailureAbort as exc:
        print(str(exc), file=sys.stderr)
        return EXIT_CONSECUTIVE_CHECK_ABORT
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

# deployTouch: 2026-05-10T16:11:17Z
