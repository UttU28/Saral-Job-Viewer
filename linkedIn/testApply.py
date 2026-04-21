import re
from html import unescape
from urllib.parse import parse_qs, unquote, urlparse

from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from startChrome import start_chrome_session


TARGET_URL = (
    "https://www.linkedin.com/jobs/search/?currentJobId=4363407602&distance=25.0&f_E=2%2C3&f_JT=F&f_TPR=r86400&geoId=103644278&keywords=python&origin=JOB_SEARCH_PAGE_JOB_FILTER&refresh=true&sortBy=DD&spellCorrectionEnabled=true"
)

TARGET_URL = (
    "https://www.linkedin.com/jobs/search/?currentJobId=4364495413&distance=25.0&f_E=2%2C3&f_JT=F&f_TPR=r86400&geoId=103644278&keywords=python&origin=JOB_SEARCH_PAGE_JOB_FILTER&refresh=true&sortBy=DD&spellCorrectionEnabled=true"
)


def extract_redirect_target(linkedin_href: str):
    """
    LinkedIn sometimes wraps external apply links as:
    https://www.linkedin.com/safety/go/?url=<encoded real url>&...
    """
    if not linkedin_href:
        return None

    try:
        parsed = urlparse(linkedin_href)
        query = parse_qs(parsed.query)
        wrapped = query.get("url", [None])[0]
        return unquote(wrapped) if wrapped else linkedin_href
    except Exception:
        return linkedin_href

def extract_apply_url_from_page_source(page_source: str):
    if not page_source:
        return None

    normalized_source = (
        page_source
        .replace("&amp;", "&")
        .replace("\\u002F", "/")
        .replace("\\u003A", ":")
        .replace("\\u0026", "&")
        .replace("\\u003d", "=")
        .replace("\\/", "/")
    )
    normalized_source = unescape(normalized_source)

    keyed_patterns = [
        r'"offsiteApplyUrl"\s*:\s*"([^"]+)"',
        r'"offsiteApplyTrackingUrl"\s*:\s*"([^"]+)"',
        r'"companyApplyUrl"\s*:\s*"([^"]+)"',
        r'"externalApplyUrl"\s*:\s*"([^"]+)"',
        r'"applyRedirectUrl"\s*:\s*"([^"]+)"',
        r'"applyUrl"\s*:\s*"([^"]+)"',
    ]

    for pattern in keyed_patterns:
        matches = re.findall(pattern, normalized_source)
        if matches:
            return extract_redirect_target(unquote(matches[0]))

    patterns = [
        r"https://www\.linkedin\.com/safety/go/\?url=[^\"'\\s<]+",
        r"https://www\.linkedin\.com/redir/redirect\?url=[^\"'\\s<]+",
        r"https://[^\"'\\s<]*greenhouse\.io[^\"'\\s<]*",
        r"https://[^\"'\\s<]*lever\.co[^\"'\\s<]*",
        r"https://[^\"'\\s<]*workdayjobs\.com[^\"'\\s<]*",
        r"https://[^\"'\\s<]*\?[^\"'\\s<]*jobSite=LinkedIn[^\"'\\s<]*",
    ]

    for pattern in patterns:
        matches = re.findall(pattern, normalized_source)
        if matches:
            return extract_redirect_target(matches[0])

    return None

def capture_url_from_apply_button(driver, button):
    original_handle = driver.current_window_handle
    original_url = driver.current_url
    handles_before = set(driver.window_handles)

    try:
        driver.execute_script("arguments[0].click();", button)
    except Exception:
        button.click()

    WebDriverWait(driver, 7).until(
        lambda d: len(d.window_handles) > len(handles_before) or d.current_url != original_url
    )

    new_handles = [handle for handle in driver.window_handles if handle not in handles_before]
    if new_handles:
        driver.switch_to.window(new_handles[-1])
        WebDriverWait(driver, 7).until(lambda d: d.current_url and d.current_url != "about:blank")
        raw_target_url = driver.current_url
        if original_handle in driver.window_handles:
            driver.switch_to.window(original_handle)
        decoded = extract_redirect_target(raw_target_url)
        if decoded and decoded != original_url:
            return raw_target_url, decoded
        return raw_target_url, extract_apply_url_from_page_source(driver.page_source)

    raw_current_url = driver.current_url
    current_decoded = extract_redirect_target(raw_current_url)
    if current_decoded and current_decoded != original_url:
        return raw_current_url, current_decoded

    return None, extract_apply_url_from_page_source(driver.page_source)

def detect_easy_apply_modal(driver):
    easy_apply_modal_selectors = [
        ".jobs-easy-apply-modal",
        ".jobs-easy-apply-content",
        "[data-test-modal-id='easy-apply-modal']",
    ]
    for selector in easy_apply_modal_selectors:
        try:
            modal = driver.find_element(By.CSS_SELECTOR, selector)
            if modal and modal.is_displayed():
                return True
        except Exception:
            continue
    return False


