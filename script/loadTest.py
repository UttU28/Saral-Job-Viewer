#!/usr/bin/env python3
"""
High-intensity local HTTP stress (stdlib only). Hits one URL with threads ± processes.

Interactive mode: run with **no arguments** to choose scenario 1 / 2 / 3 (each tuned for a Monitoring alert).

CLI mode: pass flags as before. With **tqdm** installed, one determinate tqdm bar per OS process appears on its **own line**
(``position=i``), filling over **durationSeconds**. Without tqdm, the same layout is approximated with multi-line ASCII bars on stderr.
ANSI labels respect TTY + NO_COLOR.

Alert mapping (see setupMonitoring.yml policy names):
  1 — saral-api request-rate spike (needs sustained >1 req/s ~120s on saral-api)
  2 — saral-ui request-rate spike (needs sustained >0.5 req/s ~120s on saral-ui)
  3 — saral-api 5xx rate (aim for LB/Run errors under extreme load; may still be mostly 200)

Examples (from repo root):
  python script/loadTest.py
  python script/loadTest.py --targetUrl https://saralapi.thatinsaneguy.com/api/health \\
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
    from tqdm.auto import tqdm as tqdmModule  # type: ignore[attr-defined, no-redef]
except ImportError:
    try:
        from tqdm import tqdm as tqdmModule  # type: ignore[assignment, no-redef]
    except ImportError:
        tqdmModule = None  # type: ignore[misc, assignment]

tqdm = tqdmModule


defaultPublicApiHealthUrl = "https://saralapi.thatinsaneguy.com/api/health"
defaultPublicUiRootUrl = "https://saral.thatinsaneguy.com/"


def _useColor() -> bool:
    return sys.stdout.isatty() and os.environ.get("NO_COLOR") is None


def _stderrRich() -> bool:
    """stderr is a TTY and ANSI labels are allowed."""
    return sys.stderr.isatty() and os.environ.get("NO_COLOR") is None


def _stderrSupportsAnsiCursor() -> bool:
    """Move cursor up for multi-line in-place updates (best-effort)."""
    return _stderrRich()


_procBarStyles: list[tuple[str, str]] = [
    ("green", "\033[92m"),
    ("cyan", "\033[96m"),
    ("blue", "\033[94m"),
    ("magenta", "\033[95m"),
    ("yellow", "\033[93m"),
    ("red", "\033[91m"),
]


def _procStyle(processIndex: int) -> tuple[str, str]:
    return _procBarStyles[processIndex % len(_procBarStyles)]


def _procBarDesc(processIndex: int) -> str:
    _colourName, ansi = _procStyle(processIndex)
    if not _stderrRich():
        return f"P{processIndex}"
    reset = "\033[0m"
    bold = "\033[1m"
    return f"{bold}{ansi}P{processIndex}{reset}"


def _procStdoutLabel(processIndex: int) -> str:
    _c, ansi = _procStyle(processIndex)
    if not _useColor():
        return f"P{processIndex}"
    reset = "\033[0m"
    bold = "\033[1m"
    return f"{bold}{ansi}P{processIndex}{reset}"


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


def _metricsBucket(status: int | str) -> str:
    """Bucket HTTP / transport outcomes for rates (API-oriented)."""
    if isinstance(status, str):
        return "transport"
    if not isinstance(status, int):
        return "transport"
    if status == 200:
        return "200"
    if 200 < status < 300:
        return "2xx_other"
    if 300 <= status < 400:
        return "3xx"
    if 400 <= status < 500:
        return "4xx"
    if 500 <= status < 600:
        return "5xx"
    return "http_other"


def _percentOf(part: int, whole: int) -> float:
    return (100.0 * part / whole) if whole else 0.0


def _asciiBar(percent: float, width: int = 28) -> str:
    p = max(0.0, min(100.0, percent))
    filled = min(width, int(round(width * p / 100.0)))
    return "[" + "#" * filled + "-" * (width - filled) + "]"


Row = tuple[int, int | str, float]  # processIndex, statusOrExcName, latencySeconds


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
        self.byProc2xx: defaultdict[int, int] = defaultdict(int)
        self.http200 = 0
        self.http2xxOther = 0
        self.http3xx = 0
        self.http4xx = 0
        self.http5xx = 0
        self.httpOther = 0
        self.transport = 0
        self.lastUiLineCount = 0

    def ingest(self, row: Row) -> None:
        procIdx, status, _lat = row
        bucket = _metricsBucket(status)
        with self._lock:
            self.total += 1
            self.byProc[procIdx] += 1
            if bucket == "200":
                self.http200 += 1
                self.byProc2xx[procIdx] += 1
            elif bucket == "2xx_other":
                self.http2xxOther += 1
                self.byProc2xx[procIdx] += 1
            elif bucket == "3xx":
                self.http3xx += 1
            elif bucket == "4xx":
                self.http4xx += 1
            elif bucket == "5xx":
                self.http5xx += 1
            elif bucket == "http_other":
                self.httpOther += 1
            else:
                self.transport += 1

    def snapshot(self) -> tuple[int, dict[int, int], dict[int, int], int, int, int, int, int, int, int, float]:
        with self._lock:
            elapsed = max(0.0, time.monotonic() - self.startMono)
            return (
                self.total,
                dict(self.byProc),
                dict(self.byProc2xx),
                self.http200,
                self.http2xxOther,
                self.http3xx,
                self.http4xx,
                self.http5xx,
                self.httpOther,
                self.transport,
                elapsed,
            )


def _fmtRateLine(label: str, count: int, total: int, *, good: bool | None = None) -> str:
    p = _percentOf(count, total)
    col = ""
    reset = C.RESET
    if good is True:
        col = C.GREEN
    elif good is False:
        col = C.RED
    elif good is None:
        col = "" if count else C.DIM
    return f"{C.BOLD}{label}:{C.RESET} {col}{count}{reset} ({p:.2f}%)"


def _printHttpRateSummary(statuses: list[int | str]) -> None:
    n = len(statuses)
    if n == 0:
        return
    bc = Counter(_metricsBucket(s) for s in statuses)
    b200 = bc["200"]
    b2o = bc["2xx_other"]
    b3 = bc["3xx"]
    b4 = bc["4xx"]
    b5 = bc["5xx"]
    bo = bc["http_other"]
    bt = bc["transport"]
    ok2xx = b200 + b2o
    failLike = n - ok2xx

    print(f"{C.BOLD}API outcome rates{C.RESET} ({n} completed responses)")
    print(f"  {_fmtRateLine('HTTP 2xx (success)', ok2xx, n, good=ok2xx == n)}")
    print(f"  {_fmtRateLine('  including 200 OK', b200, n, good=None)}")
    if b2o:
        print(f"  {_fmtRateLine('  other 2xx', b2o, n, good=None)}")
    print(f"  {_fmtRateLine('non-2xx + transport (error-oriented)', failLike, n, good=failLike == 0)}")
    if b3:
        print(f"  {_fmtRateLine('HTTP 3xx', b3, n, good=None)}")
    print(f"  {_fmtRateLine('HTTP 4xx', b4, n, good=b4 == 0)}")
    print(f"  {_fmtRateLine('HTTP 5xx', b5, n, good=b5 == 0)}")
    if bo:
        print(f"  {_fmtRateLine('other HTTP codes', bo, n, good=False)}")
    print(f"  {_fmtRateLine('transport / exceptions', bt, n, good=bt == 0)}")


def _makeProcessBars(processCount: int, durationSeconds: float) -> list | None:
    """One determinate tqdm bar per OS process (parent UI thread drives wall-clock fill)."""
    if tqdm is None:
        return None
    bars = []
    for i in range(processCount):
        colourName, _ansi = _procStyle(i)
        desc = _procBarDesc(i)
        kwargs = dict(
            total=float(durationSeconds),
            desc=desc,
            unit="s",
            position=i,
            leave=True,
            file=sys.stderr,
            dynamic_ncols=True,
            mininterval=0.05,
            ascii=True,
            bar_format="{desc}: {percentage:3.0f}%|{bar}| {n:.1f}/{total:.1f}s {postfix}",
        )
        try:
            bars.append(tqdm(**kwargs, colour=colourName))
        except TypeError:
            bars.append(tqdm(**kwargs))
    return bars


def _progressLoopProcessBars(sink: ProgressSink, stopEvent: threading.Event, bars: list | None, refreshHz: float = 12.0) -> None:
    interval = 1.0 / refreshHz
    duration = sink.durationSeconds
    while not stopEvent.wait(interval):
        (
            total,
            byProc,
            byProc2xx,
            _h200,
            _h2o,
            _h3,
            _h4,
            _h5,
            _ho,
            _ht,
            elapsedWall,
        ) = sink.snapshot()
        wall = min(duration, elapsedWall)
        wallPercent = (100.0 * wall / duration) if duration > 0 else 0.0

        if bars is not None:
            sum2xx = sum(byProc2xx.get(j, 0) for j in range(sink.processCount))
            g2 = _percentOf(sum2xx, total) if total else 0.0
            for i, bar in enumerate(bars):
                bar.n = wall
                reqs = byProc.get(i, 0)
                ok2 = byProc2xx.get(i, 0)
                if reqs:
                    okPct = _percentOf(ok2, reqs)
                    errPct = _percentOf(reqs - ok2, reqs)
                    rateBits = f"2xx={okPct:.0f}% fail={errPct:.0f}%"
                else:
                    rateBits = "2xx=- fail=-"
                rpsI = reqs / elapsedWall if elapsedWall > 0 else 0.0
                bar.set_postfix_str(f"req={reqs} {rateBits} ~{rpsI:.0f}/s | all2xx={g2:.0f}%")
                bar.refresh()
            continue

        sum2xx = sum(byProc2xx.get(j, 0) for j in range(sink.processCount))
        g2 = _percentOf(sum2xx, total) if total else 0.0
        globRps = total / elapsedWall if elapsedWall > 0 else 0.0
        lines: list[str] = []
        head = (
            f"{C.DIM}[load]{C.RESET} {_asciiBar(wallPercent)} {wall:.1f}s/{duration:.0f}s "
            f"| {C.BOLD}{total}{C.RESET} req | all2xx={g2:.0f}% | ~{globRps:.0f}/s"
        )
        lines.append(head)
        for i in range(sink.processCount):
            reqs = byProc.get(i, 0)
            ok2 = byProc2xx.get(i, 0)
            if reqs:
                epct = _percentOf(reqs - ok2, reqs)
                bits = f"2xx:{_percentOf(ok2, reqs):.0f}% fail:{epct:.0f}%"
            else:
                bits = "2xx:- fail:-"
            _, ansi = _procStyle(i)
            barAscii = _asciiBar(wallPercent)
            if _stderrRich():
                rpsPart = f" | ~{reqs/elapsedWall:.0f}/s" if elapsedWall > 0 else ""
                line = (
                    f"{ansi}{C.BOLD}P{i}{C.RESET} {barAscii} {wallPercent:.0f}% wall | "
                    f"req={reqs} {C.DIM}{bits}{C.RESET}{rpsPart}"
                )
            else:
                line = f"P{i} {barAscii} {wallPercent:.0f}% wall | req={reqs} ({bits})"
            lines.append(line)

        block = "\n".join(lines) + "\n"
        if _stderrSupportsAnsiCursor() and sink.lastUiLineCount > 0:
            sys.stderr.write(f"\033[{sink.lastUiLineCount}A")
        sys.stderr.write(block)
        sys.stderr.flush()
        sink.lastUiLineCount = len(lines)


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

    processBars = _makeProcessBars(cfg.processCount, cfg.durationSeconds)
    if processBars is not None:
        print(
            f"{C.GREEN}Starting{C.RESET} - {C.BOLD}{cfg.processCount} tqdm progress bar(s){C.RESET} on stderr "
            f"(one row per process); each fills {C.MAGENTA}{cfg.durationSeconds:g}s{C.RESET} wall time; "
            f"{C.CYAN}{cfg.workerThreads}{C.RESET} worker threads per process.\n",
            flush=True,
        )
    else:
        print(
            f"{C.GREEN}Starting{C.RESET} - {C.BOLD}{cfg.processCount} ASCII progress row(s){C.RESET} on stderr "
            f"(install tqdm for richer bars: {C.DIM}pip install tqdm{C.RESET}); "
            f"wall window {C.MAGENTA}{cfg.durationSeconds:g}s{C.RESET}; "
            f"{C.CYAN}{cfg.workerThreads}{C.RESET} worker threads per process.\n",
            flush=True,
        )

    mergedRows: list[Row] = []
    startMono = time.monotonic()
    sink = ProgressSink(cfg.processCount, cfg.workerThreads, cfg.durationSeconds, startMono)
    stopUi = threading.Event()
    uiThread = threading.Thread(
        target=_progressLoopProcessBars,
        args=(sink, stopUi, processBars),
        daemon=True,
    )
    uiThread.start()

    try:
        if cfg.processCount == 1:
            sslContext = ssl.create_default_context()
            if cfg.insecureTls:
                sslContext.check_hostname = False
                sslContext.verify_mode = ssl.CERT_NONE

            def onRow(r: tuple[int | str, float]) -> None:
                sink.ingest((0, r[0], r[1]))

            for row in runStressBlock(
                cfg.targetUrl,
                cfg.durationSeconds,
                cfg.workerThreads,
                cfg.timeoutSeconds,
                sslContext,
                onRow,
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
        if processBars:
            fin = float(cfg.durationSeconds)
            for b in processBars:
                b.n = fin
                b.refresh()
                b.close()
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
    byProc2xxAgg: defaultdict[int, int] = defaultdict(int)
    for pi, st, _ in mergedRows:
        byProcCounts[pi] += 1
        if _metricsBucket(st) in ("200", "2xx_other"):
            byProc2xxAgg[pi] += 1

    print()
    print(f"{C.BOLD}Completed requests:{C.RESET} {total}")
    procLine = " ".join(f"{_procStdoutLabel(i)}={byProcCounts[i]}" for i in range(cfg.processCount))
    print(f"{C.BOLD}Per-process totals:{C.RESET} {procLine}")
    proc2xxParts = []
    for i in range(cfg.processCount):
        totI = byProcCounts[i]
        okI = byProc2xxAgg[i]
        proc2xxParts.append(f"{_procStdoutLabel(i)} {_percentOf(okI, totI):.1f}% 2xx ({okI}/{totI})")
    print(f"{C.BOLD}Per-process API success (2xx):{C.RESET} " + f"{C.DIM}|{C.RESET} ".join(proc2xxParts))
    statusParts = [f"{_fmtStatus(s)}: {c}" for s, c in sorted(counts.items(), key=lambda kv: str(kv[0]))]
    print(f"{C.BOLD}Status breakdown:{C.RESET} " + f"{C.DIM}|{C.RESET} ".join(statusParts))
    _printHttpRateSummary(statuses)
    print(
        f"{C.BOLD}Latency (s):{C.RESET} min={min(latSorted):.4f} max={max(latSorted):.4f} "
        f"mean={statistics.mean(latSorted):.4f}"
    )
    for pctVal in (50, 95, 99):
        v = computePercentile(latSorted, float(pctVal))
        print(f"  p{pctVal}: {v:.4f}" if v is not None else f"  p{pctVal}: n/a")


def main() -> None:
    if len(sys.argv) <= 1:
        cfg = promptInteractiveScenario()
    else:
        cfg = parseArgsIntoConfig()
    executeStressRun(cfg)


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
