import json
import os
import re
import time
import traceback
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from dotenv import load_dotenv

from utils.dataManager import (
    deleteJobsByApplyStatusNotIn,
    deletePastDataOlderThanHours,
    jobDataApplyStatusSummary,
    loadAllJobs,
    loadJobsByApplyStatus,
    loadJobsWithEmptyApplyStatus,
    updateApplyStatusByJobId,
)
from utils.scraperTerminalLog import (
    PLATFORM_MIDHTECH,
    ScraperRunLog,
    formatApplyStatusBadge,
    formatPushResultSuffix,
)
from utils.urlCleaner import normalizeCompanyName


SCRIPT_DIR = Path(__file__).resolve().parent


def _displayJobId(jobId: str, maxLen: int = 44) -> str:
    j = (jobId or "").strip()
    if len(j) <= maxLen:
        return j
    return j[: maxLen - 1] + "…"


def loadEnvironment() -> None:
    envPath = SCRIPT_DIR / ".env"
    load_dotenv(envPath, override=False)


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


def classifierApplyStatusFromResponse(parsed: dict) -> str:
    """Prefer classifier_decision; fall back to decision."""
    for key in ("classifier_decision", "decision"):
        raw = parsed.get(key)
        if raw is None:
            continue
        text = str(raw).strip()
        if text:
            return text
    return ""


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


def _flattenDrfErrors(errs: object) -> list[str]:
    if not isinstance(errs, dict):
        return []
    out: list[str] = []
    for v in errs.values():
        if isinstance(v, list):
            for item in v:
                if item is not None:
                    t = str(item).strip()
                    if t:
                        out.append(t)
        else:
            if v is not None:
                t = str(v).strip()
                if t:
                    out.append(t)
    return out


def errorsIndicateMaasExistingOrDuplicate(errs: object) -> bool:
    """MAAS /check/ validation: job or suggestion already exists."""
    needles = (
        "already exists in maas",
        "job already exists for this company and title",
        "duplicate suggestion detected",
        "this job url was already suggested",
        "this job url already exists",
    )
    for msg in _flattenDrfErrors(errs):
        low = msg.lower()
        if any(n in low for n in needles):
            return True
    return False


APPLY_STATUS_EXISTING = "EXISTING"
KEEP_STATUS = "APPLY"
STATUS_APPLIED = "APPLIED"
STATUS_REDO = "REDO"
PAST_DATA_RETENTION_HOURS = 48


def inferCloudSpecialization(blobText: str) -> str:
    blob = blobText.lower()
    if "aws" in blob or "eks" in blob:
        return "aws"
    if "azure" in blob or "aks" in blob:
        return "azure"
    if "gcp" in blob or "google cloud" in blob:
        return "gcp"
    return ""


def mapSenioritySelect(value: str | None) -> str:
    if not value:
        return ""
    lowered = value.lower()
    if "lead" in lowered or "principal" in lowered:
        return "lead"
    if "senior" in lowered:
        return "senior"
    if "mid" in lowered:
        return "mid"
    if "junior" in lowered or "entry" in lowered or "intern" in lowered:
        return "junior"
    return ""


def mapExperienceLevel(exp: str | None) -> str:
    if not exp:
        return ""
    match = re.search(r"(\d+)\s*\+?", exp)
    if match:
        years = int(match.group(1))
        if years <= 2:
            return "0-2"
        if years <= 4:
            return "2-4"
        if years <= 6:
            return "4-6"
        return "6+"
    if "entry" in exp.lower():
        return "0-2"
    return ""


def mapJobType(employment: str | None) -> str:
    if not employment:
        return ""
    normalized = employment.strip().lower()
    for option in ("Full-time", "Contract", "Part-time", "Internship"):
        if normalized == option.lower():
            return option
    return ""


def buildLocationWorkType(job: dict) -> str:
    location = (job.get("location") or "").strip()
    workModel = (job.get("workModel") or "").strip()
    employmentType = (job.get("employmentType") or "").strip()
    parts = [location] if location else []
    tail = " · ".join(item for item in (workModel, employmentType) if item)
    if tail:
        parts.append(tail)
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return " — ".join(parts)


def buildJobDescription(job: dict) -> str:
    return (job.get("jobDescription") or "").strip()


def inferAtsPlatform(job: dict) -> str:
    rawUrl = (job.get("originalJobPostUrl") or job.get("jobUrl") or "").strip()
    if not rawUrl or " " in rawUrl:
        return ""
    blob = rawUrl.lower()
    mapping = [
        ("lever", "Lever"),
        ("greenhouse", "Greenhouse"),
        ("ashby", "Ashby"),
        ("workday", "Workday"),
        ("myworkdayjobs", "Workday"),
        ("icims", "iCIMS"),
        ("smartrecruiters", "SmartRecruiters"),
        ("jobvite", "Jobvite"),
        ("bamboohr", "BambooHR"),
        ("taleo", "Taleo"),
    ]
    for needle, label in mapping:
        if needle in blob:
            return label
    return ""


