from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlencode, urljoin

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from selenium.common.exceptions import (
    NoSuchElementException,
    StaleElementReferenceException,
    TimeoutException,
)
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from utils.startChrome import (
    createScrapingChromeDriver,
    envBool,
    promptBeforeClosingBrowserIfHeaded,
)
from utils.fileManagement import (
    loadExistingJobsAndMeta,
    loadJobsDocumentOrEmpty,
    mergeNewJobsIntoDocument,
    mergeFetchedJobs,
    resolveOutputJsonPath,
    saveJsonPayload,
    saveOutputDocument,
)

load_dotenv()


# --- Job list fetch (HTTP) ---

jobrightOrigin = "https://jobright.ai"
jobsSearchPath = f"{jobrightOrigin}/jobs/search"

SearchParamValue = str | int | bool | list[dict[str, str]]

jobIdFromHrefPattern = re.compile(r"/jobs/info/([a-f0-9]{24})", re.I)
JOB_METADATA_ITEM_SELECTOR = '[class*="job-metadata-item"]'

fetchHeaders = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def getDefaultSearchParams() -> dict[str, SearchParamValue]:
    return {
        "value": "devops",
        "searchType": "job_title",
        "country": "US",
        "jobTaxonomyList": [
            {"taxonomyId": "00-00-00", "title": "devops"},
        ],
        "isH1BOnly": False,
        "excludeStaffingAgency": True,
        "excludeSecurityClearance": True,
        "excludeUsCitizen": True,
        "refresh": False,
        "position": 9,
        "sortCondition": 0,
        "jobTypes": 1,
        "daysAgo": 1,
        "seniority": "3,2",
    }


def flattenSearchParams(params: dict[str, SearchParamValue]) -> dict[str, str]:
    flat: dict[str, str] = {}
    for key, raw in params.items():
        if key == "jobTaxonomyList" and isinstance(raw, list):
            flat[key] = json.dumps(raw, separators=(",", ":"))
        elif isinstance(raw, bool):
            flat[key] = "true" if raw else "false"
        else:
            flat[key] = str(raw)
    return flat


def buildSearchUrl(overrides: dict[str, SearchParamValue] | None = None) -> str:
    merged: dict[str, SearchParamValue] = {**getDefaultSearchParams()}
    if overrides:
        merged.update(overrides)
    query = flattenSearchParams(merged)
    return f"{jobsSearchPath}?{urlencode(query)}"


defaultSearchUrl = buildSearchUrl()
skippedOriginalUrlIdsKey = "skippedOriginalUrlIds"
JOBRIGHT_SOURCE_PATH = resolveOutputJsonPath("jobright.source")


def ensureSkippedOriginalUrlIds(data: dict) -> None:
    bucket = data.get(skippedOriginalUrlIdsKey)
    if isinstance(bucket, list):
        return
    data[skippedOriginalUrlIdsKey] = []


def textOrNone(element) -> str | None:
    if element is None:
        return None
    value = element.get_text(strip=True)
    return value if value else None


def parseJobCard(anchor) -> dict[str, str | None]:
    href = anchor.get("href") or ""
    match = jobIdFromHrefPattern.search(href)
    jobId = match.group(1) if match else None
    jobUrl = (
        f"{jobrightOrigin}/jobs/info/{jobId}"
        if jobId
        else urljoin(jobrightOrigin, href.split("?")[0])
    )

    def pick(classSubstring: str):
        return textOrNone(anchor.select_one(f'[class*="{classSubstring}"]'))

    firstRow: list[str] = []
    secondRow: list[str] = []
    metaRows = anchor.select('[class*="job-metadata-row"]')
    if len(metaRows) >= 1:
        for item in metaRows[0].select(JOB_METADATA_ITEM_SELECTOR):
            value = textOrNone(item.select_one("span"))
            if value is not None:
                firstRow.append(value)
    if len(metaRows) >= 2:
        for item in metaRows[1].select(JOB_METADATA_ITEM_SELECTOR):
            value = textOrNone(item.select_one("span"))
            if value is not None:
                secondRow.append(value)

    location = firstRow[0] if len(firstRow) > 0 else None
    employmentType = firstRow[1] if len(firstRow) > 1 else None
    salaryRange: str | None = firstRow[2] if len(firstRow) >= 3 else None

    workModel = secondRow[0] if len(secondRow) > 0 else None
    seniority = secondRow[1] if len(secondRow) > 1 else None
    experience = secondRow[2] if len(secondRow) > 2 else None

    return {
        "jobId": jobId,
        "jobUrl": jobUrl,
        "title": pick("job-title"),
        "postedAgo": pick("publish-time"),
        "company": pick("company-name"),
        "industryTag": pick("job-tag"),
        "applicants": pick("apply-time"),
        "visaOrMatchNote": pick("recommendation-tag-text"),
        "location": location,
        "employmentType": employmentType,
        "salaryRange": salaryRange,
        "workModel": workModel,
        "seniority": seniority,
        "experience": experience,
    }


