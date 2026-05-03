from __future__ import annotations

import os
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

from dotenv import load_dotenv
from selenium.common.exceptions import (
    ElementClickInterceptedException,
    NoSuchElementException,
    StaleElementReferenceException,
    TimeoutException,
)
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from utils.scraperTerminalLog import PLATFORM_GLASSDOOR, ScraperRunLog
from utils.startChrome import (
    createScrapingChromeDriver,
    envBool,
)
from utils.dataManager import loadKnownJobIdsByPlatform
from utils.fileManagement import (
    DEFAULT_SCRAPER_SEARCH_KEYWORDS,
    inferPlatformFromPath,
    loadJobsDocumentOrEmpty,
    mergeNewJobsIntoDocument,
    resolveOutputJsonPath,
    resolveScraperSearchKeywords,
    saveOutputDocument,
)

load_dotenv()


def getDefaultGlassdoorSearchParams() -> dict[str, str]:
    primary = DEFAULT_SCRAPER_SEARCH_KEYWORDS[0]
    return {
        "location": "united-states",
        "role": primary,
        "fromAge": "1",  # show jobs posted in the last N days
        "sortBy": "date_desc",  # newest first
    }


def glassdoorRolePathSegment(role: str) -> str:
    """Glassdoor job URLs use hyphenated role slugs (e.g. assembly developer → assembly-developer)."""
    return "-".join((role or "").strip().lower().split())


def buildDefaultGlassdoorSearchUrl(params: dict[str, str] | None = None) -> str:
    if params is None:
        params = getDefaultGlassdoorSearchParams()
    base = "https://www.glassdoor.ca/Job"
    location = params.get("location", "united-states")
    roleRaw = params.get("role", "devops")
    roleSlug = glassdoorRolePathSegment(roleRaw)
    koStart = len(location) + 1
    koEnd = koStart + len(roleSlug)
    path = f"{location}-{roleSlug}-jobs-SRCH_IL.0,13_IN1_KO{koStart},{koEnd}.htm"
    query = {k: v for k, v in params.items() if k not in ("location", "role")}
    from urllib.parse import urlencode
    url = f"{base}/{path}"
    if query:
        url += "?" + urlencode(query)
    return url

defaultGlassdoorSearchUrl = buildDefaultGlassdoorSearchUrl()
GLASSDOOR_SOURCE_PATH = resolveOutputJsonPath("glassdoor.source")


def buildGlassdoorSearchUrlForKeyword(keyword: str) -> str:
    kw = keyword.strip()
    if not kw:
        raise ValueError("Glassdoor search keyword must be non-empty")
    params = {**getDefaultGlassdoorSearchParams(), "role": kw}
    return buildDefaultGlassdoorSearchUrl(params)


def resolveGlassdoorSearchUrl(cliUrl: str | None = None) -> str:
    """Optional URL arg, else default Glassdoor search URL."""
    if cliUrl and str(cliUrl).strip():
        return str(cliUrl).strip()
    return defaultGlassdoorSearchUrl


def resolveGlassdoorSearchPhases(cliUrl: str | None = None) -> list[tuple[str, str]]:
    """
    Each phase is (searchUrl, label). One phase finishes list + detail scrape
    before the next. Optional cliUrl forces a single phase.
    Keyword list: SCRAPER_SEARCH_KEYWORDS (see utils.fileManagement).
    """
    if cliUrl and str(cliUrl).strip():
        return [(str(cliUrl).strip(), "cli")]
    keywords = resolveScraperSearchKeywords()
    if not keywords:
        return []
    return [(buildGlassdoorSearchUrlForKeyword(kw), kw) for kw in keywords]


def glassdoorJobIdToJobId(glassdoorJobId: str | None) -> str:
    gid = (glassdoorJobId or "").strip()
    return f"gdj_{gid}" if gid else ""


def existingJobIdsFromOutputData(data: dict) -> set[str]:
    """In-memory job rows and skip-bucket ids (e.g. Easy Apply) for this run."""
    jobs = data.get("jobs")
    out: set[str] = set()
    if isinstance(jobs, list):
        for j in jobs:
            if isinstance(j, dict):
                jid = j.get("jobId")
                if isinstance(jid, str) and jid.strip():
                    out.add(jid.strip())
    skipIds = data.get(skippedOriginalUrlIdsKey)
    if isinstance(skipIds, list):
        for sid in skipIds:
            if isinstance(sid, str) and sid.strip():
                out.add(sid.strip())
    return out


def existingJobIdsKnownBeforeScrape(data: dict, outputPath: Path) -> set[str]:
    """
    All jobIds we should not open again: SQLite jobData ∪ pastData for this platform,
    plus any ids already in the working document / skip bucket.
    """
    platform = inferPlatformFromPath(outputPath)
    return set(loadKnownJobIdsByPlatform(platform)) | existingJobIdsFromOutputData(data)


