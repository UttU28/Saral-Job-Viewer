import json
import os
import sys
import time
import traceback

from utils.dataManager import (
    deleteJobsByApplyStatusNotIn,
    deletePastDataOlderThanHours,
    jobDataApplyStatusSummary,
    loadAllJobs,
    loadJobsByApplyStatus,
    loadJobsWithEmptyApplyStatus,
    updateApplyStatusByJobId,
)
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
PAST_DATA_RETENTION_HOURS = 48


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
    for i, job in enumerate(pending):
        jid = str(job.get("jobId") or "")
        plat = (str(job.get("platform") or "") or "?").strip()
        head = f"[{i + 1}/{total}] {plat} {_displayJobId(jid)}"
        try:
            checkResp, parsed = postJobCheck(session, checkUrl, suggestUrl, csrfToken, job)
            if not isinstance(parsed, dict):
                snippet = (checkResp.text or "").strip().replace("\n", " ")[:120]
                extra = f" — {snippet}" if snippet else ""
                log.warning(f"{head} → non-JSON HTTP {checkResp.status_code}{extra}")
                continue
            if not bool(parsed.get("ok")):
                ex_ok, ex_st = maybePersistExistingFromMaasErrors(job, parsed, quiet=True)
                if ex_ok:
                    written += 1
                    badge = formatApplyStatusBadge(ex_st or APPLY_STATUS_EXISTING)
                    log.info(f"{head} → {badge}")
                    continue
                errs = parsed.get("errors")
                if isinstance(errs, dict) and errs:
                    err_blob = json.dumps(errs, ensure_ascii=False)
                    if len(err_blob) > 160:
                        err_blob = err_blob[:157] + "…"
                    log.warning(f"{head} → check ok=false {err_blob}")
                else:
                    detail = parsed.get("detail") or parsed.get("message") or parsed.get("error")
                    if detail:
                        log.warning(f"{head} → check ok=false: {detail!r}")
                    else:
                        raw = (checkResp.text or "").strip().replace("\n", " ")[:160]
                        log.warning(
                            f"{head} → check ok=false HTTP {checkResp.status_code}"
                            + (f" — {raw}" if raw else "")
                        )
                continue
            cl_ok, cl_st = maybePersistClassifierApplyStatus(job, parsed, quiet=True)
            if cl_ok:
                written += 1
                badge = formatApplyStatusBadge(cl_st or "")
                log.info(f"{head} → {badge}")
            else:
                log.warning(f"{head} → ok response but no applyStatus written (no decision?)")
        except KeyboardInterrupt:
            raise
        except Exception:
            log.error(f"{head} → exception (traceback below)")
            traceback.print_exc()
        if delaySec > 0:
            time.sleep(delaySec)

    log.info(f"Done. Wrote applyStatus for {written} job(s).")


def cleanupKeepOnlyApply() -> int:
    """
    Delete rows with a set applyStatus other than APPLY (e.g. DO_NOT_APPLY, EXISTING).
    Keeps NULL/blank applyStatus (still pending) and APPLY. Prunes stale pastData.
    """
    deleted = deleteJobsByApplyStatusNotIn((KEEP_STATUS,))
    keptAfter = loadJobsByApplyStatus(KEEP_STATUS)
    print(
        f"Cleanup complete: deleted {deleted} classified non-{KEEP_STATUS} row(s); "
        f"{len(keptAfter)} {KEEP_STATUS} row(s) in jobData "
        "(NULL/blank applyStatus rows were kept)."
    )
    pruned = deletePastDataOlderThanHours(hours=PAST_DATA_RETENTION_HOURS)
    print(
        f"pastData: deleted {pruned} row(s) older than {PAST_DATA_RETENTION_HOURS}h (UTC), "
        "unparseable or blank timestamps kept."
    )
    return deleted


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
    total = len(applyJobs)
    for i, job in enumerate(applyJobs, start=1):
        jobId = str(job.get("jobId") or "").strip()
        title = str(job.get("title") or "").strip()
        company = str(job.get("companyName") or "").strip()
        jid = _displayJobId(jobId)
        head = f"[{i}/{total}] submit {jid} :: {company} :: {title}"
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
        f"{formatApplyStatusBadge(STATUS_REDO)}: {redo}"
    )
    return applied


