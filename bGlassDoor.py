from __future__ import annotations

import os
import re
import sys
import time
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

from utils.startChrome import (
    createScrapingChromeDriver,
    envBool,
    promptBeforeClosingBrowserIfHeaded,
)
from utils.fileManagement import (
    loadJobsDocumentOrEmpty,
    mergeNewJobsIntoDocument,
    resolveOutputJsonPath,
    saveOutputDocument,
)

load_dotenv()

def getDefaultGlassdoorSearchParams() -> dict[str, str]:
    return {
        "location": "united-states",
        "role": "devops",
        "fromAge": "1",          # show jobs posted in the last N days
        "sortBy": "date_desc",   # newest first
        # add more parameters as needed
    }


def buildDefaultGlassdoorSearchUrl(params: dict[str, str] | None = None) -> str:
    if params is None:
        params = getDefaultGlassdoorSearchParams()
    base = "https://www.glassdoor.ca/Job"
    location = params.get("location", "united-states")
    role = params.get("role", "devops")
    ko_start = len(location) + 1
    ko_end = ko_start + len(role)
    path = f"{location}-{role}-jobs-SRCH_IL.0,13_IN1_KO{ko_start},{ko_end}.htm"
    query = {k: v for k, v in params.items() if k not in ("location", "role")}
    from urllib.parse import urlencode
    url = f"{base}/{path}"
    if query:
        url += "?" + urlencode(query)
    return url

defaultGlassdoorSearchUrl = buildDefaultGlassdoorSearchUrl()
GLASSDOOR_SOURCE_PATH = resolveOutputJsonPath("glassdoor.source")


def resolveGlassdoorSearchUrl(cliUrl: str | None = None) -> str:
    """GLASSDOOR_SEARCH_URL env, optional URL arg, else default Glassdoor search URL."""
    envUrl = os.getenv("GLASSDOOR_SEARCH_URL")
    if isinstance(envUrl, str) and envUrl.strip():
        return envUrl.strip()
    if cliUrl and str(cliUrl).strip():
        return str(cliUrl).strip()
    return defaultGlassdoorSearchUrl


def glassdoorJobIdToJobId(glassdoorJobId: str | None) -> str:
    gid = (glassdoorJobId or "").strip()
    return f"gdj_{gid}" if gid else ""


def existingJobIdsFromOutputData(data: dict) -> set[str]:
    """jobId values already stored (e.g. gdj_1010106816170) so we can skip re-scraping."""
    jobs = data.get("jobs")
    out: set[str] = set()
    if isinstance(jobs, list):
        for j in jobs:
            if isinstance(j, dict):
                jid = j.get("jobId")
                if isinstance(jid, str) and jid.strip():
                    out.add(jid.strip())
    skip_ids = data.get(skippedOriginalUrlIdsKey)
    if isinstance(skip_ids, list):
        for sid in skip_ids:
            if isinstance(sid, str) and sid.strip():
                out.add(sid.strip())
    return out


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
JS_CLICK = "arguments[0].click();"


def dismissUnifiedAuthModalIfPresent(driver) -> bool:
    """
    Close Glassdoor / Indeed 'Never Miss an Opportunity' modal if it blocks the page.
    Returns True if the close button was clicked.
    """
    for btn in driver.find_elements(By.CSS_SELECTOR, authModalClose):
        try:
            if btn.is_displayed():
                driver.execute_script(JS_CLICK, btn)
                time.sleep(0.5)
                return True
        except StaleElementReferenceException:
            continue
    return False


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


def originalApplyValue(driver) -> str | None:
    """Per product choice: Easy Apply vs Apply on employer site (not a real URL)."""
    try:
        el = driver.find_element(By.CSS_SELECTOR, '[data-test="easyApply"]')
        if el.is_displayed():
            t = (el.text or "").strip().lower()
            if "sign in" in t or "easy" in t:
                return easyApplyLabel
    except NoSuchElementException:
        pass
    try:
        el = driver.find_element(By.CSS_SELECTOR, '[data-test="applyButton"]')
        if el.is_displayed():
            return applyOnEmployerSiteLabel
    except NoSuchElementException:
        pass
    return None


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
    # Prefer structural badge check; fallback to card text match.
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


def expandGlassdoorJobList(driver) -> int:
    """
    Click Glassdoor's 'Show more jobs' control until it no longer appears at the
    end of the list. Returns how many times the button was clicked.
    """
    clicks = 0
    no_growth_streak = 0

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

        count_before = len(driver.find_elements(By.CSS_SELECTOR, jobListItem))
        try:
            driver.execute_script(JS_CLICK, btn)
        except StaleElementReferenceException:
            time.sleep(0.4)
            continue

        clicks += 1
        time.sleep(0.9)

        try:
            WebDriverWait(driver, 25).until(
                lambda d, before=count_before: len(
                    d.find_elements(By.CSS_SELECTOR, jobListItem)
                )
                > before
            )
        except TimeoutException:
            pass

        count_after = len(driver.find_elements(By.CSS_SELECTOR, jobListItem))
        if count_after <= count_before:
            no_growth_streak += 1
            if no_growth_streak >= 2:
                print(
                    "Load more: no new rows after click; stopping.",
                    file=sys.stderr,
                )
                break
        else:
            no_growth_streak = 0

    if clicks:
        print(
            f"Expanded job list: {clicks} 'Show more jobs' click(s); "
            f"{len(driver.find_elements(By.CSS_SELECTOR, jobListItem))} rows.",
            file=sys.stderr,
        )
    return clicks