def ensureSkippedOriginalUrlIds(data: dict) -> None:
    bucket = data.get(skippedOriginalUrlIdsKey)
    if isinstance(bucket, list):
        return
    data[skippedOriginalUrlIdsKey] = []


def readIntEnv(name: str, default: int, *, minimum: int = 1) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except ValueError:
        return default


listWaitSec = readIntEnv("GLASSDOOR_LIST_WAIT_SEC", 45, minimum=5)
detailWaitSec = readIntEnv("GLASSDOOR_DETAIL_WAIT_SEC", 20, minimum=5)
loadMoreMaxClicks = readIntEnv("GLASSDOOR_LOAD_MORE_MAX", 200, minimum=1)

jobListItem = 'li[data-test="jobListing"]'
jobsListUl = 'ul[aria-label="Jobs List"]'
loadMoreButton = 'button[data-test="load-more"]'

easyApplyLabel = "Easy Apply"
applyOnEmployerSiteLabel = "Apply on employer site"
skippedOriginalUrlIdsKey = "skippedOriginalUrlIds"

authModalClose = '[data-test="auth-modal-close-button"]'
jobAlertModalClose = '[data-test="job-alert-modal-close"]'
indeedArbitrationAccept = (
    '[data-test="indeed-arbitration-modal-cta"] button[data-role-variant="primary"]'
)
JS_CLICK = "arguments[0].click();"


def httpJobUrl(u: str) -> bool:
    s = (u or "").strip()
    return s.startswith("http") and "about:blank" not in s.lower()


def waitNewTabUrlFullyLoaded(driver, maxWait: float) -> str:
    """
    Wait for a real HTTP URL, document.readyState complete (bounded), then URL
    stability so SPAs / redirects finish before we read the final address.
    """
    maxWait = max(10.0, min(float(maxWait), 90.0))
    try:
        WebDriverWait(driver, int(maxWait)).until(
            lambda d: httpJobUrl((d.current_url or "").strip())
        )
    except TimeoutException:
        u = (driver.current_url or "").strip()
        return u if httpJobUrl(u) else ""

    try:
        WebDriverWait(driver, min(25, int(maxWait))).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )
    except TimeoutException:
        pass

    deadline = time.monotonic() + min(18.0, maxWait)
    last = (driver.current_url or "").strip()
    while time.monotonic() < deadline:
        time.sleep(0.45)
        cur = (driver.current_url or "").strip()
        if httpJobUrl(cur) and cur == last:
            time.sleep(0.5)
            if (driver.current_url or "").strip() == cur:
                return cur
        last = cur
    u = (driver.current_url or "").strip()
    return u if httpJobUrl(u) else ""


def normalizeUrlForCompare(url: str) -> str:
    raw = (url or "").strip()
    if not raw:
        return ""
    try:
        p = urlparse(raw)
        path = (p.path or "").rstrip("/")
        return f"{p.scheme.lower()}://{(p.netloc or '').lower()}{path}"
    except Exception:
        return raw.rstrip("/").lower()


def urlsLookSame(urlA: str, urlB: str) -> bool:
    a = normalizeUrlForCompare(urlA)
    b = normalizeUrlForCompare(urlB)
    return bool(a and b and a == b)


def isRobotChallengePage(driver) -> bool:
    try:
        urlBlob = (driver.current_url or "").lower()
    except Exception:
        urlBlob = ""
    try:
        bodyBlob = (driver.page_source or "").lower()
    except Exception:
        bodyBlob = ""
    blob = f"{urlBlob}\n{bodyBlob}"
    markers = (
        "are you a robot",
        "verify you are human",
        "verify you're human",
        "captcha",
        "recaptcha",
        "hcaptcha",
        "turnstile",
        "cf-challenge",
    )
    return any(m in blob for m in markers)


