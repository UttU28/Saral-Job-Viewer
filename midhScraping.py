from __future__ import annotations

import argparse
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

# Order matters: scrapers run top-to-bottom.
SCRAPER_SCRIPTS: list[tuple[str, str]] = [
    ("jobright", "scraping/aJobRight.py"),
    # ("glassdoor", "scraping/bGlassDoor.py"),
    ("ziprecruiter", "scraping/cZipRecruiter.py"),
]


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


def parseArgs() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run JobRight, Glassdoor, and ZipRecruiter scrapers sequentially."
        ),
    )
    parser.add_argument(
        "--only",
        type=str,
        default="",
        help=(
            "Comma-separated subset of scrapers to run "
            "(jobright,glassdoor,ziprecruiter). Default: run all in order."
        ),
    )
    parser.add_argument(
        "--skip",
        type=str,
        default="",
        help="Comma-separated scrapers to skip.",
    )
    parser.add_argument(
        "--stop-on-error",
        action="store_true",
        help="Abort the run if any scraper exits with a non-zero status.",
    )
    parser.add_argument(
        "--skip-admin-actions",
        action="store_true",
        help=(
            "Skip post-scrape steps: Saral API delete_unwanted_classified_jobs "
            "and local validation script."
        ),
    )
    parser.add_argument(
        "--validation-mode",
        type=str,
        default="1",
        help=(
            "Validation mode for local dvalidate container "
            "(1=verify pending NULL, 2=push APPLY jobs, 3=cleanup delete unwanted+NULL). "
            "Current post-scrape flow always runs mode 1."
        ),
    )
    return parser.parse_args()


def resolveSelectedScrapers(
    onlyArg: str,
    skipArg: str,
    log: ScraperRunLog,
) -> list[tuple[str, str]]:
    onlySet = {s.strip().lower() for s in onlyArg.split(",") if s.strip()}
    skipSet = {s.strip().lower() for s in skipArg.split(",") if s.strip()}
    valid = {key for key, _ in SCRAPER_SCRIPTS}
    unknown = (onlySet | skipSet) - valid
    if unknown:
        log.warning(
            f"ignoring unknown scraper id(s): {', '.join(sorted(unknown))}; "
            f"known: {', '.join(sorted(valid))}"
        )
    selected: list[tuple[str, str]] = []
    for key, script in SCRAPER_SCRIPTS:
        if onlySet and key not in onlySet:
            continue
        if key in skipSet:
            continue
        selected.append((key, script))
    return selected


def _saralApiBaseUrl() -> str:
    raw = (os.getenv("SARAL_API_BASE_URL") or os.getenv("VITE_API_URL") or "").strip()
    if raw:
        return raw.rstrip("/")
    return "http://127.0.0.1:8000"


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
        log.error(
            f"Saral API login HTTP {resp.status_code}: "
            f"{(resp.text or '')[:500]}"
        )
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


def runPostScrapeAdminPipeline(
    *,
    log: ScraperRunLog,
    skip: bool,
    requested_validation_mode: str = "1",
) -> bool:
    """
    After all scrapers succeed: delete unwanted jobs via Saral API, then run local
    validation via local validation.py.
    Returns True if completed or skipped successfully; False on failure.
    """
    if skip:
        log.info("skipping post-scrape steps (--skip-admin-actions).")
        return True

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

    if str(requested_validation_mode).strip().lstrip("-") != "1":
        log.warning(
            "post-scrape currently forces validation mode 1; "
            f"ignoring --validation-mode={requested_validation_mode!r} for now."
        )

    log.info("post-scrape → validation (local Python, validation.py -1)")
    if not runLocalValidationScript(log, mode="1"):
        return False

    log.info("post-scrape pipeline finished.")
    return True


def main() -> int:
    args = parseArgs()
    log = ScraperRunLog(PLATFORM_MIDHTECH)
    log.bindPhase("orchestrator")

    scrapers = resolveSelectedScrapers(args.only, args.skip, log)
    if not scrapers:
        log.error("no scrapers selected; nothing to do.")
        return 1

    plan = ", ".join(key for key, _ in scrapers)
    log.info(
        f"plan ({len(scrapers)} scraper{'s' if len(scrapers) != 1 else ''}): {plan}"
    )
    if args.stop_on_error:
        log.info("--stop-on-error set: run aborts if any scraper exits non-zero.")
    else:
        log.info(
            "on-error: continue to next scraper (use --stop-on-error to abort)."
        )
    requestedMode = str(args.validation_mode or "1").strip().lstrip("-")
    if requestedMode not in {"1", "2", "3"}:
        log.error(
            f"invalid --validation-mode={args.validation_mode!r}; allowed: 1, 2, 3"
        )
        return 2
    log.info(f"validation mode requested: {requestedMode} (post-scrape currently runs mode 1).")

    runStart = time.monotonic()
    results: list[tuple[str, int, float]] = []
    aborted = False

    for index, (key, script) in enumerate(scrapers, start=1):
        log.bindPhase(f"{index}/{len(scrapers)} {key}")
        log.info(f"=== {script} starting ===")
        try:
            rc, elapsed = runOneScraper(script, log)
        except KeyboardInterrupt:
            log.warning("orchestrator interrupted; stopping run.")
            aborted = True
            break
        results.append((key, rc, elapsed))
        if rc == 0:
            log.info(f"=== {script} finished OK in {_formatDuration(elapsed)} ===")
        else:
            log.error(
                f"=== {script} exited rc={rc} after {_formatDuration(elapsed)} ==="
            )
            if args.stop_on_error:
                log.error("aborting remaining scrapers (--stop-on-error).")
                aborted = True
                break

    log.bindPhase("orchestrator")
    totalElapsed = time.monotonic() - runStart
    okCount = sum(1 for _, rc, _ in results if rc == 0)
    failCount = sum(1 for _, rc, _ in results if rc != 0)
    notRun = len(scrapers) - len(results)

    log.info(
        f"summary — total {_formatDuration(totalElapsed)} — "
        f"{okCount} ok, {failCount} failed, {notRun} not run"
    )
    for key, rc, elapsed in results:
        status = "ok" if rc == 0 else f"FAILED (rc={rc})"
        log.info(f"  - {key:<13} {status:<18} {_formatDuration(elapsed)}")

    if aborted and failCount == 0:
        return 130

    scrapersOk = failCount == 0 and not aborted
    if scrapersOk:
        log.bindPhase("orchestrator")
        adminOk = runPostScrapeAdminPipeline(
            log=log,
            skip=bool(args.skip_admin_actions),
            requested_validation_mode=requestedMode,
        )
        if not adminOk:
            return 1

    return 0 if failCount == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
