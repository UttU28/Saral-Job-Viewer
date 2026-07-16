import os
import random
import re
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv
from selenium import webdriver
from selenium.common.exceptions import SessionNotCreatedException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager


class ChromeStartupError(RuntimeError):
    """Chrome or ChromeDriver failed to start (version mismatch, missing binary, etc.)."""


def envBool(name: str, *, default: bool = False) -> bool:
    """True if env var is 1/true/yes/on (case-insensitive); otherwise default."""
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def promptBeforeClosingBrowserIfHeaded() -> None:
    """Headed runs: block on Enter unless CLOSE_ON_COMPLETE=1 (close immediately). Headless: no-op."""
    if envBool("SCRAPING_HEADLESS", default=True):
        return
    if envBool("CLOSE_ON_COMPLETE", default=False):
        return
    input("Press Enter to close the browser...")


# Saral-Job-Viewer repo root (this file lives in utils/ under project root).
_REPO_ROOT = Path(__file__).resolve().parent.parent


def resolveScrapingChromeDir() -> str:
    raw = os.getenv("SCRAPING_CHROME_DIR")
    if not raw or not str(raw).strip():
        return str((_REPO_ROOT / "zata" / "chromeData" / "irangarick").resolve())
    p = Path(raw.strip()).expanduser()
    if not p.is_absolute():
        p = _REPO_ROOT / p
    return str(p.resolve())


def _useUndetectedChrome() -> bool:
    v = os.getenv("USE_UNDETECTED_CHROME", "0")
    return v.strip().lower() in ("1", "true", "yes", "on")


def resolveChromeDriverExecutable() -> str:
    """Download/cache ChromeDriver via webdriver-manager (matches Chrome version)."""
    return ChromeDriverManager().install()