def clickRobotChallengeCheckbox(driver) -> bool:
    selectors = (
        'input[type="checkbox"]',
        '[role="checkbox"]',
        '#recaptcha-anchor',
        '.recaptcha-checkbox-border',
        'label[for*="captcha"]',
    )
    for sel in selectors:
        for el in driver.find_elements(By.CSS_SELECTOR, sel):
            try:
                if not el.is_displayed():
                    continue
                driver.execute_script(
                    "arguments[0].scrollIntoView({block:'center', inline:'nearest'});",
                    el,
                )
                time.sleep(0.2)
                try:
                    el.click()
                except Exception:
                    driver.execute_script(JS_CLICK, el)
                return True
            except Exception:
                continue

    try:
        iframes = driver.find_elements(By.CSS_SELECTOR, "iframe")
    except Exception:
        iframes = []
    for frame in iframes:
        try:
            driver.switch_to.frame(frame)
            for sel in selectors:
                for el in driver.find_elements(By.CSS_SELECTOR, sel):
                    try:
                        if not el.is_displayed():
                            continue
                        driver.execute_script(
                            "arguments[0].scrollIntoView({block:'center', inline:'nearest'});",
                            el,
                        )
                        time.sleep(0.2)
                        try:
                            el.click()
                        except Exception:
                            driver.execute_script(JS_CLICK, el)
                        driver.switch_to.default_content()
                        return True
                    except Exception:
                        continue
            driver.switch_to.default_content()
        except Exception:
            try:
                driver.switch_to.default_content()
            except Exception:
                pass
            continue
    return False


def resolveRobotChallengeUrl(
    driver,
    currentUrl: str,
    glassdoorUrl: str,
    waitSec: float,
) -> str:
    """
    If apply URL still looks like Glassdoor or challenge page, try robot checkbox,
    wait for navigation, then return latest loaded URL.
    """
    needsRobotCheck = urlsLookSame(currentUrl, glassdoorUrl) or isRobotChallengePage(driver)
    if not needsRobotCheck:
        return currentUrl

    clicked = clickRobotChallengeCheckbox(driver)
    if clicked:
        time.sleep(0.6)
    try:
        WebDriverWait(driver, int(max(6.0, min(waitSec, 30.0)))).until(
            lambda d: (
                httpJobUrl((d.current_url or "").strip())
                and not urlsLookSame((d.current_url or "").strip(), glassdoorUrl)
            )
            or not isRobotChallengePage(d)
        )
    except TimeoutException:
        pass

    return waitNewTabUrlFullyLoaded(driver, waitSec)


def captureNewTabUrlThenClose(
    driver,
    handlesBefore: set[str],
    returnToHandle: str,
    *,
    waitSec: float = 22.0,
) -> str | None:
    """
    If Accept TNC (or similar) opened a new window, switch to it, read the URL,
    close that tab, and return focus to the Glassdoor tab.
    """
    deadline = time.monotonic() + waitSec
    newHandle: str | None = None
    while time.monotonic() < deadline:
        now = set(driver.window_handles)
        fresh = [h for h in now if h not in handlesBefore]
        if fresh:
            newHandle = fresh[-1]
            break
        time.sleep(0.12)
    if not newHandle:
        return None

    url = ""
    try:
        driver.switch_to.window(newHandle)
        url = waitNewTabUrlFullyLoaded(driver, waitSec)
    finally:
        try:
            driver.close()
        except Exception:
            pass
        try:
            driver.switch_to.window(returnToHandle)
        except Exception:
            if driver.window_handles:
                driver.switch_to.window(driver.window_handles[0])
    if httpJobUrl(url):
        return url
    return None


def acceptIndeedArbitrationModalIfPresent(driver) -> tuple[bool, str | None]:
    """
    Glassdoor (Indeed) sometimes shows 'Important updates to Indeed's Terms of Service'.
    Click 'Accept Terms and continue' when that modal is present.
    """
    containers = driver.find_elements(
        By.CSS_SELECTOR, '[data-test="indeed-arbitration-modal-container"]'
    )
    visible = False
    for c in containers:
        try:
            if c.is_displayed():
                visible = True
                break
        except StaleElementReferenceException:
            continue
    if not visible:
        return False, None

    def _tryClick(btn) -> bool:
        try:
            driver.execute_script(
                "arguments[0].scrollIntoView({block:'center', inline:'nearest'});",
                btn,
            )
            time.sleep(0.15)
            try:
                btn.click()
            except Exception:
                driver.execute_script(JS_CLICK, btn)
            time.sleep(1.0)
            return True
        except StaleElementReferenceException:
            return False

    try:
        btn = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, indeedArbitrationAccept))
        )
        handlesBefore = set(driver.window_handles)
        returnHandle = driver.current_window_handle
        if _tryClick(btn):
            tncUrl = captureNewTabUrlThenClose(
                driver, handlesBefore, returnHandle
            )
            return True, tncUrl
    except TimeoutException:
        pass

    for xp in (
        "//div[@data-test='indeed-arbitration-modal-cta']//button[@data-role-variant='primary']",
        "//button[.//span[contains(normalize-space(.), 'Accept Terms and continue')]]",
    ):
        try:
            btn = driver.find_element(By.XPATH, xp)
            if not btn.is_displayed():
                continue
            handlesBefore = set(driver.window_handles)
            returnHandle = driver.current_window_handle
            if _tryClick(btn):
                tncUrl = captureNewTabUrlThenClose(
                    driver, handlesBefore, returnHandle
                )
                return True, tncUrl
        except NoSuchElementException:
            continue
        except StaleElementReferenceException:
            continue
    return False, None


