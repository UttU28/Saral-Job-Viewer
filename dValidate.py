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
    loadAllJobs,
    loadJobsWithEmptyApplyStatus,
    updateApplyStatusByJobId,
)
from utils.urlCleaner import normalizeCompanyName


SCRIPT_DIR = Path(__file__).resolve().parent


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
    (session, base_url, suggest_url, check_url, csrf_token).
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
) -> bool:
    """
    If the check JSON is OK and we have a classifier decision string, write applyStatus in SQLite.
    Decisions are normalized (e.g. apply -> APPLY).
    """
    if not isinstance(parsed, dict) or not bool(parsed.get("ok")):
        return False
    raw = classifierApplyStatusFromResponse(parsed)
    apply_status = normalizeClassifierDecisionForDb(raw)
    if not apply_status:
        return False
    job_id = str(job.get("jobId") or "").strip()
    if not job_id:
        return False
    if updateApplyStatusByJobId(job_id, apply_status):
        if quiet:
            print(f"  {apply_status}")
        else:
            print(f"Updated applyStatus for jobId={job_id!r} -> {apply_status!r}")
        return True
    if not quiet:
        print(f"No DB row updated for jobId={job_id!r} (missing job?)")
    return False


def maybePersistExistingFromMaasErrors(job: dict, parsed: dict, *, quiet: bool = False) -> bool:
    """When /check/ returns duplicate/existing MAAS errors, set applyStatus to EXISTING."""
    if not isinstance(parsed, dict) or bool(parsed.get("ok")):
        return False
    errs = parsed.get("errors")
    if not errorsIndicateMaasExistingOrDuplicate(errs):
        return False
    job_id = str(job.get("jobId") or "").strip()
    if not job_id:
        return False
    if updateApplyStatusByJobId(job_id, APPLY_STATUS_EXISTING):
        if quiet:
            print(f"  {APPLY_STATUS_EXISTING}")
        else:
            print(
                f"Updated applyStatus for jobId={job_id!r} -> {APPLY_STATUS_EXISTING!r} "
                "(MAAS duplicate / already exists)"
            )
        return True
    if not quiet:
        print(f"No DB row updated for jobId={job_id!r} (missing job?)")
    return False


def loginAndCheck(job_index: int = 0) -> None:
    """Log in, POST one job (FIFO index in jobData), print summary, persist applyStatus if ok."""
    session, _baseUrl, suggestUrl, checkUrl, csrfToken = authenticateMidhtechSession()

    job = loadJobAtIndex(job_index)
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
    delay_sec = _parse_delay(os.getenv("MIDHTECH_SYNC_DELAY_SEC"))
    pending = loadJobsWithEmptyApplyStatus(None)
    if not pending:
        print("No jobs with applyStatus NULL (nothing pending).")
        return

    session, _baseUrl, suggestUrl, checkUrl, csrfToken = authenticateMidhtechSession()
    print(f"Syncing applyStatus for {len(pending)} job(s) with NULL applyStatus (FIFO, all platforms)…")

    written = 0
    for i, job in enumerate(pending):
        jid = str(job.get("jobId") or "")
        plat = str(job.get("platform") or "")
        print(f"[{i + 1}/{len(pending)}] {plat} {jid}")
        try:
            checkResp, parsed = postJobCheck(session, checkUrl, suggestUrl, csrfToken, job)
            if not isinstance(parsed, dict):
                print(f"  error: non-JSON HTTP {checkResp.status_code}")
                body = (checkResp.text or "").strip()
                if body:
                    print(f"  response body:\n{body}")
                continue
            if not bool(parsed.get("ok")):
                if maybePersistExistingFromMaasErrors(job, parsed, quiet=True):
                    written += 1
                    continue
                print(f"  error: HTTP {checkResp.status_code} ok=false")
                errs = parsed.get("errors")
                if isinstance(errs, dict) and errs:
                    print(f"  {json.dumps(errs, indent=2, ensure_ascii=False)}")
                else:
                    detail = parsed.get("detail") or parsed.get("message") or parsed.get("error")
                    if detail:
                        print(f"  detail: {detail!r}")
                    else:
                        raw = (checkResp.text or "").strip()
                        if raw:
                            print(f"  response body:\n{raw}")
                continue
            if maybePersistClassifierApplyStatus(job, parsed, quiet=True):
                written += 1
        except KeyboardInterrupt:
            raise
        except Exception:
            print(f"  exception for jobId={jid!r} (full traceback follows):")
            traceback.print_exc()
        if delay_sec > 0:
            time.sleep(delay_sec)

    print(f"Done. Wrote applyStatus for {written} job(s).")


def _parse_delay(raw: str | None) -> float:
    if not raw:
        return 0.0
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 0.0


def _env_flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes")


if __name__ == "__main__":
    # Default: FIFO sync jobs where applyStatus IS NULL. MIDHTECH_SINGLE_JOB=1: one login + check (index 0).
    if _env_flag("MIDHTECH_SINGLE_JOB"):
        loginAndCheck(0)
    else:
        syncEmptyApplyStatuses()