def runValidatePushCleanupPipeline() -> None:
    """
    1) Validate all pending (applyStatus NULL) via check API.
    2) Push all APPLY rows to midhtech suggest.
    3) Delete classified non-APPLY rows (keep NULL/blank pending + APPLY); prune pastData.
    """
    print("--- Phase 1: validate (NULL applyStatus) ---")
    syncEmptyApplyStatuses()
    print("--- Phase 2: push APPLY to midhtech.in ---")
    pushApplyJobsAfterValidate()
    print("--- Phase 3: cleanup jobData + prune pastData ---")
    cleanupKeepOnlyApply()


def _parseDelay(raw: str | None) -> float:
    if not raw:
        return 0.0
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 0.0


def showDatabaseStatusReport() -> None:
    """Print jobData / pastData counts by applyStatus (option 4)."""
    log = ScraperRunLog(PLATFORM_MIDHTECH, "stats", mirrorToScrapeLog=False)
    s = jobDataApplyStatusSummary()
    log.info("── jobData (MongoDB) ──")
    log.info(f"  Total rows:           {s['total']}")
    log.info(f"  NULL / pending:       {s['nullPending']}")
    log.info(
        f"  APPLY:                {s['apply']}  "
        f"({formatApplyStatusBadge('APPLY')})"
    )
    log.info(
        f"  DO_NOT_APPLY:         {s['doNotApply']}  "
        f"({formatApplyStatusBadge('DO_NOT_APPLY')})"
    )
    log.info(
        f"  EXISTING:             {s['existing']}  "
        f"({formatApplyStatusBadge('EXISTING')})"
    )
    if s["otherStatus"]:
        log.info(f"  Other applyStatus:    {s['otherStatus']}  (APPLIED, REDO, …)")
    log.info(f"── pastData ──")
    log.info(f"  Total rows:           {s['pastDataRows']}")


def promptMenu() -> str | None:
    print()
    print("  1  Validate all pending (applyStatus NULL -> check API, FIFO)")
    print("  2  Delete classified non-APPLY rows (keep NULL / empty / APPLY; cleanup + pastData)")
    print("  3  Push all APPLY jobs to API, then same cleanup as 2 (suggest + cleanup)")
    print("  4  Show DB status (totals: jobs, APPLY, DO_NOT_APPLY, EXISTING, NULL, pastData)")
    print("  q  Quit")
    while True:
        raw = input("Choose 1, 2, 3, 4, or q: ").strip().lower()
        if raw in ("q", "quit", ""):
            return None
        if raw in ("1", "2", "3", "4"):
            return raw
        print("Invalid choice. Enter 1, 2, 3, 4, or q.")


def _parseCliChoice(argv: list[str]) -> str | None:
    """
    If the first argument is -1..-4 (or 1..4), return normalized '1'..'4'.
    If there are no arguments, return None → caller shows interactive menu.
    """
    if len(argv) < 2:
        return None
    raw = argv[1].strip()
    if raw in ("-h", "--help"):
        print(
            "Usage: python dValidate.py [-1|-2|-3|-4]\n\n"
            "  -1  Validate all pending (applyStatus NULL -> check API, FIFO)\n"
            "  -2  Delete classified non-APPLY rows; cleanup + pastData prune\n"
            "  -3  Push all APPLY jobs to suggest API, then same cleanup as -2\n"
            "  -4  Show DB status (counts by applyStatus, pastData)\n\n"
            "With no arguments, an interactive menu is shown."
        )
        raise SystemExit(0)
    mapping = {
        "-1": "1",
        "-2": "2",
        "-3": "3",
        "-4": "4",
        "1": "1",
        "2": "2",
        "3": "3",
        "4": "4",
    }
    if raw in mapping:
        return mapping[raw]
    print(
        f"Unknown argument: {raw!r}. Use -1, -2, -3, -4, or run with no arguments for the menu.\n"
        "Try: python dValidate.py --help",
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
    if choice == "1":
        syncEmptyApplyStatuses()
    elif choice == "2":
        cleanupKeepOnlyApply()
    elif choice == "3":
        pushApplyJobsAfterValidate()
        cleanupKeepOnlyApply()
    else:
        showDatabaseStatusReport()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
