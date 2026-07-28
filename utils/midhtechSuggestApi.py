"""
Midhtech suggest/check API: session auth, CSRF, payload building, and HTTP calls.
Naming in this module uses camelCase for functions and locals per project convention.
"""

from __future__ import annotations

import html as html_module
import json
import logging
import os
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from dotenv import load_dotenv

from utils.urlCleaner import normalizeCompanyName

repoRoot = Path(__file__).resolve().parent.parent
logger = logging.getLogger("saral.midhtech")
EMPTY_BODY_PREVIEW = "<empty>"


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


_SUBMIT_FAILURE_MARKERS: tuple[str, ...] = (
    "errorlist",
    "this field is required",
    "already exists in maas",
    "duplicate suggestion detected",
    "job already exists for this company and title",
    "this job url was already suggested",
    "this job url already exists",
    "please correct the errors below",
    "invalid csrf token",
    "csrf verification failed",
)


def _stripHtmlTags(text: str) -> str:
    withoutTags = re.sub(r"<[^>]+>", " ", text or "")
    return html_module.unescape(withoutTags)


def _normalizeVisibleText(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def extractDjangoFormErrorMessages(body: str) -> list[str]:
    """Pull user-visible validation messages from a Django suggest-page HTML body."""
    if not body:
        return []

    messages: list[str] = []
    seen: set[str] = set()

    def add(raw: str) -> None:
        cleaned = _normalizeVisibleText(_stripHtmlTags(raw))
        if not cleaned or len(cleaned) < 2:
            return
        key = cleaned.casefold()
        if key in seen:
            return
        seen.add(key)
        messages.append(cleaned)

    for block in re.finditer(
        r'<ul[^>]*class=["\'][^"\']*errorlist[^"\']*["\'][^>]*>(.*?)</ul>',
        body,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        for li in re.finditer(
            r"<li[^>]*>(.*?)</li>",
            block.group(1),
            flags=re.IGNORECASE | re.DOTALL,
        ):
            add(li.group(1))

    for block in re.finditer(
        r'<div[^>]*class=["\'][^"\']*invalid-feedback[^"\']*["\'][^>]*>(.*?)</div>',
        body,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        add(block.group(1))

    for block in re.finditer(
        r'<div[^>]*class=["\'][^"\']*alert[^"\']*alert-danger[^"\']*["\'][^>]*>(.*?)</div>',
        body,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        add(block.group(1))

    return messages


def _humanizeSubmitFailureMarker(marker: str) -> str:
    if marker == "errorlist":
        return "The suggest form returned validation errors."
    text = marker.strip()
    if not text:
        return "The suggest form rejected this submission."
    return text[0].upper() + text[1:]


def _parseSubmitFailure(body: str) -> tuple[str | None, list[str]]:
    """
    Detect suggest-page failures and return (marker, parsed_messages).
    marker is kept for logging; messages are shown to the user.
    """
    if not body:
        return None, []
    low = body.lower()
    marker: str | None = None
    for candidate in _SUBMIT_FAILURE_MARKERS:
        if candidate in low:
            marker = candidate
            break
    if marker is None:
        return None, []

    messages = extractDjangoFormErrorMessages(body)
    if not messages:
        for candidate in _SUBMIT_FAILURE_MARKERS:
            if candidate in low and candidate != "errorlist":
                messages.append(_humanizeSubmitFailureMarker(candidate))
                break
        if not messages:
            messages.append(_humanizeSubmitFailureMarker(marker))
    return marker, messages


def formatSubmitFailureDetail(
    *,
    response: requests.Response,
    marker: str | None,
    messages: list[str],
    body: str,
) -> str:
    if messages:
        if len(messages) == 1:
            return f"Midhtech rejected this job: {messages[0]}"
        return "Midhtech rejected this job:\n" + "\n".join(f"• {msg}" for msg in messages)
    if marker:
        return f"Midhtech rejected this job: {_humanizeSubmitFailureMarker(marker)}"
    preview = _responsePreview(body)
    return f"HTTP {response.status_code} at {response.url} :: {preview}"


def _submitFailureReasonFromBody(response: requests.Response) -> str | None:
    """Detect common "HTTP 200 but form failed" outcomes from suggest page HTML/text."""
    marker, _messages = _parseSubmitFailure((response.text or "").strip())
    return marker


def _responsePreview(body: str, limit: int = 300) -> str:
    text = (body or "").strip()
    if not text:
        return EMPTY_BODY_PREVIEW
    one_line = re.sub(r"\s+", " ", text)
    return one_line[:limit]


def _logSubmitResult(
    *,
    job: dict,
    response: requests.Response,
    ok: bool,
    failureMarker: str | None,
    failureMessages: list[str] | None = None,
    body: str,
) -> None:
    jobId = str(job.get("jobId") or "").strip()
    title = str(job.get("title") or "").strip()
    companyName = str(job.get("companyName") or "").strip()
    payloadUrl = str(job.get("originalJobPostUrl") or job.get("jobUrl") or "").strip()
    preview = _responsePreview(body)

    logPayload = {
        "jobId": jobId,
        "companyName": companyName,
        "title": title,
        "payloadUrl": payloadUrl,
        "responseStatus": int(response.status_code),
        "responseUrl": str(response.url or ""),
        "submitOk": bool(ok),
        "failureMarker": failureMarker or "",
        "validationErrors": list(failureMessages or []),
        "responsePreview": preview,
    }
    if ok:
        logger.info("[MIDHTECH_SUBMIT] %s", json.dumps(logPayload, ensure_ascii=False))
    else:
        logger.warning("[MIDHTECH_SUBMIT] %s", json.dumps(logPayload, ensure_ascii=False))


def submitJobSuggestion(
    session: requests.Session,
    suggestUrl: str,
    csrfToken: str,
    job: dict,
) -> tuple[bool, str, str | None]:
    """
    Submit a job suggestion to Midhtech.

    Returns (ok, detail, autoApplyStatus).
    autoApplyStatus is set for known business rejections (EXISTING, DO_NOT_APPLY, REJECTED);
    None means the job should stay APPLY for retry (network/auth/unknown errors).
    """
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
        _logSubmitResult(
            job=job,
            response=response,
            ok=False,
            failureMarker="transport_or_auth",
            body=body,
        )
        preview = _responsePreview(body)
        if "/login" in (response.url or ""):
            return (
                False,
                "Midhtech login expired or failed — you were redirected to the login page.",
                None,
            )
        return (
            False,
            f"Midhtech request failed (HTTP {response.status_code}): {preview}",
            None,
        )
    failureMarker, failureMessages = _parseSubmitFailure(body)
    if failureMarker:
        detail = formatSubmitFailureDetail(
            response=response,
            marker=failureMarker,
            messages=failureMessages,
            body=body,
        )
        autoApplyStatus = classifySubmitFailureApplyStatus(
            failureMarker=failureMarker,
            failureMessages=failureMessages,
            transportFailure=False,
        )
        _logSubmitResult(
            job=job,
            response=response,
            ok=False,
            failureMarker=failureMarker,
            failureMessages=failureMessages,
            body=body,
        )
        return False, detail, autoApplyStatus
    _logSubmitResult(
        job=job,
        response=response,
        ok=True,
        failureMarker=None,
        body=body,
    )
    return True, f"HTTP {response.status_code}", None


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


MAAS_EXISTING_OR_DUPLICATE_NEEDLES: tuple[str, ...] = (
    "already exists in maas",
    "job already exists for this company and title",
    "duplicate suggestion detected",
    "this job url was already suggested",
    "this job url already exists",
    "already promoted to an active maas job",
    "already promoted to an inactive maas job",
    "already promoted to a maas job",
    "open the existing job instead of submitting again",
)

STAFF_WATCHLIST_NEEDLES: tuple[str, ...] = (
    "do not apply via staff watchlist",
    "flagged as do not apply via staff watchlist",
    "staff watchlist",
    "blacklist",
    "blocklist",
)

MAAS_BUSINESS_REJECTION_NEEDLES: tuple[str, ...] = (
    "url is too long to save in maas",
    "not opt-friendly",
    "not opt friendly",
    "does not meet intake criteria",
    "intake criteria",
    "role is not eligible",
    "company is not eligible",
    "cannot submit this job",
    "cannot accept this job",
)


def _failureTextBlob(failureMessages: list[str], failureMarker: str | None) -> str:
    parts = [msg.strip() for msg in failureMessages if msg and str(msg).strip()]
    if failureMarker:
        parts.append(str(failureMarker).strip())
    return " ".join(parts).casefold()


def _failureTextMatchesNeedles(
    failureMessages: list[str],
    failureMarker: str | None,
    needles: tuple[str, ...],
) -> bool:
    blob = _failureTextBlob(failureMessages, failureMarker)
    if not blob:
        return False
    return any(needle in blob for needle in needles)


def classifySubmitFailureApplyStatus(
    *,
    failureMarker: str | None,
    failureMessages: list[str],
    transportFailure: bool,
) -> str | None:
    """
    Map a known Midhtech submit rejection to a DB applyStatus, or None to keep APPLY for retry.
    Network/auth/unknown validation failures return None.
    """
    if transportFailure:
        return None
    if not failureMarker and not failureMessages:
        return None

    if _failureTextMatchesNeedles(
        failureMessages, failureMarker, MAAS_EXISTING_OR_DUPLICATE_NEEDLES
    ):
        return "EXISTING"
    if _failureTextMatchesNeedles(failureMessages, failureMarker, STAFF_WATCHLIST_NEEDLES):
        return "DO_NOT_APPLY"
    if _failureTextMatchesNeedles(
        failureMessages, failureMarker, MAAS_BUSINESS_REJECTION_NEEDLES
    ):
        return "REJECTED"
    return None


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
    for msg in flattenDrfErrors(errs):
        low = msg.lower()
        if any(n in low for n in MAAS_EXISTING_OR_DUPLICATE_NEEDLES):
            return True
    return False


def errorsIndicateStaffWatchlistDoNotApply(errs: object) -> bool:
    """Midhtech /check/ validation: company is on staff Do Not Apply watchlist."""
    for msg in flattenDrfErrors(errs):
        low = msg.lower()
        if any(n in low for n in STAFF_WATCHLIST_NEEDLES):
            return True
    return False


def errorsIndicateMaasBusinessRejection(errs: object) -> bool:
    """Midhtech /check/ validation: known business rules that reject a job (not API errors)."""
    for msg in flattenDrfErrors(errs):
        low = msg.lower()
        if any(n in low for n in MAAS_BUSINESS_REJECTION_NEEDLES):
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