def fetch_apply_url():
    driver = start_chrome_session()
    wait = WebDriverWait(driver, 30)

    try:
        print(f"Opening: {TARGET_URL}")
        driver.get(TARGET_URL)

        # LinkedIn classes are often obfuscated; wait for any visible Apply indicator instead.
        apply_presence_xpath = (
            "//a[contains(@aria-label,'Apply') and @href]"
            " | //a[contains(@href,'linkedin.com/safety/go/?url=')]"
            " | //a[contains(@href,'jobSite=LinkedIn')]"
            " | //a[normalize-space()='Apply']"
            " | //button[@data-live-test-job-apply-button]"
            " | //button[@id='jobs-apply-button-id']"
            " | //button[contains(@class,'jobs-apply-button')]"
        )
        wait.until(EC.presence_of_element_located((By.XPATH, apply_presence_xpath)))

        # Try common places where LinkedIn keeps the apply element.
        selectors = [
            "a[aria-label*='Apply on company website']",
            "a[href*='linkedin.com/safety/go/?url=']",
            "a[href*='jobSite=LinkedIn']",
            "a[href*='origin=SWITCH_SEARCH_VERTICAL']",
        ]

        apply_element = None
        used_selector = None

        for selector in selectors:
            try:
                element = driver.find_element(By.CSS_SELECTOR, selector)
                href = element.get_attribute("href")
                if href:
                    apply_element = element
                    used_selector = selector
                    break
            except Exception:
                continue

        if not apply_element:
            # XPath fallback for dynamic classnames.
            xpath_fallbacks = [
                "//a[contains(@aria-label,'Apply on company website') and @href]",
                "//a[contains(@href,'linkedin.com/safety/go/?url=')]",
                "//a[normalize-space()='Apply' and @href]",
            ]
            for xp in xpath_fallbacks:
                try:
                    element = driver.find_element(By.XPATH, xp)
                    href = element.get_attribute("href")
                    if href:
                        apply_element = element
                        used_selector = f"xpath:{xp}"
                        break
                except Exception:
                    continue

        if not apply_element:
            print("Apply URL not found.")
            print("Possible reasons:")
            print("- The job is Easy Apply (no external URL)")
            print("- The selected job card changed")
            print("- LinkedIn page needs manual login/verification")
            anchors = driver.find_elements(By.TAG_NAME, "a")
            print(f"- Debug: total anchors on page = {len(anchors)}")
            debug_hrefs = []
            for a in anchors:
                href = a.get_attribute("href")
                if href and ("linkedin.com/safety/go/?url=" in href or "jobSite=LinkedIn" in href):
                    debug_hrefs.append(href)
            if debug_hrefs:
                print("- Debug candidate hrefs found:")
                for item in debug_hrefs[:5]:
                    print(f"  {item}")
            # Button-based fallback for jobs where Apply is rendered as <button role='link'>
            button_selectors = [
                "button[data-live-test-job-apply-button]",
                "button#jobs-apply-button-id",
                "button.jobs-apply-button",
                "button[aria-label*='Apply to']",
                "button[aria-label*='Easy Apply']",
            ]

            for selector in button_selectors:
                try:
                    button = driver.find_element(By.CSS_SELECTOR, selector)
                    if detect_easy_apply_modal(driver):
                        print("\n=== Apply URL Debug Output (Easy Apply Detected) ===")
                        print(f"Selector used: {selector}")
                        print("Raw apply url: None")
                        print("Original apply url: EASY_APPLY (no external URL)")
                        print("================================")
                        return
                    raw_apply_url, final_apply_url = capture_url_from_apply_button(driver, button)
                    if not final_apply_url and detect_easy_apply_modal(driver):
                        final_apply_url = "EASY_APPLY (no external URL)"
                    print("\n=== Apply URL Debug Output (Button Fallback) ===")
                    print(f"Selector used: {selector}")
                    print(f"Raw apply url: {raw_apply_url}")
                    print(f"Original apply url: {final_apply_url}")
                    print("================================")
                    return
                except Exception:
                    continue

            # Last-resort fallback only if no apply element could be interacted with.
            source_url = extract_apply_url_from_page_source(driver.page_source)
            if source_url:
                print("\n=== Apply URL Debug Output (Page Source Fallback) ===")
                print("Selector used: page_source_regex")
                print("Raw apply url: extracted from HTML/script")
                print(f"Original apply url: {source_url}")
                print("================================")
                return

            return

        raw_href = apply_element.get_attribute("href")
        final_apply_url = extract_redirect_target(raw_href)
        if not final_apply_url:
            final_apply_url = extract_apply_url_from_page_source(driver.page_source)

        print("\n=== Apply URL Debug Output ===")
        print(f"Selector used: {used_selector}")
        print(f"Raw apply url: {raw_href}")
        print(f"Original apply url: {final_apply_url}")
        print("================================")

    finally:
        # Intentionally avoid driver.quit() so the page stays open.
        print("Browser left open for inspection.")


if __name__ == "__main__":
    fetch_apply_url()
    