def parseJobsFromSearchHtml(html: str) -> list[dict[str, str | None]]:
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select('a[class*="job-card__"]')
    return [parseJobCard(anchor) for anchor in cards]


def fetchAndMergeSearchHtml(
    outputPath: Path, url: str, timeout: float = 30.0
) -> tuple[bool, str]:
    """
    GET search URL; if HTML, parse cards and merge into outputPath.
    Returns (ok, message). On hard failure prints to stderr and process should exit.
    """
    try:
        response = requests.get(url, headers=fetchHeaders, timeout=timeout)
    except requests.RequestException as exc:
        return False, str(exc)

    if response.status_code >= 400:
        body = response.text[:8000]
        print(
            body + ("\n... [truncated]" if len(response.text) > 8000 else ""),
            file=sys.stderr,
        )
        return False, f"HTTP {response.status_code}"

    contentType = response.headers.get("Content-Type", "")
    contentTypeLower = contentType.lower()

    if "application/json" in contentTypeLower or "json" in contentTypeLower:
        try:
            result = response.json()
        except json.JSONDecodeError:
            result = response.text
        ok, msg = saveJsonPayload(outputPath, result)
        if not ok:
            return False, msg
        return True, msg

    if "text/html" in contentTypeLower:
        fetched = parseJobsFromSearchHtml(response.text)
        existing, meta = loadExistingJobsAndMeta(outputPath)
        merged, skipped, appended = mergeFetchedJobs(
            existing, fetched, platform="JobRight"
        )
        data = {**meta, "jobs": merged, "count": len(merged)}
        ensureSkippedOriginalUrlIds(data)
        try:
            saveOutputDocument(outputPath, data)
        except OSError as exc:
            return False, f"Failed to save merged jobs: {exc}"
        return (
            True,
            f"Fetch merged into {outputPath} — {appended} new, {skipped} skipped, "
            f"{len(merged)} total jobs.",
        )

    return saveJsonPayload(outputPath, response.text)


def resolveSearchUrl(cli_url: str | None) -> str:
    env_url = os.getenv("JOBRIGHT_SEARCH_URL")
    if isinstance(env_url, str) and env_url.strip():
        return env_url.strip()
    if cli_url and cli_url.strip():
        return cli_url.strip()
    return defaultSearchUrl


# --- Job list fetch (Selenium scroll; matches live virtualized list) ------------

JOB_CARD_CSS = "div.job-card-flag-classname"
JOBS_LIST_SCROLL_CSS = '[class*="jobs-list-scrollable"]'

_INITIAL_LOAD_TIMEOUT = 45
_SCROLL_PAUSE = 0.55


def _scroll_max_rounds() -> int:
    try:
        return max(1, int(os.getenv("JOBRIGHT_SCROLL_MAX_ROUNDS", "150")))
    except ValueError:
        return 150


def _scroll_stagnant_limit() -> int:
    try:
        return max(1, int(os.getenv("JOBRIGHT_SCROLL_STAGNANT_LIMIT", "6")))
    except ValueError:
        return 6


def _count_job_cards(driver) -> int:
    return len(driver.find_elements(By.CSS_SELECTOR, JOB_CARD_CSS))