def closeJobAlertModalIfPresent(driver) -> bool:
    for btn in driver.find_elements(By.CSS_SELECTOR, jobAlertModalClose):
        try:
            if not btn.is_displayed():
                continue
            driver.execute_script(
                "arguments[0].scrollIntoView({block:'center', inline:'nearest'});",
                btn,
            )
            time.sleep(0.1)
            try:
                btn.click()
            except Exception:
                driver.execute_script(JS_CLICK, btn)
            time.sleep(0.35)
            return True
        except StaleElementReferenceException:
            continue
    return False


def dismissUnifiedAuthModalIfPresent(driver) -> tuple[bool, str | None]:
    """
    Accept Indeed ToS / arbitration modal if shown, then close Glassdoor / Indeed
    'Never Miss an Opportunity' modal if it blocks the page.
    Returns (whether any action was taken, employer URL if Accept TNC opened a new tab).
    """
    tookAction, tncUrl = acceptIndeedArbitrationModalIfPresent(driver)
    if closeJobAlertModalIfPresent(driver):
        tookAction = True
    for btn in driver.find_elements(By.CSS_SELECTOR, authModalClose):
        try:
            if btn.is_displayed():
                driver.execute_script(JS_CLICK, btn)
                time.sleep(0.5)
                return True, tncUrl
        except StaleElementReferenceException:
            continue
    return tookAction, tncUrl


def drainBlockingGlassdoorModals(driver, maxRounds: int = 8) -> list[str]:
    """Dismiss Indeed ToS / auth nag repeatedly; collect employer URLs from new tabs."""
    collected: list[str] = []
    for _ in range(maxRounds):
        took, url = dismissUnifiedAuthModalIfPresent(driver)
        if url:
            collected.append(url)
        if not took:
            break
        time.sleep(0.35)
    return collected


def resolveEmployerApplyUrl(primary: str | None, extraHttpUrls: list[str]) -> str:
    """Prefer apply-flow URL; else last http URL from TNC / drain (new-tab capture)."""
    if primary and primary.startswith("http"):
        return primary
    if primary == easyApplyLabel:
        return easyApplyLabel
    for u in reversed(extraHttpUrls):
        if u.startswith("http"):
            return u
    if primary:
        return primary
    return applyOnEmployerSiteLabel


def elementText(root, selector: str) -> str:
    try:
        node = root.find_element(By.CSS_SELECTOR, selector)
        return (node.text or "").strip()
    except NoSuchElementException:
        return ""


def elementAttr(root, selector: str, name: str) -> str:
    try:
        node = root.find_element(By.CSS_SELECTOR, selector)
        v = node.get_attribute(name)
        return (v or "").strip()
    except NoSuchElementException:
        return ""


def skillsFromCard(li) -> str:
    raw = elementText(li, '[data-test="descSnippet"]')
    match = re.search(r"Skills:\s*(.+)", raw, re.I | re.DOTALL)
    if not match:
        return ""
    line = match.group(1).strip()
    line = re.sub(r"\s+", " ", line)
    return line.split("…")[0].strip().strip(",")


def absoluteUrl(driver, href: str | None) -> str | None:
    if not href:
        return None
    if href.startswith("http"):
        return href
    base = f"{urlparse(driver.current_url).scheme}://{urlparse(driver.current_url).netloc}"
    return urljoin(base, href)


