"""
Midhtech suggest/check API: session auth, CSRF, payload building, and HTTP calls.
Naming in this module uses camelCase for functions and locals per project convention.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from dotenv import load_dotenv

from utils.urlCleaner import normalizeCompanyName

repoRoot = Path(__file__).resolve().parent.parent


def loadMidhtechEnvironment() -> None:
    envPath = repoRoot / ".env"
    load_dotenv(envPath, override=False)


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

    return urljoin(suggestUrl.rstrip("/") + "/", "check/")


def authenticateMidhtechSessionWithCredentials(
    email: str,
    password: str,
) -> tuple[requests.Session, str, str, str, str]:
    """
    Log in with explicit credentials and open the suggest page. Returns
    (session, baseUrl, suggestUrl, checkUrl, csrfToken).
    Uses MIDHTECH_BASE_URL / MIDHTECH_LOGIN_URL from .env when set.
    """
    loadMidhtechEnvironment()

    baseUrl = os.getenv("MIDHTECH_BASE_URL", "https://midhtech.in/")
    loginUrl = os.getenv("MIDHTECH_LOGIN_URL", "https://midhtech.in/login/")
    suggestUrl = urljoin(baseUrl, "/jobs/suggest/")
    email = (email or "").strip()
    password = password or ""
    if not email or not password:
        raise ValueError("Email and password are required for Midhtech login.")

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


def authenticateMidhtechSession() -> tuple[requests.Session, str, str, str, str]:
    """
    Log in using MIDHTECH_EMAIL / MIDHTECH_PASSWORD from .env.
    Returns (session, baseUrl, suggestUrl, checkUrl, csrfToken).
    """
    loadMidhtechEnvironment()
    email = os.getenv("MIDHTECH_EMAIL")
    password = os.getenv("MIDHTECH_PASSWORD")
    if not email or not password:
        raise ValueError("Set MIDHTECH_EMAIL and MIDHTECH_PASSWORD in .env")
    return authenticateMidhtechSessionWithCredentials(email, password)


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


def responseLooksSuccessful(resp: requests.Response) -> bool:
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
    ok = responseLooksSuccessful(response)
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


def flattenDrfErrors(errs: object) -> list[str]:
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
    for msg in flattenDrfErrors(errs):
        low = msg.lower()
        if any(n in low for n in needles):
            return True
    return False


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