def _wait_for_first_job_cards(driver, timeout: float = _INITIAL_LOAD_TIMEOUT) -> None:
    def _list_and_cards_ready(d) -> bool:
        return bool(
            d.find_elements(By.CSS_SELECTOR, JOBS_LIST_SCROLL_CSS)
            and d.find_elements(By.CSS_SELECTOR, JOB_CARD_CSS)
        )

    WebDriverWait(driver, timeout).until(_list_and_cards_ready)


def _try_parse_results_banner_text(driver) -> str | None:
    try:
        body = driver.find_element(By.TAG_NAME, "body").text
    except Exception:
        return None
    m = re.search(r"(\d+)\s+results\s+for", body, re.I)
    return m.group(0).strip() if m else None


def _parse_results_total_from_banner(driver) -> int | None:
    try:
        body = driver.find_element(By.TAG_NAME, "body").text
    except Exception:
        return None
    m = re.search(r"(\d+)\s+results\s+for", body, re.I)
    return int(m.group(1)) if m else None


def _rel_text(root, selector: str) -> str | None:
    try:
        el = root.find_element(By.CSS_SELECTOR, selector)
        t = (el.text or "").strip()
        return t if t else None
    except NoSuchElementException:
        return None


def _recommendation_notes(card) -> str | None:
    def from_root(root) -> str | None:
        try:
            els = root.find_elements(
                By.CSS_SELECTOR, '[class*="recommendation-tag-text"]'
            )
            parts = [e.text.strip() for e in els if e.text and e.text.strip()]
            return " | ".join(parts) if parts else None
        except StaleElementReferenceException:
            return None

    n = from_root(card)
    if n:
        return n
    try:
        parent = card.find_element(By.XPATH, "./..")
        return from_root(parent)
    except (NoSuchElementException, StaleElementReferenceException):
        return None


def extract_job_from_list_card(card) -> dict[str, str | None] | None:
    """Parse one job row from the live list (same keys as parseJobCard)."""
    try:
        jid = (card.get_attribute("id") or "").strip() or None
        href = None
        try:
            a = card.find_element(By.CSS_SELECTOR, 'a[href*="/jobs/info/"]')
            href = (a.get_attribute("href") or "").strip()
        except NoSuchElementException:
            pass
        if href:
            m = jobIdFromHrefPattern.search(href)
            if m:
                jid = m.group(1)
        if not jid:
            return None

        path = href.split("?")[0] if href else f"/jobs/info/{jid}"
        job_url = urljoin(jobrightOrigin, path) if path.startswith("/") else path

        first_row: list[str] = []
        second_row: list[str] = []
        rows = card.find_elements(By.CSS_SELECTOR, '[class*="job-metadata-row"]')
        if len(rows) >= 1:
            for item in rows[0].find_elements(
                By.CSS_SELECTOR, JOB_METADATA_ITEM_SELECTOR
            ):
                try:
                    sp = item.find_element(By.CSS_SELECTOR, "span")
                    t = (sp.text or "").strip()
                    if t:
                        first_row.append(t)
                except (NoSuchElementException, StaleElementReferenceException):
                    pass
        if len(rows) >= 2:
            for item in rows[1].find_elements(
                By.CSS_SELECTOR, JOB_METADATA_ITEM_SELECTOR
            ):
                try:
                    sp = item.find_element(By.CSS_SELECTOR, "span")
                    t = (sp.text or "").strip()
                    if t:
                        second_row.append(t)
                except (NoSuchElementException, StaleElementReferenceException):
                    pass

        location = first_row[0] if len(first_row) > 0 else None
        employment_type = first_row[1] if len(first_row) > 1 else None
        salary_range = first_row[2] if len(first_row) >= 3 else None
        work_model = second_row[0] if len(second_row) > 0 else None
        seniority = second_row[1] if len(second_row) > 1 else None
        experience = second_row[2] if len(second_row) > 2 else None

        return {
            "jobId": jid,
            "jobUrl": job_url,
            "title": _rel_text(card, '[class*="job-title"]'),
            "postedAgo": _rel_text(card, '[class*="publish-time"]'),
            "company": _rel_text(card, '[class*="company-name"]'),
            "industryTag": _rel_text(card, '[class*="job-tag"]'),
            "applicants": _rel_text(card, '[class*="apply-time"]'),
            "visaOrMatchNote": _recommendation_notes(card),
            "location": location,
            "employmentType": employment_type,
            "salaryRange": salary_range,
            "workModel": work_model,
            "seniority": seniority,
            "experience": experience,
        }
    except StaleElementReferenceException:
        return None