def originalApplyValue(driver) -> tuple[str | None, list[str]]:
    """
    Resolve external apply URL from Glassdoor apply flow when possible.
    Returns (primary label or URL, extra http URLs from post-flow modal drain / TNC tabs).
    """
    primary: str | None = None
    try:
        try:
            el = driver.find_element(By.CSS_SELECTOR, '[data-test="easyApply"]')
            if el.is_displayed():
                t = (el.text or "").strip().lower()
                if "sign in" in t or "easy" in t:
                    primary = easyApplyLabel
        except NoSuchElementException:
            pass

        def _uncheckPreApplyBoxes() -> None:
            try:
                checkedBoxes = driver.find_elements(
                    By.CSS_SELECTOR,
                    'dialog[open] input[type="checkbox"]:checked',
                )
            except Exception:
                checkedBoxes = []
            for box in checkedBoxes:
                try:
                    driver.execute_script(
                        """
                        arguments[0].checked = false;
                        arguments[0].dispatchEvent(new Event('input', {bubbles:true}));
                        arguments[0].dispatchEvent(new Event('change', {bubbles:true}));
                        """,
                        box,
                    )
                except Exception:
                    continue

        def _extractUrlFromStartButton(btn) -> str | None:
            for attr in ("href", "data-href", "data-url", "formaction"):
                value = (btn.get_attribute(attr) or "").strip()
                if value.startswith("http"):
                    return value
            return None

        if primary != easyApplyLabel:
            try:
                el = driver.find_element(By.CSS_SELECTOR, '[data-test="applyButton"]')
                if el.is_displayed():
                    beforeUrl = driver.current_url
                    beforeHandles = set(driver.window_handles)
                    driver.execute_script(JS_CLICK, el)
                    time.sleep(0.5)

                    startBtn = None
                    try:
                        startBtn = WebDriverWait(driver, 6).until(
                            EC.presence_of_element_located(
                                (By.CSS_SELECTOR, '[data-test="start-application-button"]')
                            )
                        )
                    except TimeoutException:
                        startBtn = None

                    gotUrl = False
                    if startBtn is not None:
                        _uncheckPreApplyBoxes()

                        directUrl = _extractUrlFromStartButton(startBtn)
                        if directUrl:
                            primary = directUrl
                            gotUrl = True
                        else:
                            driver.execute_script(JS_CLICK, startBtn)
                            time.sleep(1.5)

                            afterHandles = set(driver.window_handles)
                            newHandles = list(afterHandles - beforeHandles)
                            if newHandles:
                                newHandle = newHandles[0]
                                driver.switch_to.window(newHandle)
                                externalUrl = waitNewTabUrlFullyLoaded(
                                    driver, float(detailWaitSec) * 2.5
                                )
                                externalUrl = resolveRobotChallengeUrl(
                                    driver,
                                    externalUrl,
                                    beforeUrl,
                                    float(detailWaitSec) * 2.5,
                                )
                                try:
                                    driver.close()
                                except Exception:
                                    pass
                                remaining = list(beforeHandles)
                                if remaining:
                                    driver.switch_to.window(remaining[0])
                                time.sleep(0.5)
                                if externalUrl:
                                    primary = externalUrl
                                    gotUrl = True

                            if not gotUrl:
                                redirectedUrl = (driver.current_url or "").strip()
                                if (
                                    redirectedUrl
                                    and redirectedUrl != beforeUrl
                                    and redirectedUrl.startswith("http")
                                ):
                                    try:
                                        driver.back()
                                        time.sleep(0.4)
                                    except Exception:
                                        pass
                                    primary = redirectedUrl
                                    gotUrl = True

                    if not gotUrl:
                        primary = applyOnEmployerSiteLabel
            except NoSuchElementException:
                pass
    finally:
        postUrls = drainBlockingGlassdoorModals(driver, maxRounds=8)
    return primary, postUrls


def clickShowMoreIfPresent(driver) -> None:
    try:
        btn = driver.find_element(By.CSS_SELECTOR, '[data-test="show-more-cta"]')
        if btn.is_displayed():
            driver.execute_script(JS_CLICK, btn)
            time.sleep(0.6)
    except NoSuchElementException:
        pass


def scrapeDetailPane(driver) -> tuple[str, str]:
    """Returns (job_description_text, company_from_header)."""
    wait = WebDriverWait(driver, detailWaitSec)
    try:
        wait.until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, '[data-test="job-details-header"]')
            )
        )
    except TimeoutException:
        return "", ""

    time.sleep(0.4)
    clickShowMoreIfPresent(driver)

    company = ""
    try:
        h = driver.find_element(
            By.CSS_SELECTOR,
            '[data-test="job-details-header"] h4[class*="heading_"], '
            '[class*="EmployerProfile_employerNameHeading"] h4',
        )
        company = (h.text or "").strip()
    except NoSuchElementException:
        company = elementText(driver, '[class*="EmployerProfile_employerNameHeading"] h4')

    description = ""
    try:
        box = driver.find_element(
            By.CSS_SELECTOR,
            'div[class*="JobDetails_jobDescription"]',
        )
        description = (box.text or "").strip()
    except NoSuchElementException:
        pass

    return description, company


def cardFields(li) -> dict[str, str | None]:
    gid = (li.get_attribute("data-jobid") or "").strip()
    company = elementText(li, '[class*="compactEmployerName"]')
    if not company:
        company = elementText(li, '[class*="EmployerProfile_employerNameContainer"] span')
    title = elementText(li, 'a[data-test="job-title"]')
    titleHref = elementAttr(li, 'a[data-test="job-title"]', "href")
    location = elementText(li, '[data-test="emp-location"]')
    salary = elementText(li, '[data-test="detailSalary"]')
    snippet = elementText(li, '[data-test="descSnippet"]')
    age = elementText(li, '[data-test="job-age"]')
    skills = skillsFromCard(li)
    return {
        "glassdoorJobId": gid,
        "companyName": company,
        "title": title,
        "titleHref": titleHref,
        "location": location,
        "salaryRange": salary or None,
        "snippet": snippet,
        "postedAgo": age,
        "qualificationTags": skills,
    }


