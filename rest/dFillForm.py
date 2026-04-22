from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
from fileManagement import resolveOutputJsonPath
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select
from webdriver_manager.chrome import ChromeDriverManager

load_dotenv()

SCRIPT_DIR = Path(__file__).resolve().parent

_form = os.getenv("FORM_HTML", "zz.html")
formHtmlPath = Path(_form) if Path(_form).is_absolute() else SCRIPT_DIR / _form
chromeAppPath = os.getenv("CHROME_APP_PATH")


def jobs_json_path() -> Path:
    raw = os.getenv("OUTPUT_JSON_JOBRIGHT")
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError(
            "Set OUTPUT_JSON_JOBRIGHT in .env to the jobs JSON path (e.g. opJobRight.json)."
        )
    return resolveOutputJsonPath(raw.strip())


def loadJobAtIndex(jobIndex: int = 0) -> dict:
    path = jobs_json_path()
    if not path.is_file():
        raise FileNotFoundError(f"Jobs JSON not found: {path.resolve()}")
    data = json.loads(path.read_text(encoding="utf-8"))
    jobs = data.get("jobs")
    if not isinstance(jobs, list) or not jobs:
        raise ValueError("JSON must contain a non-empty 'jobs' array")
    if jobIndex < 0 or jobIndex >= len(jobs):
        raise ValueError(f"job index out of range: {jobIndex} (jobs: {len(jobs)})")
    job = jobs[jobIndex]
    if not isinstance(job, dict):
        raise ValueError(f"Job at index {jobIndex} must be an object")
    return job


def formFileUri(htmlPath: Path) -> str:
    if not htmlPath.is_file():
        raise FileNotFoundError(f"FORM_HTML not found: {htmlPath.resolve()}")
    return htmlPath.resolve().as_uri()


def qualification_tags_as_list(val: object) -> list[str]:
    """Job JSON stores tags as a comma-separated string; accept list for older files."""
    if val is None:
        return []
    if isinstance(val, str):
        return [t.strip() for t in val.split(",") if t.strip()]
    if isinstance(val, list):
        return [str(x).strip() for x in val if str(x).strip()]
    return []


def inferCloudSpecialization(tags: list[str]) -> str:
    blob = " ".join(tags).lower()
    if "aws" in blob or "eks" in blob:
        return "aws"
    if "azure" in blob or "aks" in blob:
        return "azure"
    if "gcp" in blob or "google cloud" in blob:
        return "gcp"
    return ""


def mapSenioritySelect(s: str | None) -> str:
    if not s:
        return ""
    sl = s.lower()
    if "lead" in sl or "principal" in sl:
        return "lead"
    if "senior" in sl:
        return "senior"
    if "mid" in sl:
        return "mid"
    if "junior" in sl or "entry" in sl or "intern" in sl:
        return "junior"
    return ""


def mapSourceLabel(originalUrl: str | None) -> str:
    if not originalUrl:
        return ""
    host = (urlparse(originalUrl).hostname or "").lower()
    path = originalUrl.lower()
    if "linkedin" in host or "linkedin" in path:
        return "linkedin"
    if "indeed" in host or "glassdoor" in host or "ziprecruiter" in host:
        return "aggregator"
    if re.match(r"^[^.]+\.(com|co|io|ai|jobs)", host or ""):
        return "company_site"
    return "aggregator"


def mapExperienceLevel(exp: str | None) -> str:
    if not exp:
        return ""
    m = re.search(r"(\d+)\s*\+?", exp)
    if m:
        n = int(m.group(1))
        if n <= 2:
            return "0-2"
        if n <= 4:
            return "2-4"
        if n <= 6:
            return "4-6"
        return "6+"
    if "entry" in exp.lower():
        return "0-2"
    return ""


def mapJobType(employment: str | None) -> str:
    if not employment:
        return ""
    e = employment.strip()
    for opt in ("Full-time", "Contract", "Part-time", "Internship"):
        if e.lower() == opt.lower():
            return opt
    return ""


def buildLocationWorkType(job: dict) -> str:
    loc = (job.get("location") or "").strip()
    wm = (job.get("workModel") or "").strip()
    et = (job.get("employmentType") or "").strip()
    parts = [loc] if loc else []
    tail = " · ".join(x for x in (wm, et) if x)
    if tail:
        parts.append(tail)
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return " — ".join(parts)