def _extract_visible_jobs(driver) -> list[dict[str, str | None]]:
    out: list[dict[str, str | None]] = []
    for card in driver.find_elements(By.CSS_SELECTOR, JOB_CARD_CSS):
        job = extract_job_from_list_card(card)
        if job:
            out.append(job)
    return out


def _save_scroll_debug_json(
    path: Path,
    by_id: dict[str, dict[str, str | None]],
    *,
    search_url: str,
    banner_total: int | None,
) -> None:
    jobs = list(by_id.values())
    jobs.sort(key=lambda j: (j.get("company") or "", j.get("title") or ""))
    payload = {
        "source": "jobright_scroll_capture",
        "searchUrl": search_url,
        "bannerTotal": banner_total,
        "uniqueCount": len(by_id),
        "jobs": jobs,
    }
    ok, msg = saveJsonPayload(path, payload)
    if not ok:
        raise OSError(msg)


def _merge_visible_into(
    driver,
    by_id: dict[str, dict[str, str | None]],
    *,
    search_url: str,
    banner_total: int | None,
    path: Path | None,
) -> tuple[int, int]:
    before = len(by_id)
    for job in _extract_visible_jobs(driver):
        jid = job.get("jobId")
        if isinstance(jid, str) and jid:
            by_id[jid] = job
    if path is not None:
        _save_scroll_debug_json(path, by_id, search_url=search_url, banner_total=banner_total)
    return before, len(by_id) - before


def _scroll_job_list_to_end_once(driver) -> None:
    cards = driver.find_elements(By.CSS_SELECTOR, JOB_CARD_CSS)
    if not cards:
        return
    last_card = cards[-1]
    driver.execute_script(
        """
        const card = arguments[0];
        card.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' });
        """,
        last_card,
    )
    time.sleep(0.2)
    list_el = driver.find_element(By.CSS_SELECTOR, JOBS_LIST_SCROLL_CSS)
    driver.execute_script(
        """
        const pane = arguments[0];
        const maxTop = Math.max(0, pane.scrollHeight - pane.clientHeight);
        const step = Math.max(100, Math.floor(pane.clientHeight * 0.45));
        let top = pane.scrollTop;
        while (top < maxTop - 2) {
          top = Math.min(top + step, maxTop);
          pane.scrollTop = top;
          pane.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
        pane.scrollTop = pane.scrollHeight;
        pane.dispatchEvent(new Event('scroll', { bubbles: true }));
        """,
        list_el,
    )
    time.sleep(_SCROLL_PAUSE)


def _is_list_scrolled_to_bottom(driver) -> bool:
    try:
        list_el = driver.find_element(By.CSS_SELECTOR, JOBS_LIST_SCROLL_CSS)
        return bool(
            driver.execute_script(
                """
                const p = arguments[0];
                return p.scrollTop + p.clientHeight >= p.scrollHeight - 4;
                """,
                list_el,
            )
        )
    except NoSuchElementException:
        return False