def cardShowsGlassdoorEasyApply(li) -> bool:
    try:
        if li.find_elements(By.CSS_SELECTOR, '[class*="easyApplyTag"]'):
            return True
    except Exception:
        pass
    blob = (li.text or "").strip().lower()
    return "easy apply" in blob


def buildJobRecord(
    card: dict[str, str | None],
    description: str,
    companyDetail: str,
    applyLabel: str | None,
    jobUrl: str | None,
) -> dict:
    company = (companyDetail or card.get("companyName") or "").strip() or None
    tags = (card.get("qualificationTags") or "").strip()
    if not tags and description:
        tags = ""

    return {
        "jobId": f"gdj_{card['glassdoorJobId']}",
        "title": (card.get("title") or "").strip(),
        "jobUrl": jobUrl or "",
        "visaOrMatchNote": None,
        "location": card.get("location") or None,
        "employmentType": "Full-time",
        "salaryRange": card.get("salaryRange"),
        "workModel": None,
        "seniority": None,
        "experience": None,
        "originalJobPostUrl": applyLabel or applyOnEmployerSiteLabel,
        "companyName": company,
        "qualificationTags": tags if tags else "",
        "jobResponsibility": description or (card.get("snippet") or ""),
    }


def clickJobCard(driver, listIndex: int) -> None:
    """Click job row by index; close auth modal if it intercepts the click."""
    lastExc: Exception | None = None
    for _ in range(4):
        dismissUnifiedAuthModalIfPresent(driver)
        items = driver.find_elements(By.CSS_SELECTOR, jobListItem)
        if listIndex >= len(items):
            raise NoSuchElementException("job listing index out of range")
        li = items[listIndex]
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", li)
        time.sleep(0.12)
        try:
            li.click()
            return
        except ElementClickInterceptedException as exc:
            lastExc = exc
            dismissUnifiedAuthModalIfPresent(driver)
            time.sleep(0.25)
            try:
                items = driver.find_elements(By.CSS_SELECTOR, jobListItem)
                if listIndex < len(items):
                    li = items[listIndex]
                    driver.execute_script(JS_CLICK, li)
                    return
            except ElementClickInterceptedException as exc2:
                lastExc = exc2
        except StaleElementReferenceException:
            continue
    if lastExc:
        raise lastExc
    raise RuntimeError(f"Failed to click job card at index {listIndex}")


def _scrollJobListTowardBottom(driver) -> None:
    """Bring the bottom of the list (and any load-more control) into view."""
    for sel in (
        jobsListUl,
        '[class*="JobsList_wrapper"]',
        '[class*="JobsList_jobsList"]',
    ):
        try:
            el = driver.find_element(By.CSS_SELECTOR, sel)
            driver.execute_script(
                "arguments[0].scrollTop = arguments[0].scrollHeight;",
                el,
            )
            time.sleep(0.15)
        except NoSuchElementException:
            continue
    items = driver.find_elements(By.CSS_SELECTOR, jobListItem)
    if items:
        try:
            driver.execute_script(
                "arguments[0].scrollIntoView({block: 'end', inline: 'nearest'});",
                items[-1],
            )
        except StaleElementReferenceException:
            pass
    time.sleep(0.35)


def _visibleLoadMoreButton(driver):
    for btn in driver.find_elements(By.CSS_SELECTOR, loadMoreButton):
        try:
            if not btn.is_displayed():
                continue
            if (btn.get_attribute("disabled") or "").lower() == "true":
                continue
            return btn
        except StaleElementReferenceException:
            continue
    return None


def expandGlassdoorJobList(driver, log: ScraperRunLog) -> int:
    """
    Click Glassdoor's 'Show more jobs' control until it no longer appears at the
    end of the list. Returns how many times the button was clicked.
    """
    clicks = 0
    noGrowthStreak = 0

    while clicks < loadMoreMaxClicks:
        dismissUnifiedAuthModalIfPresent(driver)
        _scrollJobListTowardBottom(driver)

        btn = _visibleLoadMoreButton(driver)
        if btn is None:
            break

        try:
            while (btn.get_attribute("data-loading") or "").lower() == "true":
                time.sleep(0.35)
        except StaleElementReferenceException:
            time.sleep(0.5)
            continue

        countBefore = len(driver.find_elements(By.CSS_SELECTOR, jobListItem))
        try:
            driver.execute_script(JS_CLICK, btn)
        except StaleElementReferenceException:
            time.sleep(0.4)
            continue

        clicks += 1
        time.sleep(0.9)

        try:
            WebDriverWait(driver, 25).until(
                lambda d, before=countBefore: len(
                    d.find_elements(By.CSS_SELECTOR, jobListItem)
                )
                > before
            )
        except TimeoutException:
            pass

        countAfter = len(driver.find_elements(By.CSS_SELECTOR, jobListItem))
        if countAfter <= countBefore:
            noGrowthStreak += 1
            if noGrowthStreak >= 2:
                log.siteDetail(
                    "Load more: no new rows after click; stopping.",
                )
                break
        else:
            noGrowthStreak = 0

    if clicks:
        log.siteDetail(
            f"Expanded job list: {clicks} 'Show more jobs' click(s); "
            f"{len(driver.find_elements(By.CSS_SELECTOR, jobListItem))} rows.",
        )
    return clicks