def certificationsRequired(jobDescription: str) -> bool:
    blob = jobDescription.lower()
    certMarkers = (
        "certification required",
        "certifications required",
        "must be certified",
        "aws certified",
        "azure certified",
        "google cloud certified",
        "ccnp",
        "rhce",
        "lpic",
        "security+",
        "cissp",
    )
    return any(marker in blob for marker in certMarkers)


def extractPostedOnDate(job: dict) -> str:
    candidates = [
        job.get("postedOn"),
        job.get("posted_on"),
        job.get("datePosted"),
        job.get("publishedAt"),
        job.get("postedDate"),
    ]
    for raw in candidates:
        if not raw:
            continue
        text = str(raw).strip()
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
            return text
        match = re.match(r"^(\d{4}-\d{2}-\d{2})T", text)
        if match:
            return match.group(1)
    return ""


def buildCheckPayload(job: dict) -> dict:
    jobDescription = buildJobDescription(job)
    originalOrSourceUrl = job.get("originalJobPostUrl") or job.get("jobUrl") or ""
    normalizedCompanyName = normalizeCompanyName(job.get("companyName") or "")
    inferBlob = " ".join(
        part for part in ((job.get("title") or "").strip(), jobDescription) if part
    )

    payload: dict[str, object] = {
        "title": str(job.get("title") or ""),
        "requirement_key": f"JR-{job.get('jobId', 'unknown')}",
        "url": str(originalOrSourceUrl),
        "company_name": normalizedCompanyName,
        "location_work_type": buildLocationWorkType(job),
        "cloud_specialization": inferCloudSpecialization(inferBlob),
        "seniority": mapSenioritySelect(job.get("seniority")),
        "source_label": "other",
        "job_description": jobDescription,
        "job_type": mapJobType(job.get("employmentType")),
        "experience_level": mapExperienceLevel(job.get("experience")),
        "posted_on": extractPostedOnDate(job),
        "ats_platform": "",
        "certifications_required": "on"
        if certificationsRequired(jobDescription)
        else "",
    }

    blob = inferBlob.lower()
    selectedClouds = [k for k in ("aws", "azure", "gcp") if k in blob]
    if selectedClouds:
        # Send as repeated form field values for checkbox/multi-select semantics.
        payload["additional_cloud_specializations"] = selectedClouds

    decisionPayload = job.get("decision_payload") or job.get("decisionPayload")
    if decisionPayload is not None:
        payload["decision_payload"] = (
            json.dumps(decisionPayload, ensure_ascii=False)
            if isinstance(decisionPayload, (dict, list))
            else str(decisionPayload)
        )
    return payload


def extractCsrfToken(html: str) -> str:
    inputMatch = re.search(
        r'name=["\']csrfmiddlewaretoken["\']\s+value=["\']([^"\']+)["\']',
        html,
        flags=re.IGNORECASE,
    )
    if inputMatch:
        return inputMatch.group(1).strip()
    return ""


def findCheckEndpoint(baseUrl: str, suggestUrl: str, html: str) -> str:
    # Try explicit check URLs in HTML/inline scripts first.
    urlMatches = re.findall(
        r"""['"]([^'"]*?/check/?(?:\?[^'"]*)?)['"]""",
        html,
        flags=re.IGNORECASE,
    )
    for match in urlMatches:
        candidate = match.strip()
        if not candidate:
            continue
        if candidate.startswith("http://") or candidate.startswith("https://"):
            return candidate
        if candidate.startswith("/"):
            return urljoin(baseUrl, candidate)
        return urljoin(suggestUrl, candidate)

    # Fallback if not discoverable.
    return urljoin(suggestUrl.rstrip("/") + "/", "check/")


def authenticateMidhtechSession() -> tuple[requests.Session, str, str, str, str]:
    """
    Log in and open the suggest page. Returns
    (session, baseUrl, suggestUrl, checkUrl, csrfToken).
    """
    loadEnvironment()

    baseUrl = os.getenv("MIDHTECH_BASE_URL", "https://midhtech.in/")
    loginUrl = os.getenv("MIDHTECH_LOGIN_URL", "https://midhtech.in/login/")
    suggestUrl = urljoin(baseUrl, "/jobs/suggest/")
    email = os.getenv("MIDHTECH_EMAIL")
    password = os.getenv("MIDHTECH_PASSWORD")

    if not email or not password:
        raise ValueError("Set MIDHTECH_EMAIL and MIDHTECH_PASSWORD in .env")

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        }
    )

    loginGet = session.get(loginUrl, timeout=30)
    loginGet.raise_for_status()

    csrfToken = extractCsrfToken(loginGet.text) or session.cookies.get("csrftoken", "")
    if not csrfToken:
        raise ValueError("Could not find CSRF token on login page.")

    loginPayload = {
        "username": email,
        "password": password,
        "trustDevice": "on",
        "csrfmiddlewaretoken": csrfToken,
    }
    headers = {
        "Referer": loginUrl,
        "X-CSRFToken": csrfToken,
    }

    loginPost = session.post(
        loginUrl,
        data=loginPayload,
        headers=headers,
        allow_redirects=True,
        timeout=30,
    )
    loginPost.raise_for_status()

    currentPath = urlparse(loginPost.url).path.rstrip("/")
    if currentPath == "/login":
        raise ValueError("Login appears to have failed (still on /login).")
    suggestGet = session.get(suggestUrl, timeout=30)
    suggestGet.raise_for_status()

    csrfToken = extractCsrfToken(suggestGet.text) or session.cookies.get("csrftoken", "")
    if not csrfToken:
        raise ValueError("Could not find CSRF token on suggest page.")

    checkUrl = findCheckEndpoint(baseUrl, suggestUrl, suggestGet.text)
    return session, baseUrl, suggestUrl, checkUrl, csrfToken


