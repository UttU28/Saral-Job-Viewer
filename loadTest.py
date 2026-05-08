#!/usr/bin/env python3
"""
High-intensity local HTTP stress (stdlib only). Hits one URL with threads ± processes.

Interactive mode: run with **no arguments** to choose scenario 1 / 2 / 3 (each tuned for a Monitoring alert).

CLI mode: pass flags as before. Progress uses **tqdm** when installed; otherwise a simple status line.
ANSI colors are used when stdout is a TTY.

Alert mapping (see setupMonitoring.yml policy names):
  1 — saral-api request-rate spike (needs sustained >1 req/s ~120s on saral-api)
  2 — saral-ui request-rate spike (needs sustained >0.5 req/s ~120s on saral-ui)
  3 — saral-api 5xx rate (aim for LB/Run errors under extreme load; may still be mostly 200)

Examples:
  python scripts/http_load_test.py
  python scripts/http_load_test.py --targetUrl https://saralapi.thatinsaneguy.com/api/health \\
      --durationSeconds 240 --processCount 4 --workerThreads 80 --timeoutSeconds 25
"""

from __future__ import annotations

import argparse
import multiprocessing
import os
import queue
import ssl
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Callable

try:
    from tqdm import tqdm
except ImportError:
    tqdm = None  # type: ignore[misc, assignment]


defaultPublicApiHealthUrl = "https://saralapi.thatinsaneguy.com/api/health"
defaultPublicUiRootUrl = "https://saral.thatinsaneguy.com/"


def _useColor() -> bool:
    return sys.stdout.isatty() and os.environ.get("NO_COLOR") is None


class C:
    """ANSI foreground (TTY only)."""

    RESET = "\033[0m" if _useColor() else ""
    BOLD = "\033[1m" if _useColor() else ""
    DIM = "\033[2m" if _useColor() else ""
    RED = "\033[91m" if _useColor() else ""
    GREEN = "\033[92m" if _useColor() else ""
    YELLOW = "\033[93m" if _useColor() else ""
    BLUE = "\033[94m" if _useColor() else ""
    MAGENTA = "\033[95m" if _useColor() else ""
    CYAN = "\033[96m" if _useColor() else ""


def _fmtStatus(code: int | str) -> str:
    if code == 200:
        return f"{C.GREEN}{code}{C.RESET}"
    if isinstance(code, int) and 400 <= code < 600:
        return f"{C.RED}{code}{C.RESET}"
    if isinstance(code, int):
        return f"{C.YELLOW}{code}{C.RESET}"
    return f"{C.MAGENTA}{code}{C.RESET}"


Row = tuple[int, int | str, float]  # process_index, status_or_exc_name, latency_s


@dataclass
class StressRunConfig:
    scenarioLabel: str
    targetUrl: str
    durationSeconds: float
    workerThreads: int
    processCount: int
    timeoutSeconds: float
    insecureTls: bool = False


def scenarioApiTrafficSpikeConfig() -> StressRunConfig:
    """Tuned to exceed saral-api rate alert (>1 req/s for 120s)."""
    pc = max(2, min(3, (os.cpu_count() or 2)))
    return StressRunConfig(
        scenarioLabel="1-apiTrafficSpike",
        targetUrl=defaultPublicApiHealthUrl,
        durationSeconds=150.0,
        workerThreads=56,
        processCount=pc,
        timeoutSeconds=28.0,
        insecureTls=False,
    )


def scenarioUiTrafficSpikeConfig() -> StressRunConfig:
    """Tuned to exceed saral-ui rate alert (>0.5 req/s for 120s)."""
    pc = max(2, min(3, (os.cpu_count() or 2)))
    return StressRunConfig(
        scenarioLabel="2-uiTrafficSpike",
        targetUrl=defaultPublicUiRootUrl,
        durationSeconds=150.0,
        workerThreads=40,
        processCount=pc,
        timeoutSeconds=28.0,
        insecureTls=False,
    )


def scenarioApiExtremeFivexxHuntConfig() -> StressRunConfig:
    """Max pressure on API path to provoke 502/503/504 (5xx class); not guaranteed."""
    pc = max(3, min(6, (os.cpu_count() or 4)))
    return StressRunConfig(
        scenarioLabel="3-apiExtremeFivexxHunt",
        targetUrl=defaultPublicApiHealthUrl,
        durationSeconds=270.0,
        workerThreads=96,
        processCount=pc,
        timeoutSeconds=12.0,
        insecureTls=False,
    )