def scrollGlassdoorJobsList(
    driver, *, fraction: float | None = None, deltaPx: int | None = None
) -> bool:
    """Scroll the left jobs list so virtualized rows can mount. fraction in [0,1] or nudge by deltaPx."""
    for sel in (
        jobsListUl,
        '[class*="JobsList_jobsList"]',
        '[class*="JobsList_wrapper"]',
    ):
        try:
            el = driver.find_element(By.CSS_SELECTOR, sel)
            if fraction is not None:
                f = min(1.0, max(0.0, float(fraction)))
                driver.execute_script(
                    """
                    var el = arguments[0], f = arguments[1];
                    var max = Math.max(0, el.scrollHeight - el.clientHeight);
                    el.scrollTop = Math.floor(max * f);
                    """,
                    el,
                    f,
                )
            elif deltaPx is not None:
                driver.execute_script(
                    """
                    var el = arguments[0], d = arguments[1];
                    var max = Math.max(0, el.scrollHeight - el.clientHeight);
                    el.scrollTop = Math.min(max, el.scrollTop + d);
                    """,
                    el,
                    int(deltaPx),
                )
            else:
                return False
            return True
        except NoSuchElementException:
            continue
    return False


def findJobListingIndexAndLi(driver, glassdoorDataJobid: str) -> tuple[int, object] | None:
    """
    Re-locate a list row after DOM reflows. The jobs list is often virtualized: only a
    window of rows exists until the panel is scrolled, so we scan then sweep scroll.
    """
    raw = (glassdoorDataJobid or "").strip()
    if not raw:
        return None

    def _scan() -> tuple[int, object] | None:
        items = driver.find_elements(By.CSS_SELECTOR, jobListItem)
        for j, li in enumerate(items):
            if (li.get_attribute("data-jobid") or "").strip() == raw:
                return (j, li)
        return None

    found = _scan()
    if found is not None:
        return found

    fractions = [step / 20 for step in range(21)]
    for frac in fractions:
        if not scrollGlassdoorJobsList(driver, fraction=frac):
            break
        time.sleep(0.3)
        found = _scan()
        if found is not None:
            return found

    if scrollGlassdoorJobsList(driver, fraction=0.0):
        for _ in range(40):
            if not scrollGlassdoorJobsList(driver, deltaPx=280):
                break
            time.sleep(0.22)
            found = _scan()
            if found is not None:
                return found

    return None


