from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

from utils.scraperTerminalLog import PLATFORM_MIDHTECH, ScraperRunLog


REPO_ROOT = Path(__file__).resolve().parent
load_dotenv(REPO_ROOT / ".env", override=False)

# 1=JobRight, 2=ZipRecruiter, 3=Glassdoor (disabled), 0=all enabled platforms.
PLATFORM_CHOICES: list[tuple[int, str, str]] = [
    (1, "jobright", "scraping/aJobRight.py"),
    (2, "ziprecruiter", "scraping/cZipRecruiter.py"),
]

# Glassdoor — slot 3, skipped for now (not included in 0 / all).
# (3, "glassdoor", "scraping/bGlassDoor.py"),
GLASSDOOR_CHOICE_NUM = 3


def _formatDuration(seconds: float) -> str:
    total = max(0, int(seconds))
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h{m:02d}m{s:02d}s"
    if m:
        return f"{m}m{s:02d}s"
    return f"{s}s"


def runOneScraper(
    scriptName: str,
    log: ScraperRunLog,
) -> tuple[int, float]:
    scriptPath = REPO_ROOT / scriptName
    if not scriptPath.exists():
        log.error(f"scraper script not found: {scriptPath}")
        return 1, 0.0

    log.info(f"launching → {sys.executable} {scriptName}")
    start = time.monotonic()
    try:
        proc = subprocess.run(
            [sys.executable, str(scriptPath)],
            cwd=str(REPO_ROOT),
            check=False,
        )
    except KeyboardInterrupt:
        elapsed = time.monotonic() - start
        log.warning(f"interrupted by user after {_formatDuration(elapsed)}")
        raise
    except Exception as exc:
        elapsed = time.monotonic() - start
        log.error(f"failed to launch {scriptName}: {exc!r}")
        return 1, elapsed
    elapsed = time.monotonic() - start
    return proc.returncode, elapsed


def showPlatformMenu() -> None:
    print("")
    print("Select platform to scrape:")
    for num, key, _ in PLATFORM_CHOICES:
        print(f"  {num} — {key}")
    print(f"  {GLASSDOOR_CHOICE_NUM} — glassdoor (disabled)")
    print("  0 — All enabled")
    print("")


def promptPlatformSelection() -> int:
    showPlatformMenu()
    while True:
        choice = input("Enter choice [0]: ").strip()
        if not choice:
            return 0
        if choice in {"0", "1", "2", "3"}:
            return int(choice)
        print("Invalid choice — enter 0, 1, 2, or 3.")


def parseSelection(argv: list[str]) -> int | None:
    """Return 0–3, or None when argv empty (prompt or default-all)."""
    if not argv:
        return None
    if argv[0] in ("-h", "--help"):
        print(
            "Usage: python midhScraping.py [0|1|2|3]\n\n"
            "  0 — all enabled platforms (JobRight + ZipRecruiter)\n"
            "  1 — JobRight\n"
            "  2 — ZipRecruiter\n"
            "  3 — Glassdoor (disabled for now)\n\n"
            "With no argument in an interactive terminal, you are prompted to choose.\n"
            "With no argument in cron/non-interactive mode, all enabled platforms run.",
        )
        raise SystemExit(0)
    try:
        selection = int(argv[0])
    except ValueError:
        print(f"error: invalid platform {argv[0]!r}; use 0, 1, 2, or 3", file=sys.stderr)
        raise SystemExit(2)
    if selection not in {0, 1, 2, 3}:
        print(f"error: platform must be 0–3, got {selection}", file=sys.stderr)
        raise SystemExit(2)
    return selection


def resolveSelectedScrapers(
    selection: int,
    log: ScraperRunLog,
) -> list[tuple[str, str]]:
    if selection == GLASSDOOR_CHOICE_NUM:
        log.warning("glassdoor (3) is disabled for now; nothing to run.")
        return []

    if selection == 0:
        picks = PLATFORM_CHOICES
    else:
        picks = [row for row in PLATFORM_CHOICES if row[0] == selection]

    selected: list[tuple[str, str]] = []
    for _, key, script in picks:
        scriptPath = REPO_ROOT / script
        if not scriptPath.is_file():
            log.warning(f"skipping {key}: script not found ({script})")
            continue
        selected.append((key, script))
    return selected


def _saralApiBaseUrl() -> str:
    raw = (os.getenv("SARAL_API_BASE_URL") or os.getenv("VITE_API_URL") or "").strip()
    if raw:
        return raw.rstrip("/")
    return os.getenv("SARAL_API_BASE_URL", "http://127.0.0.1:9260").rstrip("/")