def promptInteractiveScenario() -> StressRunConfig:
    print(
        f"""
{C.BOLD}Choose a predefined scenario{C.RESET} (Monitoring alerts — see setupMonitoring.yml):

  {C.CYAN}1{C.RESET}  API traffic spike
       Target: API /api/health  |  Alert: saral-api - request rate spike (low baseline v2)
       (~150s sustained load > Cloud Monitoring 120s window)

  {C.CYAN}2{C.RESET}  UI traffic spike
       Target: UI /  |  Alert: saral-ui - request rate spike (low baseline v2)

  {C.CYAN}3{C.RESET}  API extreme load (5xx hunt)
       Target: API /api/health  |  Alert: saral-api - 5xx rate (sensitive baseline v2)
       (Heavy concurrency + short timeouts; may trigger LB/Run errors — often mixed 200/502)

Enter 1, 2, or 3 (blank aborts): """
        .strip()
        + " ",
        end="",
        flush=True,
    )
    raw = input().strip()
    if raw == "1":
        return scenarioApiTrafficSpikeConfig()
    if raw == "2":
        return scenarioUiTrafficSpikeConfig()
    if raw == "3":
        return scenarioApiExtremeFivexxHuntConfig()
    raise SystemExit("Aborted or invalid choice (expected 1, 2, or 3).")


def computePercentile(sortedVals: list[float], p: float) -> float | None:
    if not sortedVals:
        return None
    k = (len(sortedVals) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(sortedVals) - 1)
    if f == c:
        return sortedVals[f]
    return sortedVals[f] + (sortedVals[c] - sortedVals[f]) * (k - f)