def scroll_job_list_until_done(
    driver,
    search_url: str,
    *,
    progress_json_path: Path | None = None,
) -> list[dict[str, str | None]]:
    """
    Load search_url, scroll the virtual job list, dedupe by jobId, return card rows.
    If progress_json_path is set, writes the same debug snapshot after each merge
    (for test.py / inspection).
    """
    driver.get(search_url)
    _wait_for_first_job_cards(driver)
    time.sleep(0.8)

    by_id: dict[str, dict[str, str | None]] = {}
    banner_total = _parse_results_total_from_banner(driver)

    _merge_visible_into(
        driver,
        by_id,
        search_url=search_url,
        banner_total=banner_total,
        path=progress_json_path,
    )

    max_rounds = _scroll_max_rounds()
    stagnant_limit = _scroll_stagnant_limit()
    stagnant = 0
    for _ in range(1, max_rounds + 1):
        if banner_total is not None and len(by_id) >= banner_total:
            break

        _scroll_job_list_to_end_once(driver)
        _, new_ids = _merge_visible_into(
            driver,
            by_id,
            search_url=search_url,
            banner_total=banner_total,
            path=progress_json_path,
        )
        if banner_total is not None and len(by_id) >= banner_total:
            break

        if new_ids == 0:
            stagnant += 1
        else:
            stagnant = 0

        if stagnant >= stagnant_limit:
            break

    return list(by_id.values())


def fetchAndMergeSearchSelenium(
    driver,
    outputPath: Path,
    url: str,
) -> tuple[bool, str, dict | None]:
    """
    Scroll-capture the job list in the browser, merge new rows into outputPath
    (same semantics as fetchAndMergeSearchHtml for HTML cards).
    """
    dbg = os.getenv("JOBRIGHT_SCROLL_DEBUG_JSON")
    progress_path: Path | None = None
    if isinstance(dbg, str) and dbg.strip():
        progress_path = Path(dbg.strip())

    try:
        fetched = scroll_job_list_until_done(driver, url, progress_json_path=progress_path)
    except TimeoutException as exc:
        return False, f"Job list did not load in time: {exc}", None
    except Exception as exc:
        return False, str(exc), None

    data = loadJobsDocumentOrEmpty(outputPath)
    ensureSkippedOriginalUrlIds(data)
    appended = 0
    skipped = 0
    for row in fetched:
        added, skipped_one = mergeNewJobsIntoDocument(data, [row])
        if added:
            appended += 1
            try:
                saveOutputDocument(outputPath, data)
            except OSError as exc:
                return False, f"Failed to save merged jobs: {exc}", None
        else:
            skipped += skipped_one
    return (
        True,
        f"Merged into {outputPath.resolve()}: +{appended} new, {skipped} skipped duplicates.",
        data,
    )


def scrapingStaleRetries() -> int:
    try:
        return max(1, int(os.getenv("SCRAPING_STALE_RETRIES", "3")))
    except ValueError:
        return 3


def scrapingStaleDelaySec() -> float:
    try:
        return max(0.1, float(os.getenv("SCRAPING_STALE_DELAY", "0.85")))
    except ValueError:
        return 0.85


# --- Post-scrape normalization ------------------------------------------------

DETAILPAGE_FIELDS_TO_REMOVE: list[str] = [
    "detailPage.postedAgo",
    "detailPage.companyLogoUrl",
    "detailPage.metadataLine",
    "detailPage.companySummary",
    "detailPage.companyTags",
    "detailPage.matchTags",
    "detailPage.fullText",
    "detailPage.companyPanel.about",
    "detailPage.companyPanel.logoUrl",
    "detailPage.companyPanel.metadataItems",
    "detailPage.companyPanel.socialLinks",
    "detailPage.companyPanel.fundingStage",
    "detailPage.companyPanel.recentNews",
]

TOP_LEVEL_FIELDS_TO_REMOVE: list[str] = [
    "title",
    "postedAgo",
    "company",
    "industryTag",
    "applicants",
]


def deleteDotPath(obj: dict, dotPath: str) -> None:
    parts = [p for p in dotPath.split(".") if p]
    if not parts:
        return
    cur: object = obj
    for key in parts[:-1]:
        if not isinstance(cur, dict) or key not in cur:
            return
        cur = cur[key]
    if isinstance(cur, dict):
        cur.pop(parts[-1], None)


def flattenDetailPageIntoJob(job: dict) -> None:
    dp = job.pop("detailPage", None)
    if not isinstance(dp, dict):
        return

    for key, val in dp.items():
        if key == "jobTitle":
            job["title"] = val
        elif key == "companyPanel":
            continue
        else:
            job[key] = val

    job.pop("jobTitle", None)