def buildJobDescription(job: dict) -> str:
    chunks: list[str] = []
    if job.get("salaryRange"):
        chunks.append(f"Compensation (from listing): {job['salaryRange']}")
    if job.get("visaOrMatchNote"):
        chunks.append(f"Visa / match note: {job['visaOrMatchNote']}")

    rs = job.get("responsibilities") or []
    if rs:
        chunks.append(
            "## Responsibilities\n" + "\n".join(f"- {r}" for r in rs)
        )

    req = job.get("qualificationsRequired") or []
    if req:
        chunks.append(
            "## Required qualifications\n" + "\n".join(f"- {r}" for r in req)
        )

    pref = job.get("qualificationsPreferred") or []
    if pref:
        chunks.append(
            "## Preferred qualifications\n" + "\n".join(f"- {p}" for p in pref)
        )

    ben = job.get("benefits") or []
    if ben:
        chunks.append("## Benefits\n" + "\n".join(f"- {b}" for b in ben))

    if job.get("jobUrl"):
        chunks.append(f"\nSource listing: {job['jobUrl']}")
    return "\n\n".join(chunks).strip()


def resolveJobDescription(job: dict) -> str:
    """
    Prefer explicit merged JD text, then fall back to structured reconstruction.
    """
    primary = (job.get("jobResponsibility") or "").strip()
    if primary:
        return primary
    fallback = buildJobDescription(job)
    if fallback:
        return fallback
    for key in ("description", "jobDescription"):
        v = (job.get(key) or "").strip()
        if v:
            return v
    return ""


def buildNotes(job: dict) -> str:
    lines: list[str] = []
    if job.get("jobUrl"):
        lines.append(f"Jobright / listing URL: {job['jobUrl']}")
    if job.get("websiteUrl"):
        lines.append(f"Company website: {job['websiteUrl']}")
    if job.get("jobId"):
        lines.append(f"Imported jobId: {job['jobId']}")
    if job.get("postedAgo"):
        lines.append(f"Posted: {job['postedAgo']}")
    return "\n".join(lines)


def setInput(driver, el_id: str, value: str | None) -> None:
    if value is None or value == "":
        return
    el = driver.find_element(By.ID, el_id)
    el.clear()
    el.send_keys(value)


def setTextarea(driver, el_id: str, value: str | None) -> None:
    if value is None or value == "":
        return
    el = driver.find_element(By.ID, el_id)
    el.clear()
    el.send_keys(value)


def setTinyMceTextarea(driver, el_id: str, value: str | None) -> None:
    """
    Set textarea value and sync TinyMCE editor (if present).
    """
    if value is None or value == "":
        return
    escaped = json.dumps(value)
    script = f"""
        const id = {json.dumps(el_id)};
        const val = {escaped};
        const el = document.getElementById(id);
        if (el) el.value = val;
        if (window.tinymce) {{
            const ed = window.tinymce.get(id);
            if (ed) {{
                ed.setContent(val.replace(/\\n/g, '<br>'));
                ed.save();
            }}
            if (typeof window.tinymce.triggerSave === 'function') {{
                window.tinymce.triggerSave();
            }}
        }}
    """
    driver.execute_script(script)


def selectByValue(driver, el_id: str, value: str | None) -> None:
    if not value:
        return
    sel = Select(driver.find_element(By.ID, el_id))
    try:
        sel.select_by_value(value)
    except Exception:
        pass


def openOptionalDetails(driver) -> None:
    try:
        det = driver.find_element(
            By.XPATH,
            "//details[.//summary[contains(.,'Optional details')]]",
        )
        driver.execute_script("arguments[0].open = true", det)
        time.sleep(0.2)
    except Exception:
        pass


def checkAdditionalClouds(driver, tags: list[str]) -> None:
    blob = " ".join(tags).lower()
    mapping = [
        ("id_additional_cloud_specializations_0", "aws"),
        ("id_additional_cloud_specializations_1", "azure"),
        ("id_additional_cloud_specializations_2", "gcp"),
    ]
    for el_id, key in mapping:
        if key in blob:
            try:
                cb = driver.find_element(By.ID, el_id)
                if not cb.is_selected():
                    cb.click()
            except Exception:
                pass


def extractPostedOnDate(job: dict) -> str:
    """
    Return YYYY-MM-DD when a parseable posted date exists.
    """
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
        m = re.match(r"^(\d{4}-\d{2}-\d{2})T", text)
        if m:
            return m.group(1)
    return ""