def httpFetchOnce(targetUrl: str, timeoutSeconds: float, sslContext: ssl.SSLContext | None) -> tuple[int | str, float]:
    t0 = time.perf_counter()
    req = urllib.request.Request(
        targetUrl,
        method="GET",
        headers={"User-Agent": "SaralJobViewer-http_load_test/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeoutSeconds, context=sslContext) as resp:
            code = resp.status
            resp.read(65536)
        elapsed = time.perf_counter() - t0
        return code, elapsed
    except urllib.error.HTTPError as e:
        elapsed = time.perf_counter() - t0
        return e.code, elapsed
    except Exception as e:
        elapsed = time.perf_counter() - t0
        return type(e).__name__, elapsed


def threadWorkerLoop(
    targetUrl: str,
    timeoutSeconds: float,
    sslContext: ssl.SSLContext | None,
    stopEvent: threading.Event,
    outQueue: queue.Queue[tuple[int | str, float]],
) -> None:
    while not stopEvent.is_set():
        outQueue.put(httpFetchOnce(targetUrl, timeoutSeconds, sslContext))


def runStressBlock(
    targetUrl: str,
    durationSeconds: float,
    workerThreads: int,
    timeoutSeconds: float,
    sslContext: ssl.SSLContext | None,
    onRow: Callable[[tuple[int | str, float]], None] | None,
) -> list[tuple[int | str, float]]:
    outQueue: queue.Queue[tuple[int | str, float]] = queue.Queue()
    stopEvent = threading.Event()
    threads = [
        threading.Thread(
            target=threadWorkerLoop,
            args=(targetUrl, timeoutSeconds, sslContext, stopEvent, outQueue),
            daemon=True,
        )
        for _ in range(workerThreads)
    ]
    for th in threads:
        th.start()

    rows: list[tuple[int | str, float]] = []
    deadline = time.monotonic() + durationSeconds
    while time.monotonic() < deadline:
        while True:
            try:
                item = outQueue.get_nowait()
                rows.append(item)
                if onRow:
                    onRow(item)
            except queue.Empty:
                break
        time.sleep(0.02)

    stopEvent.set()
    joinTimeout = max(timeoutSeconds, 10.0)
    for th in threads:
        th.join(timeout=joinTimeout)

    while True:
        try:
            item = outQueue.get_nowait()
            rows.append(item)
            if onRow:
                onRow(item)
        except queue.Empty:
            break
    return rows


def stressProcessMain(
    processIndex: int,
    targetUrl: str,
    durationSeconds: float,
    workerThreads: int,
    timeoutSeconds: float,
    insecureTls: bool,
    resultQueue: multiprocessing.Queue[tuple[int, int | str, float]],
) -> None:
    sslContext = ssl.create_default_context()
    if insecureTls:
        sslContext.check_hostname = False
        sslContext.verify_mode = ssl.CERT_NONE

    def sink(row: tuple[int | str, float]) -> None:
        resultQueue.put((processIndex, row[0], row[1]))

    runStressBlock(
        targetUrl,
        durationSeconds,
        workerThreads,
        timeoutSeconds,
        sslContext,
        onRow=sink,
    )


def parseArgsIntoConfig() -> StressRunConfig:
    cpuDefault = max(1, min(4, os.cpu_count() or 4))
    parser = argparse.ArgumentParser(description="High-intensity single-URL HTTP stress (threads ± processes).")
    parser.add_argument("--targetUrl", "--url", dest="targetUrl", default=defaultPublicApiHealthUrl, help="Single URL to hammer.")
    parser.add_argument(
        "--durationSeconds",
        dest="durationSeconds",
        type=float,
        default=180.0,
        help="How long to run each process block.",
    )
    parser.add_argument("--workerThreads", dest="workerThreads", type=int, default=64, help="Threads per process.")
    parser.add_argument("--processCount", dest="processCount", type=int, default=cpuDefault, help="Processes.")
    parser.add_argument("--timeoutSeconds", dest="timeoutSeconds", type=float, default=30.0, help="HTTP socket timeout.")
    parser.add_argument("--insecureTls", "--insecure", dest="insecureTls", action="store_true", help="Disable TLS verification (dev).")
    ns = parser.parse_args()
    return StressRunConfig(
        scenarioLabel="cli",
        targetUrl=ns.targetUrl,
        durationSeconds=ns.durationSeconds,
        workerThreads=ns.workerThreads,
        processCount=ns.processCount,
        timeoutSeconds=ns.timeoutSeconds,
        insecureTls=bool(ns.insecureTls),
    )


class ProgressSink:
    """Thread-safe live stats from streamed rows (parent process only)."""

    def __init__(self, processCount: int, workerThreads: int, durationSeconds: float, startMono: float) -> None:
        self._lock = threading.Lock()
        self.processCount = processCount
        self.workerThreads = workerThreads
        self.durationSeconds = durationSeconds
        self.startMono = startMono
        self.total = 0
        self.byProc: defaultdict[int, int] = defaultdict(int)
        self.errOrNon200 = 0

    def ingest(self, row: Row) -> None:
        procIdx, status, _lat = row
        with self._lock:
            self.total += 1
            self.byProc[procIdx] += 1
            if status != 200:
                self.errOrNon200 += 1

    def snapshot(self) -> tuple[int, dict[int, int], int, float]:
        with self._lock:
            elapsed = max(0.0, time.monotonic() - self.startMono)
            return self.total, dict(self.byProc), self.errOrNon200, elapsed


def _makeProgressBar(desc: str):
    if tqdm is None:
        return None
    return tqdm(
        total=None,
        desc=desc,
        unit="req",
        dynamic_ncols=True,
        leave=True,
        file=sys.stderr,
    )


def _progressLoop(
    sink: ProgressSink,
    stopEvent: threading.Event,
    bar: object | None,
    refreshHz: float = 8.0,
) -> None:
    interval = 1.0 / refreshHz
    lastTotal = 0
    while not stopEvent.wait(interval):
        total, byProc, errCt, elapsed = sink.snapshot()
        procParts = " ".join(f"P{i}:{byProc.get(i, 0)}" for i in range(sink.processCount))
        rps = total / elapsed if elapsed > 0 else 0.0
        postfix = f"{procParts} | ~{rps:.0f}/s | non200+err={errCt}"
        if bar is not None:
            bar.update(total - lastTotal)
            lastTotal = total
            bar.set_postfix_str(postfix)
        else:
            msg = (
                f"{C.DIM}[load]{C.RESET} {C.CYAN}{elapsed:.1f}s{C.RESET}/{sink.durationSeconds:.0f}s "
                f"{C.BOLD}{total}{C.RESET} req {C.DIM}({postfix}){C.RESET}"
            )
            sys.stderr.write("\r" + msg + " " * 4 + "\r")
            sys.stderr.flush()


def executeStressRun(cfg: StressRunConfig) -> None:
    if cfg.workerThreads < 1:
        raise SystemExit("workerThreads must be >= 1")
    if cfg.processCount < 1:
        raise SystemExit("processCount must be >= 1")
    if cfg.durationSeconds <= 0:
        raise SystemExit("durationSeconds must be > 0")

    totalWorkers = cfg.processCount * cfg.workerThreads
    print(f"{C.YELLOW}WARNING:{C.RESET} high load against production can trip quotas, alerts, and costs. Prefer staging when possible.", flush=True)
    print(
        f"{C.BOLD}scenario{C.RESET}={cfg.scenarioLabel} {C.BLUE}url{C.RESET}={cfg.targetUrl} "
        f"{C.CYAN}processCount{C.RESET}={cfg.processCount} {C.CYAN}workerThreads{C.RESET}={cfg.workerThreads} "
        f"=> {C.BOLD}~{totalWorkers}{C.RESET} concurrent worker threads "
        f"| {C.MAGENTA}duration{C.RESET}={cfg.durationSeconds}s {C.MAGENTA}timeout{C.RESET}={cfg.timeoutSeconds}s "
        f"| insecureTls={cfg.insecureTls}",
        flush=True,
    )
    print(
        f"{C.GREEN}Starting{C.RESET} - streaming progress on stderr "
        f"(each Pn is one OS process; each process runs {cfg.workerThreads} threads).\n",
        flush=True,
    )

    mergedRows: list[Row] = []
    startMono = time.monotonic()
    sink = ProgressSink(cfg.processCount, cfg.workerThreads, cfg.durationSeconds, startMono)
    stopUi = threading.Event()
    bar = _makeProgressBar("requests") if sys.stderr.isatty() else None
    uiThread = threading.Thread(
        target=_progressLoop,
        args=(sink, stopUi, bar),
        daemon=True,
    )
    uiThread.start()

    try:
        if cfg.processCount == 1:
            sslContext = ssl.create_default_context()
            if cfg.insecureTls:
                sslContext.check_hostname = False
                sslContext.verify_mode = ssl.CERT_NONE

            def on_row(r: tuple[int | str, float]) -> None:
                sink.ingest((0, r[0], r[1]))

            for row in runStressBlock(
                cfg.targetUrl,
                cfg.durationSeconds,
                cfg.workerThreads,
                cfg.timeoutSeconds,
                sslContext,
                on_row,
            ):
                mergedRows.append((0, row[0], row[1]))
        else:
            mpQueue: multiprocessing.Queue[tuple[int, int | str, float]] = multiprocessing.Queue()
            processes: list[multiprocessing.Process] = []
            for pi in range(cfg.processCount):
                proc = multiprocessing.Process(
                    target=stressProcessMain,
                    args=(
                        pi,
                        cfg.targetUrl,
                        cfg.durationSeconds,
                        cfg.workerThreads,
                        cfg.timeoutSeconds,
                        cfg.insecureTls,
                        mpQueue,
                    ),
                )
                proc.start()
                processes.append(proc)

            alive = True
            while alive:
                alive = any(p.is_alive() for p in processes)
                try:
                    item = mpQueue.get(timeout=0.15)
                    mergedRows.append(item)
                    sink.ingest(item)
                except queue.Empty:
                    continue

            for proc in processes:
                proc.join()

            while True:
                try:
                    item = mpQueue.get_nowait()
                    mergedRows.append(item)
                    sink.ingest(item)
                except queue.Empty:
                    break
    finally:
        stopUi.set()
        uiThread.join(timeout=2.0)
        if bar is not None:
            bar.close()
        elif sys.stderr.isatty():
            sys.stderr.write("\n")

    total = len(mergedRows)
    if total == 0:
        print(f"{C.RED}No completed requests{C.RESET} (timeouts or failure?).")
        return

    statuses = [s for _, s, _ in mergedRows]
    latencies = [lat for _, _, lat in mergedRows]
    counts = Counter(statuses)
    latSorted = sorted(latencies)
    byProcCounts: defaultdict[int, int] = defaultdict(int)
    for pi, _, _ in mergedRows:
        byProcCounts[pi] += 1

    print()
    print(f"{C.BOLD}Completed requests:{C.RESET} {total}")
    procLine = " ".join(f"{C.CYAN}P{i}{C.RESET}={byProcCounts[i]}" for i in range(cfg.processCount))
    print(f"{C.BOLD}Per-process totals:{C.RESET} {procLine}")
    statusParts = [f"{_fmtStatus(s)}: {c}" for s, c in sorted(counts.items(), key=lambda kv: str(kv[0]))]
    print(f"{C.BOLD}Status breakdown:{C.RESET} " + f"{C.DIM}|{C.RESET} ".join(statusParts))
    print(
        f"{C.BOLD}Latency (s):{C.RESET} min={min(latSorted):.4f} max={max(latSorted):.4f} "
        f"mean={statistics.mean(latSorted):.4f}"
    )
    for pct in (50, 95, 99):
        v = computePercentile(latSorted, float(pct))
        print(f"  p{pct}: {v:.4f}" if v is not None else f"  p{pct}: n/a")

    httpOkCount = sum(1 for s in statuses if s == 200)
    ratioColor = C.GREEN if httpOkCount == total else C.YELLOW if httpOkCount > total // 2 else C.RED
    print(f"{C.BOLD}HTTP 200 ratio:{C.RESET} {ratioColor}{httpOkCount / total:.2%}{C.RESET}")


def main() -> None:
    if len(sys.argv) <= 1:
        cfg = promptInteractiveScenario()
    else:
        cfg = parseArgsIntoConfig()
    executeStressRun(cfg)


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