def scrapeGlassdoorSearch(
    driver,
    log: ScraperRunLog,
    existingJobIds: set[str] | None = None,
    data: dict | None = None,
    outputPath = None,
    *,
    phaseLabel: str = "",
) -> list[dict]:
    """
    Scrape list + detail pane for jobs whose jobId is not in existingJobIds
    (jobData ∪ pastData ∪ skip bucket). Those rows are not clicked.
    """
    log.bindPhase(phaseLabel)
    wait = WebDriverWait(driver, listWaitSec)
    try:
        wait.until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, 'ul[aria-label="Jobs List"]')
            )
        )
    except TimeoutException:
        log.error("Timed out waiting for Jobs List.")
        return []

    time.sleep(1.0)
    dismissUnifiedAuthModalIfPresent(driver)
    expandGlassdoorJobList(driver, log)

    items = driver.find_elements(By.CSS_SELECTOR, jobListItem)
    if not items:
        log.warning("No job listings found.")
        return []

    fileJobIds = frozenset(existingJobIds) if existingJobIds else frozenset()
    seen: set[str] = set(fileJobIds)

    out: list[dict] = []
    n = len(items)
    snapshot: list[tuple[str, str]] = []
    for li in items:
        gid = (li.get_attribute("data-jobid") or "").strip()
        if not gid:
            continue
        jid = glassdoorJobIdToJobId(gid)
        if not jid:
            continue
        snapshot.append((gid, jid))

    nSnap = len(snapshot)
    log.info(
        f"Found {n} list items ({nSnap} with job id); "
        "skipping jobIds already in DB (jobData/pastData) or skip list, opening detail for the rest…",
    )

    for pos, (gidRaw, jobId) in enumerate(snapshot):
        try:
            dismissUnifiedAuthModalIfPresent(driver)
            located = findJobListingIndexAndLi(driver, gidRaw)
            if located is None:
                log.jobSkip(pos + 1, nSnap, "row not in DOM", str(jobId))
                continue

            listIndex, li = located
            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", li)
            time.sleep(0.2)
            card = cardFields(li)
            if not card.get("glassdoorJobId"):
                log.jobLine(pos + 1, nSnap, "skip: no data-jobid")
                continue

            if jobId and jobId in seen:
                where = (
                    "on disk"
                    if jobId in fileJobIds
                    else "earlier in this list"
                )
                log.jobSkip(
                    pos + 1,
                    nSnap,
                    where,
                    f"{card.get('companyName') or '?'} — {jobId}",
                )
                continue

            if cardShowsGlassdoorEasyApply(li):
                if isinstance(data, dict):
                    skipBucket = data.setdefault(skippedOriginalUrlIdsKey, [])
                    if not isinstance(skipBucket, list):
                        data[skippedOriginalUrlIdsKey] = []
                        skipBucket = data[skippedOriginalUrlIdsKey]
                    if jobId and jobId not in skipBucket:
                        skipBucket.append(jobId)
                        if outputPath is not None:
                            saveOutputDocument(outputPath, data)
                if jobId:
                    seen.add(jobId)
                log.jobSkip(
                    pos + 1,
                    nSnap,
                    easyApplyLabel,
                    f"{card.get('companyName') or '?'} — {jobId}",
                )
                continue

            clickJobCard(driver, listIndex)
            time.sleep(0.9)

            description, companyHdr = scrapeDetailPane(driver)
            applyPrimary, postUrls = originalApplyValue(driver)
            applyLabel = resolveEmployerApplyUrl(applyPrimary, postUrls)

            jobUrl = absoluteUrl(driver, card.get("titleHref"))
            rec = buildJobRecord(
                card,
                description,
                companyHdr,
                applyLabel,
                jobUrl,
            )
            if isinstance(data, dict) and outputPath is not None:
                added, _ = mergeNewJobsIntoDocument(data, [rec])
                if added:
                    saveOutputDocument(outputPath, data)
                    out.append(rec)
            else:
                out.append(rec)
            seen.add(jobId)
            log.jobLine(
                pos + 1,
                nSnap,
                f"{rec.get('companyName')} — {rec.get('jobUrl', '')[:70]}…",
            )
        except Exception as exc:
            log.jobError(pos + 1, "error", exc)
            continue

    return out


def main() -> None:
    os.environ["USE_UNDETECTED_CHROME"] = "1"
    runLog = ScraperRunLog(PLATFORM_GLASSDOOR)

    try:
        outputPath = GLASSDOOR_SOURCE_PATH
    except ValueError as exc:
        runLog.error(str(exc))
        raise SystemExit(1) from exc

    phases = resolveGlassdoorSearchPhases(None)
    if not phases:
        runLog.error("No Glassdoor search keywords or URLs configured.")
        raise SystemExit(1)

    headless = envBool("SCRAPING_HEADLESS", default=True)

    try:
        driver = createScrapingChromeDriver(headless=headless, quiet=True)
    except ValueError as exc:
        runLog.error(str(exc))
        raise SystemExit(1) from exc

    try:
        driver.set_page_load_timeout(120)
        totalNew = 0
        for phaseNum, (searchUrl, phaseLabel) in enumerate(phases, start=1):
            runLog.bindPhase(phaseLabel)
            runLog.phaseStart(
                phaseNum,
                len(phases),
                phaseLabel,
                "list + detail pane",
            )
            data = loadJobsDocumentOrEmpty(outputPath)
            ensureSkippedOriginalUrlIds(data)
            existingIds = existingJobIdsKnownBeforeScrape(data, outputPath)
            if existingIds and phaseNum == 1:
                runLog.existingJobsNotice(len(existingIds), outputPath.name)

            driver.get(searchUrl)
            rows = scrapeGlassdoorSearch(
                driver,
                runLog,
                existingIds,
                data,
                outputPath,
                phaseLabel=phaseLabel,
            )
            phaseNew = len(rows)
            totalNew += phaseNew
            runLog.phaseDone(
                phaseLabel,
                f"+{phaseNew} new job(s) into {outputPath.name}",
            )
        runLog.runDone(
            f"+{totalNew} new job(s) across {len(phases)} phase(s) → {outputPath.resolve()}",
        )
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