def detectChromeMajorVersion(chromeAppPath: str) -> int | None:
    """Return major version from `chrome --version`, or None if it cannot be read."""
    try:
        proc = subprocess.run(
            [chromeAppPath, "--version"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        text = f"{proc.stdout or ''}{proc.stderr or ''}"
        match = re.search(r"(\d+)\.\d+\.\d+", text)
        return int(match.group(1)) if match else None
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return None


def _isChromeVersionMismatch(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return (
        "only supports chrome version" in msg
        or ("current browser version" in msg and "chrome version" in msg)
        or ("session not created" in msg and "version" in msg)
    )


def _chromeVersionMismatchMessage(chromeAppPath: str, exc: BaseException) -> str:
    detected = detectChromeMajorVersion(chromeAppPath)
    if detected is not None:
        chromeLine = f"  Installed Chrome: {detected}.x ({chromeAppPath})"
    else:
        chromeLine = f"  CHROME_APP_PATH: {chromeAppPath}"
    return (
        "Chrome failed to start: ChromeDriver does not match your installed Chrome.\n"
        f"{chromeLine}\n"
        f"  Details: {exc}\n\n"
        "Please update Chrome Beta to the latest version, then verify CHROME_APP_PATH in .env "
        "points at the Chrome Beta executable.\n"
        "After updating, restart the scraper."
    )


def _raiseChromeStartupError(chromeAppPath: str, exc: BaseException) -> None:
    if isinstance(exc, ChromeStartupError):
        raise exc
    if _isChromeVersionMismatch(exc):
        raise ChromeStartupError(_chromeVersionMismatchMessage(chromeAppPath, exc)) from exc
    if isinstance(exc, (SessionNotCreatedException, WebDriverException)):
        raise ChromeStartupError(
            f"Chrome failed to start ({exc}).\n"
            f"  CHROME_APP_PATH: {chromeAppPath}\n"
            "Check that Chrome Beta is installed and CHROME_APP_PATH in .env is correct."
        ) from exc
    raise exc


def _createUndetectedChromeDriver(
    *,
    headless: bool,
    quiet: bool,
    chromeDir: str,
    debugPort: str | None,
    chromeAppPath: str,
):
    """Chrome via undetected-chromedriver (patches driver; no webdriver-manager)."""
    # Python 3.12 removed stdlib distutils; undetected-chromedriver still imports it.
    # Importing setuptools first installs the compatibility shim.
    try:
        import setuptools  # noqa: F401
    except ImportError:
        pass
    try:
        import undetected_chromedriver as uc
    except ModuleNotFoundError as exc:
        if exc.name == "distutils":
            raise ImportError(
                "Python 3.12+ needs setuptools for undetected-chromedriver (distutils). "
                "Run: pip install setuptools"
            ) from exc
        raise
    except ImportError as exc:
        raise ImportError(
            "USE_UNDETECTED_CHROME is set but undetected-chromedriver is not installed. "
            "Run: pip install undetected-chromedriver"
        ) from exc

    opts = uc.ChromeOptions()
    opts.binary_location = chromeAppPath
    if debugPort:
        opts.add_argument(f"--remote-debugging-port={debugPort}")
    if headless:
        opts.add_argument("--headless=new")
        opts.add_argument("--window-size=1920,1080")
        opts.add_argument("--disable-gpu")

    chromeMajor = detectChromeMajorVersion(chromeAppPath)
    try:
        # user_data_dir as kwarg avoids duplicating --user-data-dir on the command line.
        driver = uc.Chrome(
            options=opts,
            browser_executable_path=chromeAppPath,
            user_data_dir=chromeDir,
            version_main=chromeMajor,
        )
    except Exception as exc:
        _raiseChromeStartupError(chromeAppPath, exc)

    if not quiet:
        print("Chrome session started (undetected-chromedriver)", file=sys.stderr)
        print(f"Using directory: {chromeDir}", file=sys.stderr)
        print(f"Debug port: {debugPort}", file=sys.stderr)

    return driver


def createScrapingChromeDriver(*, headless: bool = True, quiet: bool = True):
    load_dotenv()

    chromeDir = resolveScrapingChromeDir()
    debugPort = os.getenv("SCRAPING_PORT")
    chromeAppPath = os.getenv("CHROME_APP_PATH")

    if not chromeAppPath:
        raise ValueError("Set CHROME_APP_PATH in .env")

    if not os.path.exists(chromeDir):
        os.makedirs(chromeDir, exist_ok=True)
        if not quiet:
            print(f"Created Chrome data directory at {chromeDir}", file=sys.stderr)

    if _useUndetectedChrome():
        return _createUndetectedChromeDriver(
            headless=headless,
            quiet=quiet,
            chromeDir=chromeDir,
            debugPort=debugPort,
            chromeAppPath=chromeAppPath,
        )

    chromeOptions = Options()
    chromeOptions.binary_location = chromeAppPath
    chromeOptions.add_argument(f"--user-data-dir={chromeDir}")
    if debugPort:
        chromeOptions.add_argument(f"--remote-debugging-port={debugPort}")

    chromeOptions.add_argument("--disable-blink-features=AutomationControlled")
    chromeOptions.add_argument("--disable-dev-shm-usage")
    chromeOptions.add_argument("--no-sandbox")
    chromeOptions.add_experimental_option("excludeSwitches", ["enable-automation"])
    chromeOptions.add_experimental_option("useAutomationExtension", False)

    userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    ]
    chromeOptions.add_argument(f"--user-agent={random.choice(userAgents)}")

    if headless:
        chromeOptions.add_argument("--headless=new")
        chromeOptions.add_argument("--window-size=1920,1080")
        chromeOptions.add_argument("--disable-gpu")

    try:
        chromeService = Service(executable_path=resolveChromeDriverExecutable())
        chromeDriver = webdriver.Chrome(service=chromeService, options=chromeOptions)
    except Exception as exc:
        _raiseChromeStartupError(chromeAppPath, exc)

    if not quiet:
        print("Chrome session started", file=sys.stderr)
        print(f"Using directory: {chromeDir}", file=sys.stderr)
        print(f"Debug port: {debugPort}", file=sys.stderr)

    return chromeDriver


def startInteractiveChrome():
    """Headed browser for manual use; same env vars as automated scrapers."""
    return createScrapingChromeDriver(headless=False, quiet=False)


def startChromeSession():
    """Backwards-compatible alias used by legacy LinkedIn helper scripts."""
    return startInteractiveChrome()


if __name__ == "__main__":
    # For direct/manual runs, default to undetected-chromedriver unless explicitly set.
    os.environ.setdefault("USE_UNDETECTED_CHROME", "1")
    chromeDriver = startInteractiveChrome()
    try:
        input("Press Enter to close the browser...")
    finally:
        chromeDriver.quit()