def _loginSaralAdminAndGetToken(
    *,
    baseUrl: str,
    email: str,
    password: str,
    log: ScraperRunLog,
) -> str | None:
    """Log in via /api/auth/login; require admin. Uses MIDHTECH_* credentials from .env."""
    url = f"{baseUrl}/api/auth/login"
    try:
        resp = requests.post(
            url,
            json={"email": email.strip(), "password": password},
            timeout=60,
        )
    except requests.RequestException as exc:
        log.error(f"Saral API login request failed: {exc!r}")
        return None
    if resp.status_code != 200:
        detail = (resp.text or "")[:500]
        if resp.status_code == 503:
            log.error(
                f"Saral API login HTTP 503 (database unavailable): {detail}"
            )
        else:
            log.error(f"Saral API login HTTP {resp.status_code}: {detail}")
        return None
    try:
        data: dict[str, Any] = resp.json()
    except json.JSONDecodeError:
        log.error("Saral API login: response was not JSON.")
        return None
    token = str(data.get("token") or "").strip()
    if not token:
        log.error("Saral API login: missing token in response.")
        return None
    meUrl = f"{baseUrl}/api/auth/me"
    try:
        meResp = requests.get(
            meUrl,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
    except requests.RequestException as exc:
        log.error(f"Saral API /auth/me failed: {exc!r}")
        return None
    if meResp.status_code != 200:
        log.error(
            f"Saral API /auth/me HTTP {meResp.status_code}: "
            f"{(meResp.text or '')[:500]}"
        )
        return None
    try:
        meData: dict[str, Any] = meResp.json()
    except json.JSONDecodeError:
        log.error("Saral API /auth/me: response was not JSON.")
        return None
    user = meData.get("user") if isinstance(meData.get("user"), dict) else {}
    if not bool(user.get("isAdmin")):
        log.error(
            "Saral API user is not an admin; cannot run admin job actions."
        )
        return None
    return token


def _postSaralAdminJobAction(
    *,
    baseUrl: str,
    token: str,
    action: str,
    log: ScraperRunLog,
) -> bool:
    url = f"{baseUrl}/api/admin/jobs/actions"
    try:
        resp = requests.post(
            url,
            json={"action": action},
            headers={"Authorization": f"Bearer {token}"},
            timeout=600,
        )
    except requests.RequestException as exc:
        log.error(f"admin action {action!r} request failed: {exc!r}")
        return False
    bodyPreview = (resp.text or "")[:800]
    if resp.status_code != 200:
        log.error(
            f"admin action {action!r} HTTP {resp.status_code}: {bodyPreview}"
        )
        return False
    log.info(f"admin action {action!r} OK — {bodyPreview}")
    return True


def _validationModeArg(mode: str) -> str:
    """Map validation.py CLI mode: 1 -> -1, 2 -> -2, 3 -> -3."""
    m = str(mode or "1").strip().lstrip("-")
    if m in ("1", "2", "3"):
        return f"-{m}"
    if str(mode or "").startswith("-"):
        return str(mode)
    raise ValueError(f"unsupported validation mode: {mode!r}")


def _resolveValidationPython() -> str:
    venv_python = REPO_ROOT / "venv" / "bin" / "python"
    if venv_python.is_file() and os.access(venv_python, os.X_OK):
        return str(venv_python)
    return sys.executable


def runLocalValidationScript(
    log: ScraperRunLog,
    *,
    mode: str = "1",
) -> bool:
    """Run validation.py directly via local venv/system Python."""
    env_file = REPO_ROOT / ".env"
    if not env_file.is_file():
        log.error(f".env not found at {env_file}; required for validation.py.")
        return False

    try:
        mode_arg = _validationModeArg(mode)
    except ValueError as exc:
        log.error(str(exc))
        return False

    log.bindPhase("validation-local")
    validation_path = REPO_ROOT / "validation.py"
    if not validation_path.is_file():
        log.error(f"validation script not found: {validation_path}")
        return False

    python_bin = _resolveValidationPython()
    cmd: list[str] = [python_bin, str(validation_path), mode_arg]

    log.info(f"launching → {' '.join(cmd)}")
    start = time.monotonic()
    try:
        proc = subprocess.run(cmd, cwd=str(REPO_ROOT), check=False)
    except KeyboardInterrupt:
        elapsed = time.monotonic() - start
        log.warning(
            f"validation script interrupted after {_formatDuration(elapsed)}"
        )
        raise
    except Exception as exc:
        elapsed = time.monotonic() - start
        log.error(f"failed to launch validation script: {exc!r}")
        return False

    elapsed = time.monotonic() - start
    if proc.returncode == 0:
        log.info(
            f"validation script finished OK in {_formatDuration(elapsed)} "
            f"(mode {mode_arg})"
        )
        return True
    log.error(
        f"validation script exited rc={proc.returncode} "
        f"after {_formatDuration(elapsed)} (mode {mode_arg})"
    )
    return False


def runPostScrapeAdminPipeline(*, log: ScraperRunLog) -> bool:
    """
    After all scrapers succeed: delete unwanted jobs via Saral API, then run local
    validation via local validation.py.
    Returns True if completed; False on failure.
    """
    try:
        return _runPostScrapeAdminPipelineImpl(log=log)
    except Exception as exc:
        log.error(f"post-scrape pipeline failed unexpectedly: {exc!r}")
        return False


def _runPostScrapeAdminPipelineImpl(*, log: ScraperRunLog) -> bool:
    email = (os.getenv("MIDHTECH_EMAIL") or "").strip()
    password = os.getenv("MIDHTECH_PASSWORD") or ""
    if not email or not password:
        log.error(
            "post-scrape admin delete requires MIDHTECH_EMAIL and MIDHTECH_PASSWORD in .env."
        )
        return False

    baseUrl = _saralApiBaseUrl()
    log.bindPhase("admin-api")
    log.info(f"Saral API base URL: {baseUrl}")

    token = _loginSaralAdminAndGetToken(
        baseUrl=baseUrl, email=email, password=password, log=log
    )
    if not token:
        return False

    log.info("post-scrape → delete_unwanted_classified_jobs (Saral API)")
    if not _postSaralAdminJobAction(
        baseUrl=baseUrl,
        token=token,
        action="delete_unwanted_classified_jobs",
        log=log,
    ):
        return False

    log.info("post-scrape → validation (local Python, validation.py -1)")
    if not runLocalValidationScript(log, mode="1"):
        return False

    log.info("post-scrape pipeline finished.")
    return True


def main() -> int:
    log = ScraperRunLog(PLATFORM_MIDHTECH)
    log.bindPhase("orchestrator")

    try:
        parsed = parseSelection(sys.argv[1:])
    except SystemExit as exc:
        return int(exc.code) if exc.code is not None else 0

    if parsed is None:
        if sys.stdin.isatty():
            selection = promptPlatformSelection()
        else:
            selection = 0
    else:
        selection = parsed

    scrapers = resolveSelectedScrapers(selection, log)
    if not scrapers:
        log.error("no scrapers selected; nothing to do.")
        return 1

    plan = ", ".join(key for key, _ in scrapers)
    log.info(
        f"plan ({len(scrapers)} scraper{'s' if len(scrapers) != 1 else ''}): {plan}"
    )
    log.info("on-error: continue to next scraper.")

    runStart = time.monotonic()
    results: list[tuple[str, int, float]] = []

    for index, (key, script) in enumerate(scrapers, start=1):
        log.bindPhase(f"{index}/{len(scrapers)} {key}")
        log.info(f"=== {script} starting ===")
        try:
            rc, elapsed = runOneScraper(script, log)
        except KeyboardInterrupt:
            log.warning("orchestrator interrupted; stopping run.")
            return 130
        results.append((key, rc, elapsed))
        if rc == 0:
            log.info(f"=== {script} finished OK in {_formatDuration(elapsed)} ===")
        else:
            log.error(
                f"=== {script} exited rc={rc} after {_formatDuration(elapsed)} ==="
            )
            log.warning(
                f"{key} scrape may be partial — check zata/sources/ and zata/logs/ "
                "before re-running.",
            )

    log.bindPhase("orchestrator")
    totalElapsed = time.monotonic() - runStart
    okCount = sum(1 for _, rc, _ in results if rc == 0)
    failCount = sum(1 for _, rc, _ in results if rc != 0)

    log.info(
        f"summary — total {_formatDuration(totalElapsed)} — "
        f"{okCount} ok, {failCount} failed"
    )
    for key, rc, elapsed in results:
        status = "ok" if rc == 0 else f"FAILED (rc={rc})"
        log.info(f"  - {key:<13} {status:<18} {_formatDuration(elapsed)}")

    scrapersOk = failCount == 0
    if scrapersOk:
        log.bindPhase("orchestrator")
        try:
            adminOk = runPostScrapeAdminPipeline(log=log)
        except Exception as exc:
            log.error(f"post-scrape pipeline crashed: {exc!r}")
            adminOk = False
        if not adminOk:
            log.warning(
                "scrapers finished OK; post-scrape admin/validation failed "
                "(see errors above). Scrape output is still on disk."
            )
            return 0

    return 0 if failCount == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
