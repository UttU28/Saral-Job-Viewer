from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

from utils.scraperTerminalLog import PLATFORM_MIDHTECH, ScraperRunLog


REPO_ROOT = Path(__file__).resolve().parent

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
    return 0 if failCount == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
