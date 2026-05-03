from __future__ import annotations

import json
import os
import re
import sys
import time
from collections.abc import Callable
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

from utils.dataManager import loadKnownJobIdsByPlatform
from utils.scraperTerminalLog import PLATFORM_JOBRIGHT, ScraperRunLog
from utils.startChrome import (
    createScrapingChromeDriver,
    envBool,
    promptBeforeClosingBrowserIfHeaded,
)
from utils.fileManagement import (
    DEFAULT_SCRAPER_SEARCH_KEYWORDS,
    inferPlatformFromPath,
    isCompleteJobRow,
    loadExistingJobsAndMeta,
    loadJobsDocumentOrEmpty,
    mergeFetchedJobs,
    mergeNewJobsIntoDocument,
    resolveOutputJsonPath,
    resolveScraperSearchKeywords,
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
    primary = DEFAULT_SCRAPER_SEARCH_KEYWORDS[0]
    return {
        "value": [primary],
        "searchType": "job_title",
        "country": "US",
        "jobTaxonomyList": [
            {"taxonomyId": "00-00-00", "title": primary},
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


def buildSearchUrlForKeyword(keyword: str) -> str:
    kw = keyword.strip()
    if not kw:
        raise ValueError("Search keyword must be non-empty")
    return buildSearchUrl(
        {
            "value": [kw],
            "jobTaxonomyList": [{"taxonomyId": "00-00-00", "title": kw}],
        }
    )


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
    outputPath: Path,
    url: str,
    timeout: float = 30.0,
    *,
    log: ScraperRunLog | None = None,
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
        blob = body + ("\n... [truncated]" if len(response.text) > 8000 else "")
        if log is not None:
            log.httpErrorBody(blob)
        else:
            print(blob, file=sys.stderr, flush=True)
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


def resolveSearchUrl(cliUrl: str | None) -> str:
    if cliUrl and cliUrl.strip():
        return cliUrl.strip()
    return defaultSearchUrl


def resolveSearchPhases(cliUrl: str | None) -> list[tuple[str, str]]:
    """
    Each phase is (searchUrl, label). One phase finishes list scroll + detail
    scrape before the next. Optional cliUrl forces a single phase.
    Keyword list: SCRAPER_SEARCH_KEYWORDS (see utils.fileManagement).
    """
    if cliUrl and cliUrl.strip():
        return [(cliUrl.strip(), "cli")]
    keywords = resolveScraperSearchKeywords()
    if not keywords:
        return []
    return [(buildSearchUrlForKeyword(kw), kw) for kw in keywords]


# --- Job list fetch (Selenium scroll; matches live virtualized list) ------------

JOB_CARD_CSS = "div.job-card-flag-classname"
JOBS_LIST_SCROLL_CSS = '[class*="jobs-list-scrollable"]'

_INITIAL_LOAD_TIMEOUT = 45
_SCROLL_PAUSE = 0.55
_SCROLL_STATUS_TICK = 0.12
_SCROLL_STATUS_LINE_PAD = 120


def writeJobrightScrollTerminalStatus(
    log: ScraperRunLog,
    *,
    scrollRound: int,
    uniqueJobCount: int,
    bannerTotal: int | None,
    domCardCount: int,
    activity: str,
    sleepSecondsRemaining: float | None = None,
    stagnantRounds: int = 0,
    newIdsLastMerge: int | None = None,
    finalize: bool = False,
) -> None:
    """
    JobRight list-scroll progress: unique count, DOM cards, round, activity.
    Uses shared ScraperRunLog PROGRESS line; carriage return on TTY.
    """
    label = (log.phaseLabel or "search").strip() or "search"
    if bannerTotal is not None:
        countPart = f"unique {uniqueJobCount}/{bannerTotal}"
    else:
        countPart = f"unique {uniqueJobCount}"
    scrollPart = (
        "initial capture"
        if scrollRound == 0
        else f"scroll #{scrollRound}"
    )
    parts = [
        f"list {label[:36]}",
        countPart,
        f"DOM {domCardCount}",
        scrollPart,
        activity,
    ]
    if sleepSecondsRemaining is not None and sleepSecondsRemaining >= 0:
        parts.append(f"sleep {sleepSecondsRemaining:.1f}s")
    if stagnantRounds:
        parts.append(f"no-new×{stagnantRounds}")
    if newIdsLastMerge is not None and newIdsLastMerge > 0:
        parts.append(f"+{newIdsLastMerge} new")

    body = " | ".join(p for p in parts if p)
    tty = sys.stderr.isatty()
    isSleepTick = activity == "sleeping" and sleepSecondsRemaining is not None
    if not tty and isSleepTick:
        return

    log.progressBodyLine(
        body,
        finalize=finalize,
        pad=_SCROLL_STATUS_LINE_PAD,
    )


def _sleepChunkedWithStatus(
    totalSec: float,
    tick: float,
    onRemain: Callable[[float], None],
) -> None:
    """Sleep in small steps while onRemain(remainingBeforeChunk) updates the terminal."""
    rem = float(totalSec)
    if rem <= 0:
        return
    step = max(0.05, min(float(tick), rem))
    while rem > 1e-9:
        chunk = min(step, rem)
        onRemain(rem)
        time.sleep(chunk)
        rem -= chunk


def _scrollMaxRounds() -> int:
    try:
        return max(1, int(os.getenv("JOBRIGHT_SCROLL_MAX_ROUNDS", "150")))
    except ValueError:
        return 150


def _scrollStagnantLimit() -> int:
    try:
        return max(1, int(os.getenv("JOBRIGHT_SCROLL_STAGNANT_LIMIT", "6")))
    except ValueError:
        return 6


def _countJobCards(driver) -> int:
    return len(driver.find_elements(By.CSS_SELECTOR, JOB_CARD_CSS))


def _waitForFirstJobCards(driver, timeout: float = _INITIAL_LOAD_TIMEOUT) -> None:
    def _listAndCardsReady(d) -> bool:
        return bool(
            d.find_elements(By.CSS_SELECTOR, JOBS_LIST_SCROLL_CSS)
            and d.find_elements(By.CSS_SELECTOR, JOB_CARD_CSS)
        )

    WebDriverWait(driver, timeout).until(_listAndCardsReady)


def _tryParseResultsBannerText(driver) -> str | None:
    try:
        body = driver.find_element(By.TAG_NAME, "body").text
    except Exception:
        return None
    m = re.search(r"(\d+)\s+results\s+for", body, re.I)
    return m.group(0).strip() if m else None


def _parseResultsTotalFromBanner(driver) -> int | None:
    try:
        body = driver.find_element(By.TAG_NAME, "body").text
    except Exception:
        return None
    m = re.search(r"(\d+)\s+results\s+for", body, re.I)
    return int(m.group(1)) if m else None


def _relText(root, selector: str) -> str | None:
    try:
        el = root.find_element(By.CSS_SELECTOR, selector)
        t = (el.text or "").strip()
        return t if t else None
    except NoSuchElementException:
        return None


def _recommendationNotes(card) -> str | None:
    def fromRoot(root) -> str | None:
        try:
            els = root.find_elements(
                By.CSS_SELECTOR, '[class*="recommendation-tag-text"]'
            )
            parts = [e.text.strip() for e in els if e.text and e.text.strip()]
            return " | ".join(parts) if parts else None
        except StaleElementReferenceException:
            return None

    n = fromRoot(card)
    if n:
        return n
    try:
        parent = card.find_element(By.XPATH, "./..")
        return fromRoot(parent)
    except (NoSuchElementException, StaleElementReferenceException):
        return None


def extractJobFromListCard(card) -> dict[str, str | None] | None:
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
        jobUrl = urljoin(jobrightOrigin, path) if path.startswith("/") else path

        firstRow: list[str] = []
        secondRow: list[str] = []
        rows = card.find_elements(By.CSS_SELECTOR, '[class*="job-metadata-row"]')
        if len(rows) >= 1:
            for item in rows[0].find_elements(
                By.CSS_SELECTOR, JOB_METADATA_ITEM_SELECTOR
            ):
                try:
                    sp = item.find_element(By.CSS_SELECTOR, "span")
                    t = (sp.text or "").strip()
                    if t:
                        firstRow.append(t)
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
                        secondRow.append(t)
                except (NoSuchElementException, StaleElementReferenceException):
                    pass

        location = firstRow[0] if len(firstRow) > 0 else None
        employmentType = firstRow[1] if len(firstRow) > 1 else None
        salaryRange = firstRow[2] if len(firstRow) >= 3 else None
        workModel = secondRow[0] if len(secondRow) > 0 else None
        seniority = secondRow[1] if len(secondRow) > 1 else None
        experience = secondRow[2] if len(secondRow) > 2 else None

        return {
            "jobId": jid,
            "jobUrl": jobUrl,
            "title": _relText(card, '[class*="job-title"]'),
            "postedAgo": _relText(card, '[class*="publish-time"]'),
            "company": _relText(card, '[class*="company-name"]'),
            "industryTag": _relText(card, '[class*="job-tag"]'),
            "applicants": _relText(card, '[class*="apply-time"]'),
            "visaOrMatchNote": _recommendationNotes(card),
            "location": location,
            "employmentType": employmentType,
            "salaryRange": salaryRange,
            "workModel": workModel,
            "seniority": seniority,
            "experience": experience,
        }
    except StaleElementReferenceException:
        return None


def _extractVisibleJobs(driver) -> list[dict[str, str | None]]:
    out: list[dict[str, str | None]] = []
    for card in driver.find_elements(By.CSS_SELECTOR, JOB_CARD_CSS):
        job = extractJobFromListCard(card)
        if job:
            out.append(job)
    return out


def _saveScrollDebugJson(
    path: Path,
    byId: dict[str, dict[str, str | None]],
    *,
    searchUrl: str,
    bannerTotal: int | None,
) -> None:
    jobs = list(byId.values())
    jobs.sort(key=lambda j: (j.get("company") or "", j.get("title") or ""))
    payload = {
        "source": "jobright_scroll_capture",
        "searchUrl": searchUrl,
        "bannerTotal": bannerTotal,
        "uniqueCount": len(byId),
        "jobs": jobs,
    }
    ok, msg = saveJsonPayload(path, payload)
    if not ok:
        raise OSError(msg)


def _mergeVisibleInto(
    driver,
    byId: dict[str, dict[str, str | None]],
    *,
    searchUrl: str,
    bannerTotal: int | None,
    path: Path | None,
) -> tuple[int, int]:
    before = len(byId)
    for job in _extractVisibleJobs(driver):
        jid = job.get("jobId")
        if isinstance(jid, str) and jid:
            byId[jid] = job
    if path is not None:
        _saveScrollDebugJson(
            path, byId, searchUrl=searchUrl, bannerTotal=bannerTotal
        )
    return before, len(byId) - before


def _scrollJobListToEndOnce(
    driver,
    log: ScraperRunLog,
    *,
    scrollRound: int,
    bannerTotal: int | None,
    uniqueCount: Callable[[], int],
    stagnant: int,
) -> None:
    def status(
        activity: str,
        sleepLeft: float | None = None,
        finalize: bool = False,
    ) -> None:
        writeJobrightScrollTerminalStatus(
            log,
            scrollRound=scrollRound,
            uniqueJobCount=uniqueCount(),
            bannerTotal=bannerTotal,
            domCardCount=_countJobCards(driver),
            activity=activity,
            sleepSecondsRemaining=sleepLeft,
            stagnantRounds=stagnant,
            finalize=finalize,
        )

    cards = driver.find_elements(By.CSS_SELECTOR, JOB_CARD_CSS)
    if not cards:
        status("scrolling (no cards visible)")
        return
    status("scrolling into view")
    lastCard = cards[-1]
    driver.execute_script(
        """
        const card = arguments[0];
        card.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' });
        """,
        lastCard,
    )

    def sleepTick(rem: float) -> None:
        status("sleeping", sleepLeft=rem)

    _sleepChunkedWithStatus(0.2, _SCROLL_STATUS_TICK, sleepTick)
    status("scrolling list pane")
    listEl = driver.find_element(By.CSS_SELECTOR, JOBS_LIST_SCROLL_CSS)
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
        listEl,
    )
    _sleepChunkedWithStatus(_SCROLL_PAUSE, _SCROLL_STATUS_TICK, sleepTick)


def _isListScrolledToBottom(driver) -> bool:
    try:
        listEl = driver.find_element(By.CSS_SELECTOR, JOBS_LIST_SCROLL_CSS)
        return bool(
            driver.execute_script(
                """
                const p = arguments[0];
                return p.scrollTop + p.clientHeight >= p.scrollHeight - 4;
                """,
                listEl,
            )
        )
    except NoSuchElementException:
        return False


def scrollJobListUntilDone(
    driver,
    log: ScraperRunLog,
    searchUrl: str,
    *,
    progressJsonPath: Path | None = None,
    phaseLabel: str = "",
) -> list[dict[str, str | None]]:
    """
    Load searchUrl, scroll the virtual job list, dedupe by jobId, return card rows.
    If progressJsonPath is set, writes the same debug snapshot after each merge
    (for test.py / inspection).
    """
    phase = phaseLabel.strip() or "search"
    log.bindPhase(phase)

    driver.get(searchUrl)
    writeJobrightScrollTerminalStatus(
        log,
        scrollRound=0,
        uniqueJobCount=0,
        bannerTotal=None,
        domCardCount=0,
        activity="loading page",
    )
    _waitForFirstJobCards(driver)

    def settle(rem: float) -> None:
        writeJobrightScrollTerminalStatus(
            log,
            scrollRound=0,
            uniqueJobCount=0,
            bannerTotal=None,
            domCardCount=_countJobCards(driver),
            activity="settling",
            sleepSecondsRemaining=rem,
        )

    _sleepChunkedWithStatus(0.8, _SCROLL_STATUS_TICK, settle)

    byId: dict[str, dict[str, str | None]] = {}
    bannerTotal = _parseResultsTotalFromBanner(driver)
    uniqueFn = lambda: len(byId)

    writeJobrightScrollTerminalStatus(
        log,
        scrollRound=0,
        uniqueJobCount=0,
        bannerTotal=bannerTotal,
        domCardCount=_countJobCards(driver),
        activity="merging first viewport",
    )
    _, newFirst = _mergeVisibleInto(
        driver,
        byId,
        searchUrl=searchUrl,
        bannerTotal=bannerTotal,
        path=progressJsonPath,
    )
    writeJobrightScrollTerminalStatus(
        log,
        scrollRound=0,
        uniqueJobCount=uniqueFn(),
        bannerTotal=bannerTotal,
        domCardCount=_countJobCards(driver),
        activity="merged viewport",
        newIdsLastMerge=newFirst,
    )

    maxRounds = _scrollMaxRounds()
    stagnantLimit = _scrollStagnantLimit()
    stagnant = 0
    lastScrollRound = 0
    for scrollRound in range(1, maxRounds + 1):
        if bannerTotal is not None and len(byId) >= bannerTotal:
            break

        lastScrollRound = scrollRound
        _scrollJobListToEndOnce(
            driver,
            log,
            scrollRound=scrollRound,
            bannerTotal=bannerTotal,
            uniqueCount=uniqueFn,
            stagnant=stagnant,
        )
        _, newIds = _mergeVisibleInto(
            driver,
            byId,
            searchUrl=searchUrl,
            bannerTotal=bannerTotal,
            path=progressJsonPath,
        )
        writeJobrightScrollTerminalStatus(
            log,
            scrollRound=scrollRound,
            uniqueJobCount=uniqueFn(),
            bannerTotal=bannerTotal,
            domCardCount=_countJobCards(driver),
            activity="merged after scroll",
            stagnantRounds=stagnant,
            newIdsLastMerge=newIds,
        )
        if bannerTotal is not None and len(byId) >= bannerTotal:
            break

        if newIds == 0:
            stagnant += 1
        else:
            stagnant = 0

        if stagnant >= stagnantLimit:
            break

    writeJobrightScrollTerminalStatus(
        log,
        scrollRound=lastScrollRound,
        uniqueJobCount=uniqueFn(),
        bannerTotal=bannerTotal,
        domCardCount=_countJobCards(driver),
        activity="list scroll complete",
        stagnantRounds=stagnant,
        finalize=True,
    )
    return list(byId.values())


def fetchAndMergeSearchSelenium(
    driver,
    outputPath: Path,
    url: str,
    log: ScraperRunLog,
    *,
    phaseLabel: str = "",
) -> tuple[bool, str, dict | None]:
    """
    Scroll-capture the job list in the browser, merge new rows into outputPath
    (same semantics as fetchAndMergeSearchHtml for HTML cards).
    """
    dbg = os.getenv("JOBRIGHT_SCROLL_DEBUG_JSON")
    progressPath: Path | None = None
    if isinstance(dbg, str) and dbg.strip():
        progressPath = Path(dbg.strip())

    try:
        fetched = scrollJobListUntilDone(
            driver,
            log,
            url,
            progressJsonPath=progressPath,
            phaseLabel=phaseLabel,
        )
    except TimeoutException as exc:
        return False, f"Job list did not load in time: {exc}", None
    except Exception as exc:
        return False, str(exc), None

    data = loadJobsDocumentOrEmpty(outputPath)
    ensureSkippedOriginalUrlIds(data)
    appended = 0
    skipped = 0
    for row in fetched:
        added, skippedOne = mergeNewJobsIntoDocument(data, [row])
        if added:
            appended += 1
            try:
                saveOutputDocument(outputPath, data)
            except OSError as exc:
                return False, f"Failed to save merged jobs: {exc}", None
        else:
            skipped += skippedOne
    return (
        True,
        f"Merged into {outputPath.resolve()}: +{appended} new, {skipped} skipped "
        "(duplicate jobId or invalid row).",
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


def dismissOrionCoverLetterTourIfPresent(
    driver, log: ScraperRunLog | None = None
) -> None:
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
            if log is not None:
                log.info("Closed Orion cover-letter tour (EXIT).")
            else:
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


def resolveOriginalJobPostUrl(
    driver, log: ScraperRunLog | None = None
) -> str | None:
    """Try the Original Job Post link first; only dismiss the Orion tour if not found, then retry."""
    time.sleep(0.3)
    url = getOriginalJobPostUrl(driver)
    if url:
        return url
    dismissOrionCoverLetterTourIfPresent(driver, log)
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


def extractJobDetailPageWithRetries(driver) -> dict:
    """Run extractJobDetailPage with retries on StaleElementReferenceException."""
    staleRetries = scrapingStaleRetries()
    staleDelay = scrapingStaleDelaySec()
    for attempt in range(1, staleRetries + 1):
        try:
            return extractJobDetailPage(driver)
        except StaleElementReferenceException:
            if attempt >= staleRetries:
                return {}
            time.sleep(staleDelay * attempt)


def _driverGetWithRetries(
    driver,
    url: str,
    *,
    log: ScraperRunLog | None = None,
    maxAttempts: int = 3,
) -> None:
    """Navigate with retries after Chrome/WebDriver connection resets (WinError 10054)."""
    delay = 1.0
    for attempt in range(1, maxAttempts + 1):
        try:
            driver.get(url)
            return
        except Exception as exc:
            if attempt >= maxAttempts:
                raise
            if log is not None:
                log.driverRetry(attempt, maxAttempts, exc)
            else:
                print(
                    f"driver.get failed ({exc!r}); retry {attempt}/{maxAttempts - 1}…",
                    file=sys.stderr,
                    flush=True,
                )
            time.sleep(delay * attempt)


def _jobNeedsDetailPass(job: object, knownJobIdsBeforeRun: set[str]) -> bool:
    if not isinstance(job, dict):
        return False
    jid = str(job.get("jobId") or "").strip()
    if jid and jid in knownJobIdsBeforeRun:
        return False
    if not job.get("jobUrl"):
        return False
    return not isCompleteJobRow(job)


def scrapePendingJobDetails(
    driver,
    jsonPath: Path,
    data: dict,
    knownJobIdsBeforeRun: set[str],
    log: ScraperRunLog,
    phaseLabel: str,
) -> None:
    """Open each pending job URL, scrape detail DOM, merge into data, save after each job."""
    jobs = data["jobs"]
    log.bindPhase(phaseLabel)
    pending = [j for j in jobs if _jobNeedsDetailPass(j, knownJobIdsBeforeRun)]
    totalPending = len(pending)
    if not totalPending:
        log.info("No jobs need a detail pass (all complete or skipped).")
        return

    for index, job in enumerate(pending):
        n = index + 1
        jobUrl = job.get("jobUrl")
        preview = str(jobUrl).strip()[:70]
        statusBits: list[str] = []

        _driverGetWithRetries(
            driver,
            str(jobUrl).strip(),
            log=log,
        )
        try:
            waitForJobOverview(driver)
        except TimeoutException:
            statusBits.append("overview timeout")

        job["detailPage"] = extractJobDetailPageWithRetries(driver)

        originalJobPostUrl = resolveOriginalJobPostUrl(driver, log)
        if originalJobPostUrl:
            job["originalJobPostUrl"] = originalJobPostUrl
        if not job.get("detailPage"):
            statusBits.append("empty detailPage")

        postScrapeCleanJob(job)

        label = (job.get("companyName") or job.get("title") or "")[:60] or "?"
        applyShow = (originalJobPostUrl or "<missing>").strip()
        if len(applyShow) > 90:
            applyShow = applyShow[:87] + "…"
        extra = f" [{'; '.join(statusBits)}]" if statusBits else ""
        log.jobLine(
            n,
            totalPending,
            f"{label} — {preview}… | apply: {applyShow}{extra}",
        )

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


def main() -> None:
    runLog = ScraperRunLog(PLATFORM_JOBRIGHT)
    try:
        outPath = JOBRIGHT_SOURCE_PATH
    except ValueError as exc:
        runLog.error(str(exc))
        raise SystemExit(1) from exc

    platform = inferPlatformFromPath(outPath)
    knownJobIdsBeforeRun = set(loadKnownJobIdsByPlatform(platform))
    runLog.existingJobsNotice(len(knownJobIdsBeforeRun), outPath.name)

    phases = resolveSearchPhases(None)
    if not phases:
        runLog.error("No search keywords or URLs configured.")
        raise SystemExit(1)

    try:
        driver = createScrapingChromeDriver(
            headless=envBool("SCRAPING_HEADLESS", default=True),
            quiet=True,
        )
    except ValueError as exc:
        runLog.error(str(exc))
        raise SystemExit(1)

    try:
        driver.set_page_load_timeout(120)
        jsonPath = outPath

        for phaseNum, (searchUrl, phaseLabel) in enumerate(phases, start=1):
            runLog.bindPhase(phaseLabel)
            runLog.phaseStart(
                phaseNum,
                len(phases),
                phaseLabel,
                "list scroll, then detail scrape",
            )
            ok, msg, data = fetchAndMergeSearchSelenium(
                driver,
                outPath,
                searchUrl,
                runLog,
                phaseLabel=phaseLabel,
            )
            if not ok:
                runLog.error(msg)
                raise SystemExit(1)
            runLog.info(msg)
            if not isinstance(data, dict):
                data = loadJobsDocumentOrEmpty(outPath)
            ensureSkippedOriginalUrlIds(data)
            saveOutputDocument(jsonPath, data)

            scrapePendingJobDetails(
                driver,
                jsonPath,
                data,
                knownJobIdsBeforeRun,
                runLog,
                phaseLabel=phaseLabel,
            )

        promptBeforeClosingBrowserIfHeaded()
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
