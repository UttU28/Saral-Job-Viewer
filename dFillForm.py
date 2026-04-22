import os
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from dotenv import load_dotenv

from utils.fileManagement import loadJobsDocumentOrEmpty, resolveOutputJsonPath


SCRIPT_DIR = Path(__file__).resolve().parent
JOBRIGHT_SOURCE_PATH = resolveOutputJsonPath("jobright.source")


def loadEnvironment() -> None:
    envPath = SCRIPT_DIR / ".env"
    load_dotenv(envPath, override=False)


def loadJobAtIndex(jobIndex: int = 0) -> dict:
    path = JOBRIGHT_SOURCE_PATH
    data = loadJobsDocumentOrEmpty(path)
    jobs = data.get("jobs")
    if not isinstance(jobs, list) or not jobs:
        raise ValueError("No jobs found in DB-backed source.")
    if jobIndex < 0 or jobIndex >= len(jobs):
        raise ValueError(f"job index out of range: {jobIndex} (jobs: {len(jobs)})")
    job = jobs[jobIndex]
    if not isinstance(job, dict):
        raise ValueError(f"Job at index {jobIndex} must be an object")
    return job


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
    inferBlob = " ".join(
        part for part in ((job.get("title") or "").strip(), jobDescription) if part
    )

    payload: dict[str, object] = {
        "title": str(job.get("title") or ""),
        "requirement_key": f"JR-{job.get('jobId', 'unknown')}",
        "url": str(originalOrSourceUrl),
        "company_name": str(job.get("companyName") or ""),
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


def loginAndCheck() -> None:
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

    job = loadJobAtIndex(0)
    checkPayload = buildCheckPayload(job)
    checkPayload["csrfmiddlewaretoken"] = csrfToken

    checkHeaders = {
        "Referer": suggestUrl,
        "X-CSRFToken": csrfToken,
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/plain, */*",
    }

    print("Check request:")
    print(
        json.dumps(
            {
                "endpoint": checkUrl,
                "title": checkPayload.get("title", ""),
                "company_name": checkPayload.get("company_name", ""),
                "url": checkPayload.get("url", ""),
            },
            indent=2,
            ensure_ascii=False,
        )
    )

    checkResp = session.post(
        checkUrl,
        data=checkPayload,
        headers=checkHeaders,
        timeout=30,
    )

    try:
        parsed = checkResp.json()
        ok = bool(parsed.get("ok")) if isinstance(parsed, dict) else None
        statusLabel = "success" if ok else "error"
        print("Check response:")
        summary = {
            "http_status": checkResp.status_code,
            "status": statusLabel,
            "ok": parsed.get("ok") if isinstance(parsed, dict) else None,
            "errors": parsed.get("errors", {}) if isinstance(parsed, dict) else {},
        }
        print(json.dumps(summary, indent=2, ensure_ascii=False))
        if isinstance(parsed, dict) and parsed:
            print("Check response full_json:")
            print(json.dumps(parsed, indent=2, ensure_ascii=False))
    except Exception:
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


if __name__ == "__main__":
    loginAndCheck()