def stripAndNormalizeJob(job: dict) -> None:
    for path in DETAILPAGE_FIELDS_TO_REMOVE:
        deleteDotPath(job, path)
    for k in TOP_LEVEL_FIELDS_TO_REMOVE:
        job.pop(k, None)
    flattenDetailPageIntoJob(job)


def _coerceLines(val: object) -> list[str]:
    if val is None:
        return []
    if isinstance(val, str):
        t = val.strip()
        return [t] if t else []
    if isinstance(val, list):
        out: list[str] = []
        for x in val:
            if isinstance(x, str) and x.strip():
                out.append(x.strip())
        return out
    return []


def mergeIntoJobResponsibility(job: dict) -> None:
    resp = _coerceLines(job.get("responsibilities"))
    req = _coerceLines(job.get("qualificationsRequired"))
    pref = _coerceLines(job.get("qualificationsPreferred"))
    ben = _coerceLines(job.get("benefits"))

    parts: list[str] = []
    if resp:
        parts.append("## Responsibilities\n" + "\n".join(f"- {r}" for r in resp))
    if req:
        parts.append(
            "## Required qualifications\n" + "\n".join(f"- {r}" for r in req)
        )
    if pref:
        parts.append(
            "## Preferred qualifications\n" + "\n".join(f"- {p}" for p in pref)
        )
    if ben:
        parts.append("## Benefits\n" + "\n".join(f"- {b}" for b in ben))

    job["jobResponsibility"] = "\n\n".join(parts).strip()

    for k in (
        "responsibilities",
        "qualificationsRequired",
        "qualificationsPreferred",
        "benefits",
    ):
        job.pop(k, None)


def postScrapeCleanJob(job: dict) -> None:
    """Flatten detailPage, strip noise, merge JD into jobResponsibility."""
    stripAndNormalizeJob(job)
    mergeIntoJobResponsibility(job)


def dismissOrionCoverLetterTourIfPresent(driver) -> None:
    exitSelectors: list[tuple[str, str, float]] = [
        (By.CSS_SELECTOR, "[id*='cover-letter-tour-exit-button']", 8.0),
        (
            By.XPATH,
            "//div[contains(@class,'cover-letter-tour-card')]//button[.//span[normalize-space()='EXIT']]",
            4.0,
        ),
    ]
    for by, selector, waitSec in exitSelectors:
        try:
            btn = WebDriverWait(driver, waitSec).until(
                EC.element_to_be_clickable((by, selector))
            )
            driver.execute_script("arguments[0].click();", btn)
            time.sleep(0.5)
            print("Closed Orion cover-letter tour (EXIT).", file=sys.stderr)
            return
        except TimeoutException:
            continue


def getOriginalJobPostUrl(driver) -> str | None:
    selectors: list[tuple[str, str, float]] = [
        (
            By.XPATH,
            "//a[.//span[contains(normalize-space(),'Original Job Post')]]",
            18.0,
        ),
        (By.CSS_SELECTOR, "a[class*='index_origin'][href]", 6.0),
    ]
    for by, selector, waitSec in selectors:
        try:
            el = WebDriverWait(driver, waitSec).until(
                EC.presence_of_element_located((by, selector))
            )
            href = el.get_attribute("href")
            if href and href.strip():
                return href.strip()
        except TimeoutException:
            continue
    return None


def resolveOriginalJobPostUrl(driver) -> str | None:
    """Try the Original Job Post link first; only dismiss the Orion tour if not found, then retry."""
    time.sleep(0.3)
    url = getOriginalJobPostUrl(driver)
    if url:
        return url
    dismissOrionCoverLetterTourIfPresent(driver)
    time.sleep(0.3)
    return getOriginalJobPostUrl(driver)


def waitForJobOverview(driver, timeout: float = 25.0) -> None:
    WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located(
            (By.CSS_SELECTOR, '[id^="overview"], [class*="jobMainContentInfo"]')
        )
    )


def _safeText(el) -> str:
    try:
        return (el.text or "").strip()
    except StaleElementReferenceException:
        return ""