def scrapeGlassdoorSearch(
    driver,
    existingJobIds: set[str] | None = None,
    data: dict | None = None,
    outputPath = None,
) -> list[dict]:
    """
    Scrape list + detail pane for jobs whose jobId is not in existingJobIds
    (from prior DB-backed source). Rows already saved are not clicked.
    """
    wait = WebDriverWait(driver, listWaitSec)
    try:
        wait.until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, 'ul[aria-label="Jobs List"]')
            )
        )
    except TimeoutException:
        print("Timed out waiting for Jobs List.", file=sys.stderr)
        return []

    time.sleep(1.0)
    dismissUnifiedAuthModalIfPresent(driver)
    expandGlassdoorJobList(driver)

    items = driver.find_elements(By.CSS_SELECTOR, jobListItem)
    if not items:
        print("No job listings found.", file=sys.stderr)
        return []

    file_job_ids = frozenset(existingJobIds) if existingJobIds else frozenset()
    seen: set[str] = set(file_job_ids)

    out: list[dict] = []
    n = len(items)
    print(
        f"Found {n} list items; skipping jobIds already in output, opening detail for the rest…",
        file=sys.stderr,
    )

    for idx in range(n):
        try:
            dismissUnifiedAuthModalIfPresent(driver)
            items = driver.find_elements(By.CSS_SELECTOR, jobListItem)
            if idx >= len(items):
                break
            li = items[idx]
            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", li)
            time.sleep(0.2)
            card = cardFields(li)
            if not card.get("glassdoorJobId"):
                print(f"[{idx + 1}] skip: no data-jobid", file=sys.stderr)
                continue

            job_id = glassdoorJobIdToJobId(card.get("glassdoorJobId"))
            if job_id and job_id in seen:
                where = (
                    "on disk"
                    if job_id in file_job_ids
                    else "earlier in this list"
                )
                print(
                    f"[{idx + 1}/{n}] skip ({where}): {card.get('companyName') or '?'} — {job_id}",
                    file=sys.stderr,
                )
                continue

            if cardShowsGlassdoorEasyApply(li):
                if isinstance(data, dict):
                    skip_bucket = data.setdefault(skippedOriginalUrlIdsKey, [])
                    if not isinstance(skip_bucket, list):
                        data[skippedOriginalUrlIdsKey] = []
                        skip_bucket = data[skippedOriginalUrlIdsKey]
                    if job_id and job_id not in skip_bucket:
                        skip_bucket.append(job_id)
                        if outputPath is not None:
                            saveOutputDocument(outputPath, data)
                if job_id:
                    seen.add(job_id)
                print(
                    f"[{idx + 1}/{n}] skip ({easyApplyLabel}): {card.get('companyName') or '?'} — {job_id}",
                    file=sys.stderr,
                )
                continue

            clickJobCard(driver, idx)
            time.sleep(0.9)

            description, companyHdr = scrapeDetailPane(driver)
            applyLabel = originalApplyValue(driver)
            if not applyLabel:
                applyLabel = applyOnEmployerSiteLabel

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
            seen.add(job_id)
            print(
                f"[{idx + 1}/{n}] {rec.get('companyName')} — {rec.get('jobUrl', '')[:70]}…",
                file=sys.stderr,
            )
        except Exception as exc:
            print(f"[{idx + 1}] error: {exc}", file=sys.stderr)
            continue

    return out


def main() -> None:
    os.environ["USE_UNDETECTED_CHROME"] = "1"

    searchUrl = resolveGlassdoorSearchUrl(None)
    try:
        outputPath = GLASSDOOR_SOURCE_PATH
    except ValueError as exc:
        print(exc, file=sys.stderr)
        raise SystemExit(1) from exc

    data = loadJobsDocumentOrEmpty(outputPath)
    ensureSkippedOriginalUrlIds(data)
    existing_ids = existingJobIdsFromOutputData(data)
    if existing_ids:
        print(
            f"{len(existing_ids)} jobId(s) already in {outputPath.name}; those list rows will be skipped.",
            file=sys.stderr,
        )

    headless = envBool("SCRAPING_HEADLESS", default=True)

    try:
        driver = createScrapingChromeDriver(headless=headless, quiet=True)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        raise SystemExit(1) from exc
    try:
        driver.set_page_load_timeout(120)
        driver.get(searchUrl)
        rows = scrapeGlassdoorSearch(driver, existing_ids, data, outputPath)

        added = len(rows)
        skipped = 0
        print(
            f"Merged into {outputPath.resolve()}: +{added} new, {skipped} skipped duplicates.",
            file=sys.stderr,
        )
        promptBeforeClosingBrowserIfHeaded()
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