def inferAtsPlatform(job: dict) -> str:
    raw_url = (job.get("originalJobPostUrl") or job.get("jobUrl") or "").strip()
    if not raw_url or " " in raw_url:
        return ""
    blob = raw_url.lower()
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


def certificationsRequired(tags: list[str], jd: str) -> bool:
    blob = " ".join(tags).lower() + " " + jd.lower()
    cert_markers = (
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
    return any(marker in blob for marker in cert_markers)


def setCheckbox(driver, el_id: str, checked: bool) -> None:
    if not checked:
        return
    try:
        cb = driver.find_element(By.ID, el_id)
        if not cb.is_selected():
            cb.click()
    except Exception:
        pass


def setDecisionPayload(driver, job: dict) -> None:
    payload = job.get("decision_payload") or job.get("decisionPayload")
    if payload is None:
        return
    if isinstance(payload, (dict, list)):
        value = json.dumps(payload, indent=2, ensure_ascii=False)
    else:
        value = str(payload)
    setTextarea(driver, "id_decision_payload", value)


def fillForm(driver, job: dict) -> None:
    tags = qualification_tags_as_list(job.get("qualificationTags"))
    jd = resolveJobDescription(job)
    original_or_source_url = (
        job.get("originalJobPostUrl")
        or job.get("jobUrl")
        or ""
    )

    setInput(driver, "id_title", job.get("title"))
    # Placeholder requirement id — no field in JSON; tweak later
    setInput(driver, "id_requirement_key", f"JR-{job.get('jobId', 'unknown')}")
    setInput(driver, "id_url", original_or_source_url)
    setInput(driver, "id_company_name", job.get("companyName"))
    setInput(driver, "id_location_work_type", buildLocationWorkType(job))

    selectByValue(driver, "id_cloud_specialization", inferCloudSpecialization(tags))
    selectByValue(driver, "id_seniority", mapSenioritySelect(job.get("seniority")))
    selectByValue(driver, "id_source_label", mapSourceLabel(original_or_source_url))

    setTinyMceTextarea(driver, "id_job_description", jd)

    openOptionalDetails(driver)

    must_skills = ", ".join(tags[:25]) if tags else ""
    setInput(driver, "id_must_have_skills", must_skills)

    fit = job.get("visaOrMatchNote")
    if fit:
        setTextarea(driver, "id_fit_reason", str(fit)[:2000])

    setTextarea(driver, "id_notes", buildNotes(job))

    selectByValue(driver, "id_job_type", mapJobType(job.get("employmentType")))
    selectByValue(driver, "id_experience_level", mapExperienceLevel(job.get("experience")))
    setInput(driver, "id_posted_on", extractPostedOnDate(job))
    setInput(driver, "id_ats_platform", inferAtsPlatform(job))
    setCheckbox(driver, "id_certifications_required", certificationsRequired(tags, jd))

    checkAdditionalClouds(driver, tags)
    setDecisionPayload(driver, job)


def resolveChromeDriverExecutable() -> str:
    return ChromeDriverManager().install()


def headlessEnabled() -> bool:
    return os.getenv("FILL_FORM_HEADLESS", "0").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fill zz.html from one job in OUTPUT_JSON_JOBRIGHT."
    )
    parser.add_argument(
        "job_index",
        nargs="?",
        default=0,
        type=int,
        help="0-based index in jobs array (default: 0)",
    )
    args = parser.parse_args()

    try:
        job = loadJobAtIndex(args.job_index)
    except (OSError, ValueError) as exc:
        print(exc, file=sys.stderr)
        raise SystemExit(1)

    uri = formFileUri(formHtmlPath)

    options = Options()
    if chromeAppPath:
        options.binary_location = chromeAppPath
    if headlessEnabled():
        options.add_argument("--headless=new")
        options.add_argument("--window-size=1280,900")

    options.add_argument("--disable-blink-features=AutomationControlled")

    service = Service(executable_path=resolveChromeDriverExecutable())
    driver = webdriver.Chrome(service=service, options=options)

    try:
        driver.set_page_load_timeout(60)
        print(f"Opening form: {uri}", file=sys.stderr)
        driver.get(uri)
        time.sleep(0.5)

        fillForm(driver, job)

        print(
            f"Form filled from job index {args.job_index} in "
            f"{jobs_json_path().resolve()} — review the browser; not submitted.",
            file=sys.stderr,
        )
        if not headlessEnabled():
            input("Press Enter to close the browser…")
    finally:
        driver.quit()


if __name__ == "__main__":
    main()