def _textIfPresent(root, selector: str) -> str | None:
    try:
        el = root.find_element(By.CSS_SELECTOR, selector)
        text = _safeText(el)
        return text if text else None
    except (NoSuchElementException, StaleElementReferenceException):
        return None


def _textsIfPresent(root, selector: str) -> list[str]:
    try:
        els = root.find_elements(By.CSS_SELECTOR, selector)
    except (NoSuchElementException, StaleElementReferenceException):
        return []
    return [t for el in els if (t := _safeText(el))]


def _sectionListTexts(driver, heading: str) -> list[str]:
    xpath = (
        "//h2[contains(@class,'index_label') or contains(@class,'label')]"
        f"[contains(normalize-space(),'{heading}')]/ancestor::section[1]"
        "//span[contains(@class,'listText')]"
    )
    try:
        els = driver.find_elements(By.XPATH, xpath)
    except (NoSuchElementException, StaleElementReferenceException):
        return []
    return [t for el in els if (t := _safeText(el))]


def _pickOverviewRoot(driver):
    blocks = driver.find_elements(By.CSS_SELECTOR, 'div[id^="overview"]')
    for b in blocks:
        try:
            if b.find_elements(
                By.CSS_SELECTOR,
                "[class*='job-title'], [class*='jobTitle'], [class*='jobMainContentInfo']",
            ):
                return b
        except (NoSuchElementException, StaleElementReferenceException):
            continue
    return blocks[0] if blocks else driver


def _qualificationSubsections(driver) -> tuple[list[str], list[str]]:
    required: list[str] = []
    preferred: list[str] = []
    try:
        section = driver.find_element(
            By.CSS_SELECTOR,
            "section#skills-section, section[class*='skills']",
        )
    except NoSuchElementException:
        return required, preferred

    for col in section.find_elements(By.CSS_SELECTOR, "div[class*='flex-col']"):
        h4s = col.find_elements(By.TAG_NAME, "h4")
        if not h4s:
            continue
        label = _safeText(h4s[0])
        bullets = _textsIfPresent(col, "span[class*='listText']")
        if label == "Required":
            required = bullets
        elif label == "Preferred":
            preferred = bullets
    return required, preferred


def extractCompanyPanel(driver) -> dict:
    """Scroll to #company and read company metadata used for fallbacks."""
    out: dict[str, str | None] = {
        "companyName": None,
        "about": None,
    }
    try:
        panel = driver.find_element(By.ID, "company")
    except NoSuchElementException:
        return out

    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", panel)
    time.sleep(0.45)

    out["companyName"] = (
        _textIfPresent(panel, "h2[class*='companyName']")
        or _textIfPresent(panel, "[class*='companyName']")
    )
    out["about"] = _textIfPresent(panel, "[class*='companySummary']")

    return out


def extractJobDetailPage(driver) -> dict:
    """
    Scrape Jobright job detail DOM. Only fields that survive postScrapeCleanJob
    merge are included.
    """
    root = _pickOverviewRoot(driver)

    companyName = (
        _textIfPresent(root, "[class*='company-name']")
        or _textIfPresent(root, "[class*='companyName']")
    )
    jobTitle = (
        _textIfPresent(root, "[class*='job-title']")
        or _textIfPresent(root, "[class*='jobTitle']")
    )

    responsibilities = _sectionListTexts(driver, "Responsibilities")
    qualificationTags = _textsIfPresent(
        driver, "#skills-section span[class*='qualification-tag']"
    ) or _textsIfPresent(
        driver, "section[class*='skills'] span[class*='qualification-tag']"
    )
    qualRequired, qualPreferred = _qualificationSubsections(driver)
    benefits = _sectionListTexts(driver, "Benefits")

    companyPanel = extractCompanyPanel(driver)

    if not companyName and companyPanel.get("companyName"):
        companyName = companyPanel["companyName"]

    return {
        "companyName": companyName,
        "jobTitle": jobTitle,
        "responsibilities": responsibilities,
        "qualificationTags": qualificationTags,
        "qualificationsRequired": qualRequired,
        "qualificationsPreferred": qualPreferred,
        "benefits": benefits,
        "companyPanel": companyPanel,
    }