def postJobCheck(
    session: requests.Session,
    checkUrl: str,
    suggestUrl: str,
    csrfToken: str,
    job: dict,
) -> tuple[requests.Response, object]:
    checkPayload = buildCheckPayload(job)
    checkPayload["csrfmiddlewaretoken"] = csrfToken
    checkHeaders = {
        "Referer": suggestUrl,
        "X-CSRFToken": csrfToken,
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/plain, */*",
    }
    checkResp = session.post(
        checkUrl,
        data=checkPayload,
        headers=checkHeaders,
        timeout=30,
    )
    parsed: object = None
    try:
        parsed = checkResp.json()
    except Exception:
        parsed = None
    return checkResp, parsed


def _responseLooksSuccessful(resp: requests.Response) -> bool:
    if resp.status_code < 200 or resp.status_code >= 400:
        return False
    return "/login" not in (resp.url or "")


def submitJobSuggestion(
    session: requests.Session,
    suggestUrl: str,
    csrfToken: str,
    job: dict,
) -> tuple[bool, str]:
    payload = buildCheckPayload(job)
    payload["csrfmiddlewaretoken"] = csrfToken
    headers = {
        "Referer": suggestUrl,
        "X-CSRFToken": csrfToken,
    }
    response = session.post(
        suggestUrl,
        data=payload,
        headers=headers,
        allow_redirects=True,
        timeout=30,
    )
    ok = _responseLooksSuccessful(response)
    body = (response.text or "").strip()
    if not ok:
        preview = body[:300] if body else "<empty>"
        return False, f"HTTP {response.status_code} at {response.url} :: {preview}"
    return True, f"HTTP {response.status_code}"


def printCheckSummary(checkResp: requests.Response, parsed: object) -> None:
    try:
        if isinstance(parsed, dict):
            ok = bool(parsed.get("ok"))
            statusLabel = "success" if ok else "error"
            print("Check response:")
            summary: dict[str, object] = {
                "http_status": checkResp.status_code,
                "status": statusLabel,
                "ok": parsed.get("ok"),
            }
            summary["decision"] = parsed.get("decision", "")
            summary["classifier_decision"] = parsed.get("classifier_decision", "")
            summary["intake_route"] = parsed.get("intake_route", "")
            summary["cloud_specialization"] = parsed.get("cloud_specialization", "")
            summary["seniority"] = parsed.get("seniority", "")
            summary["block_codes"] = parsed.get("block_codes", []) or []
            summary["red_flags"] = parsed.get("red_flags", []) or []
            summary["next_steps"] = parsed.get("next_steps", []) or []

            readiness = parsed.get("readiness_summary")
            if isinstance(readiness, dict):
                summary["readiness"] = {
                    "percent": readiness.get("percent"),
                    "passed": readiness.get("passed"),
                    "total": readiness.get("total"),
                    "blocking_ok": readiness.get("blocking_ok"),
                    "matched_roles": readiness.get("matched_roles", []) or [],
                }
            else:
                summary["readiness"] = {}
            summary["errors"] = parsed.get("errors", {}) or {}
            print(json.dumps(summary, indent=2, ensure_ascii=False))
            return
    except Exception:
        pass
    print("Check response:")
    print(
        json.dumps(
            {
                "http_status": checkResp.status_code,
                "status": "raw",
                "body": (checkResp.text.strip() or "<empty>"),
            },
            indent=2,
            ensure_ascii=False,
        )
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
    log.info("── jobData (saralJobViewer.db) ──")
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
        log.info(f"  Other applyStatus:    {s['otherStatus']}  (APPLIED, REDO, legacy, …)")
    log.info(f"── pastData ──")
    log.info(f"  Total rows:           {s['pastDataRows']}")


def promptMenu() -> str | None:
    print()
    print("  1  Validate all pending (applyStatus NULL → check API, FIFO)")
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


def main() -> int:
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