def extractJobDetailPageWithRetries(driver, log_prefix: str = "") -> dict:
    """Run extractJobDetailPage with retries on StaleElementReferenceException."""
    stale_retries = scrapingStaleRetries()
    stale_delay = scrapingStaleDelaySec()
    for attempt in range(1, stale_retries + 1):
        try:
            return extractJobDetailPage(driver)
        except StaleElementReferenceException:
            if attempt >= stale_retries:
                print(
                    f"{log_prefix}Stale element; giving up (empty detailPage).",
                    file=sys.stderr,
                )
                return {}
            time.sleep(stale_delay * attempt)


def main() -> None:
    try:
        out_path = JOBRIGHT_SOURCE_PATH
    except ValueError as exc:
        print(exc, file=sys.stderr)
        raise SystemExit(1) from exc

    existing_jobs, _ = loadExistingJobsAndMeta(out_path)
    if existing_jobs:
        print(
            f"{len(existing_jobs)} jobId(s) already in {out_path.name}; "
            "those list rows will be skipped.",
            file=sys.stderr,
        )

    search_url = resolveSearchUrl(None)

    try:
        driver = createScrapingChromeDriver(
            headless=envBool("SCRAPING_HEADLESS", default=True),
            quiet=True,
        )
    except ValueError as exc:
        print(exc, file=sys.stderr)
        raise SystemExit(1)

    try:
        driver.set_page_load_timeout(120)

        ok, msg, data = fetchAndMergeSearchSelenium(driver, out_path, search_url)
        if not ok:
            print(msg, file=sys.stderr)
            raise SystemExit(1)
        print(msg, file=sys.stderr)
        if not isinstance(data, dict):
            data = loadJobsDocumentOrEmpty(out_path)
        jsonPath = out_path
        ensureSkippedOriginalUrlIds(data)
        saveOutputDocument(jsonPath, data)

        jobs = data["jobs"]
        total = len(jobs)

        for index, job in enumerate(jobs):
            if not isinstance(job, dict):
                print(f"[{index + 1}/{total}] skip: not an object", file=sys.stderr)
                continue

            jobUrl = job.get("jobUrl")
            if not jobUrl:
                print(f"[{index + 1}/{total}] skip: no jobUrl", file=sys.stderr)
                continue

            if (
                job.get("jobResponsibility") is not None
                or job.get("detailPage")
            ):
                print(
                    f"[{index + 1}/{total}] skip: already scraped",
                    file=sys.stderr,
                )
                continue

            label = (job.get("company") or job.get("title") or "")[:60]
            preview = str(jobUrl).strip()[:70]
            print(
                f"[{index + 1}/{total}] {label} — {preview}…",
                file=sys.stderr,
            )

            driver.get(str(jobUrl).strip())
            try:
                waitForJobOverview(driver)
            except TimeoutException:
                print(
                    f"[{index + 1}/{total}] Overview did not load in time.",
                    file=sys.stderr,
                )

            prefix = f"[{index + 1}/{total}] "
            job["detailPage"] = extractJobDetailPageWithRetries(driver, prefix)

            originalJobPostUrl = resolveOriginalJobPostUrl(driver)
            if originalJobPostUrl:
                job["originalJobPostUrl"] = originalJobPostUrl
                print(
                    f"[{index + 1}/{total}] originalJobPostUrl: {originalJobPostUrl}",
                    file=sys.stderr,
                )
            else:
                print(
                    f"[{index + 1}/{total}] originalJobPostUrl: <missing>",
                    file=sys.stderr,
                )

            postScrapeCleanJob(job)

            # saveOutputDocument normalizes/replaces data["jobs"], so keep the
            # current scraped job synchronized by jobId before each save.
            currentJobId = (job.get("jobId") or "").strip()
            if currentJobId:
                for i, existingJob in enumerate(data.get("jobs", [])):
                    if (
                        isinstance(existingJob, dict)
                        and (existingJob.get("jobId") or "").strip() == currentJobId
                    ):
                        data["jobs"][i] = job
                        break

            saveOutputDocument(jsonPath, data)

        promptBeforeClosingBrowserIfHeaded()
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
