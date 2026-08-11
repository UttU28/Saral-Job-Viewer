"""Run validation.py in a local Docker container (replaces Cloud Run job trigger)."""
from __future__ import annotations

import json
import os
import subprocess
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException

CONTAINER_PREFIX = "saral-dvalidate-run-"

_VALIDATION_ENV_KEYS = (
    "MONGODB_URI",
    "MONGODB_DATABASE",
    "MIDHTECH_EMAIL",
    "MIDHTECH_PASSWORD",
    "MIDHTECH_CHECK_ABORT_AFTER_CONSECUTIVE_ERRORS",
)

_capture_threads: dict[str, threading.Thread] = {}
_capture_lock = threading.Lock()


def _validationImage() -> str:
    return str(os.getenv("VALIDATION_IMAGE") or "saral-dvalidate:latest").strip()


def _validationNetwork() -> str:
    return str(os.getenv("VALIDATION_DOCKER_NETWORK") or "saral-job-viewer_sjv-net").strip()


def _validationLogsDir() -> Path:
    raw = str(os.getenv("VALIDATION_LOGS_DIR") or "/var/validation-logs").strip()
    path = Path(raw)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _executionIdFromName(name: str) -> str:
    value = str(name or "").strip().lstrip("/")
    if value.startswith(CONTAINER_PREFIX):
        return value.removeprefix(CONTAINER_PREFIX)
    return value


def _metadataPath(execution_id: str) -> Path:
    return _validationLogsDir() / f"{execution_id}.json"


def _logPath(execution_id: str) -> Path:
    return _validationLogsDir() / f"{execution_id}.log"


def _validationDnsArgs() -> list[str]:
    """Use public DNS so mongodb+srv resolves inside spawned validation containers."""
    servers = str(os.getenv("VALIDATION_DOCKER_DNS") or "8.8.8.8,8.8.4.4").strip()
    args: list[str] = []
    for server in servers.split(","):
        host = server.strip()
        if host:
            args.extend(["--dns", host])
    return args


def _dockerCmd(args: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            ["docker", *args],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail="Docker CLI not found. Install Docker or mount /var/run/docker.sock into the API container.",
        ) from exc


def _validationEnvArgs() -> list[str]:
    args: list[str] = []
    for key in _VALIDATION_ENV_KEYS:
        value = str(os.getenv(key) or "").strip()
        if value:
            args.extend(["-e", f"{key}={value}"])
    return args


def _parseDockerTime(raw: str) -> str:
    value = str(raw or "").strip()
    if not value or value.startswith("0001-"):
        return ""
    try:
        if value.endswith("Z"):
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        else:
            dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        return value


def _stateFromInspect(payload: dict[str, Any]) -> str:
    state = payload.get("State") or {}
    if state.get("Running"):
        return "RUNNING"
    if state.get("Status") == "created":
        return "RUNNING"
    exit_code = state.get("ExitCode")
    if exit_code == 0:
        return "SUCCEEDED"
    if state.get("OOMKilled"):
        return "FAILED"
    if exit_code is not None:
        return "FAILED"
    return "RUNNING"


def _executionFromInspect(payload: dict[str, Any]) -> dict[str, Any]:
    state_block = payload.get("State") or {}
    name = str(payload.get("Name") or "").lstrip("/")
    short_name = name.removeprefix(CONTAINER_PREFIX) if name.startswith(CONTAINER_PREFIX) else name
    state = _stateFromInspect(payload)
    succeeded = 1 if state == "SUCCEEDED" else 0
    failed = 1 if state == "FAILED" else 0
    running = 1 if state == "RUNNING" else 0
    return {
        "executionName": name,
        "shortName": short_name,
        "jobName": _validationImage(),
        "state": state,
        "succeededCount": succeeded,
        "failedCount": failed,
        "cancelledCount": 0,
        "runningCount": running,
        "startTime": _parseDockerTime(str(state_block.get("StartedAt") or "")),
        "completionTime": _parseDockerTime(str(state_block.get("FinishedAt") or "")),
    }


def _countsForState(state: str) -> dict[str, int]:
    succeeded = 1 if state == "SUCCEEDED" else 0
    failed = 1 if state == "FAILED" else 0
    running = 1 if state == "RUNNING" else 0
    cancelled = 1 if state == "CANCELLED" else 0
    return {
        "succeededCount": succeeded,
        "failedCount": failed,
        "cancelledCount": cancelled,
        "runningCount": running,
    }


def _loadExecutionMetadata(execution_id: str) -> dict[str, Any] | None:
    path = _metadataPath(execution_id)
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _saveExecutionMetadata(execution_id: str, payload: dict[str, Any]) -> None:
    path = _metadataPath(execution_id)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _executionFromMetadata(payload: dict[str, Any]) -> dict[str, Any]:
    state = str(payload.get("state") or "RUNNING")
    counts = _countsForState(state)
    execution_id = str(payload.get("executionId") or "")
    container_name = str(payload.get("executionName") or f"{CONTAINER_PREFIX}{execution_id}")
    short_name = container_name.removeprefix(CONTAINER_PREFIX) if container_name.startswith(CONTAINER_PREFIX) else execution_id
    return {
        "executionName": container_name,
        "shortName": short_name,
        "jobName": str(payload.get("jobName") or _validationImage()),
        "state": state,
        "mode": str(payload.get("mode") or ""),
        **counts,
        "startTime": str(payload.get("startTime") or ""),
        "completionTime": str(payload.get("completionTime") or ""),
        "hasLogs": _logPath(execution_id).is_file(),
    }


def _refreshRunningMetadata(execution_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    if str(payload.get("state") or "") != "RUNNING":
        return payload

    container_name = str(payload.get("executionName") or f"{CONTAINER_PREFIX}{execution_id}")
    result = _dockerCmd(["inspect", container_name, "--format", "{{json .}}"])
    if result.returncode != 0:
        return payload

    try:
        inspect_payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return payload

    row = _executionFromInspect(inspect_payload)
    if row["state"] == "RUNNING":
        payload["startTime"] = row["startTime"] or payload.get("startTime") or ""
        return payload

    payload["state"] = row["state"]
    payload["startTime"] = row["startTime"] or payload.get("startTime") or ""
    payload["completionTime"] = row["completionTime"] or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    _saveExecutionMetadata(execution_id, payload)
    return payload


def _loadAllPersistedExecutions() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    logs_dir = _validationLogsDir()
    for path in sorted(logs_dir.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True):
        execution_id = path.stem
        payload = _loadExecutionMetadata(execution_id)
        if not payload:
            continue
        payload = _refreshRunningMetadata(execution_id, payload)
        rows.append(_executionFromMetadata(payload))
    return rows


def _captureContainerLogs(container_name: str, execution_id: str) -> None:
    log_path = _logPath(execution_id)
    exit_code = "1"

    wait_result = _dockerCmd(["wait", container_name])
    if wait_result.returncode == 0:
        exit_code = (wait_result.stdout or "1").strip() or "1"

    logs_result = _dockerCmd(["logs", container_name])
    text = ""
    if logs_result.returncode == 0:
        stdout = logs_result.stdout or ""
        stderr = logs_result.stderr or ""
        text = stdout if stdout else stderr
        if stdout and stderr:
            text = f"{stdout}\n{stderr}" if not stdout.endswith("\n") else f"{stdout}{stderr}"

    try:
        log_path.write_text(text, encoding="utf-8")
    except OSError:
        pass

    payload = _loadExecutionMetadata(execution_id) or {}
    state = "SUCCEEDED" if exit_code == "0" else "FAILED"
    payload["state"] = state
    payload["completionTime"] = payload.get("completionTime") or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    _saveExecutionMetadata(execution_id, payload)


def _streamContainerLogs(container_name: str, execution_id: str) -> None:
    log_path = _logPath(execution_id)
    exit_code_holder: list[str] = ["1"]
    logs_error: list[str | None] = [None]

    def _waitForExit() -> None:
        wait_result = _dockerCmd(["wait", container_name])
        if wait_result.returncode == 0:
            exit_code_holder[0] = (wait_result.stdout or "1").strip() or "1"

    wait_thread = threading.Thread(target=_waitForExit, name=f"validation-wait-{execution_id}", daemon=True)
    wait_thread.start()

    try:
        with subprocess.Popen(
            ["docker", "logs", "-f", container_name],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        ) as proc:
            with log_path.open("w", encoding="utf-8") as handle:
                if proc.stdout is not None:
                    for line in proc.stdout:
                        handle.write(line)
                        handle.flush()
            proc.wait()
            if proc.returncode not in (0, None):
                logs_error[0] = f"docker logs exited with code {proc.returncode}"
    except OSError as exc:
        logs_error[0] = str(exc)

    wait_thread.join(timeout=30)

    payload = _loadExecutionMetadata(execution_id) or {}
    exit_code = exit_code_holder[0]
    state = "SUCCEEDED" if exit_code == "0" else "FAILED"
    payload["state"] = state
    payload["completionTime"] = payload.get("completionTime") or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    _saveExecutionMetadata(execution_id, payload)

    if logs_error[0] and not log_path.is_file():
        try:
            _captureContainerLogs(container_name, execution_id)
        except Exception:
            pass


def _startLogCapture(container_name: str, execution_id: str) -> None:
    with _capture_lock:
        existing = _capture_threads.get(execution_id)
        if existing is not None and existing.is_alive():
            return
        thread = threading.Thread(
            target=_streamContainerLogs,
            args=(container_name, execution_id),
            name=f"validation-logs-{execution_id}",
            daemon=True,
        )
        _capture_threads[execution_id] = thread
        thread.start()


def triggerValidationContainer(*, modeNumber: str) -> dict[str, str]:
    mode = str(modeNumber or "").strip()
    if mode not in {"1", "2", "3"}:
        raise HTTPException(status_code=400, detail="Validation mode must be 1, 2, or 3.")

    execution_id = uuid.uuid4().hex[:12]
    container_name = f"{CONTAINER_PREFIX}{execution_id}"
    image = _validationImage()
    network = _validationNetwork()
    start_time = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    _saveExecutionMetadata(
        execution_id,
        {
            "executionId": execution_id,
            "executionName": container_name,
            "mode": mode,
            "jobName": image,
            "state": "RUNNING",
            "startTime": start_time,
            "completionTime": "",
        },
    )
    _logPath(execution_id).write_text("", encoding="utf-8")

    cmd = [
        "run",
        "-d",
        "--rm",
        "--name",
        container_name,
        "--network",
        network,
        "--init",
        *_validationDnsArgs(),
        *_validationEnvArgs(),
        image,
        f"-{mode}",
    ]
    result = _dockerCmd(cmd)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "docker run failed").strip()
        payload = _loadExecutionMetadata(execution_id) or {}
        payload["state"] = "FAILED"
        payload["completionTime"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        _saveExecutionMetadata(execution_id, payload)
        try:
            _logPath(execution_id).write_text(f"Failed to start validation container:\n{detail}\n", encoding="utf-8")
        except OSError:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to start validation container: {detail}")

    container_id = (result.stdout or "").strip()
    _startLogCapture(container_name, execution_id)
    return {
        "image": image,
        "network": network,
        "containerName": container_name,
        "containerId": container_id,
        "executionName": container_name,
        "mode": mode,
    }


def fetchValidationExecutionStatus(*, executionName: str) -> dict[str, Any]:
    name = str(executionName or "").strip().lstrip("/")
    if not name:
        raise HTTPException(status_code=400, detail="executionName is required.")

    execution_id = _executionIdFromName(name)
    metadata = _loadExecutionMetadata(execution_id)
    if metadata:
        metadata = _refreshRunningMetadata(execution_id, metadata)
        return _executionFromMetadata(metadata)

    result = _dockerCmd(["inspect", name, "--format", "{{json .}}"])
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "container not found").strip()
        raise HTTPException(status_code=404, detail=detail)

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Could not parse docker inspect output.") from exc

    return _executionFromInspect(payload)


def fetchValidationContainerLogs(*, executionName: str, offset: int = 0) -> dict[str, Any]:
    name = str(executionName or "").strip().lstrip("/")
    if not name:
        raise HTTPException(status_code=400, detail="executionName is required.")

    execution_id = _executionIdFromName(name)
    metadata = _loadExecutionMetadata(execution_id)
    if metadata:
        metadata = _refreshRunningMetadata(execution_id, metadata)
    else:
        metadata = {"state": "RUNNING", "executionName": name, "executionId": execution_id}

    log_path = _logPath(execution_id)
    state = str(metadata.get("state") or "RUNNING")
    start_offset = max(0, int(offset or 0))
    chunk = ""
    next_offset = start_offset

    if log_path.is_file():
        try:
            raw = log_path.read_bytes()
            if start_offset > len(raw):
                start_offset = len(raw)
            chunk = raw[start_offset:].decode("utf-8", errors="replace")
            next_offset = len(raw)
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Could not read validation logs: {exc}") from exc
    elif state == "RUNNING":
        result = _dockerCmd(["logs", "--tail", "500", name])
        if result.returncode == 0:
            stdout = result.stdout or ""
            stderr = result.stderr or ""
            chunk = stdout if stdout else stderr
            if stdout and stderr:
                chunk = f"{stdout}\n{stderr}" if not stdout.endswith("\n") else f"{stdout}{stderr}"
            next_offset = len(chunk.encode("utf-8"))

    return {
        "executionName": name,
        "state": state,
        "logs": chunk,
        "offset": next_offset,
        "complete": state != "RUNNING",
    }


def clearValidationContainerLogs(*, executionName: str) -> dict[str, Any]:
    name = str(executionName or "").strip().lstrip("/")
    if not name:
        raise HTTPException(status_code=400, detail="executionName is required.")

    execution_id = _executionIdFromName(name)
    log_path = _logPath(execution_id)
    if log_path.is_file():
        try:
            log_path.unlink()
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Could not clear validation logs: {exc}") from exc

    return {"ok": True, "executionName": name, "cleared": True}


def listValidationExecutions(*, limit: int, pageToken: str = "") -> dict[str, Any]:
    cap = min(max(1, limit), 50)
    persisted_rows = _loadAllPersistedExecutions()
    persisted_by_name = {row["executionName"]: row for row in persisted_rows}

    result = _dockerCmd(
        [
            "ps",
            "-a",
            "--filter",
            f"name={CONTAINER_PREFIX}",
            "--format",
            "{{json .}}",
        ]
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "docker ps failed").strip()
        raise HTTPException(status_code=500, detail=detail)

    docker_rows: list[dict[str, Any]] = []
    for line in (result.stdout or "").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            summary = json.loads(line)
        except json.JSONDecodeError:
            continue
        container_name = str(summary.get("Names") or "").lstrip("/")
        if not container_name.startswith(CONTAINER_PREFIX):
            continue
        inspect_result = _dockerCmd(["inspect", container_name, "--format", "{{json .}}"])
        if inspect_result.returncode != 0:
            continue
        try:
            payload = json.loads(inspect_result.stdout)
        except json.JSONDecodeError:
            continue
        row = _executionFromInspect(payload)
        execution_id = _executionIdFromName(container_name)
        row["hasLogs"] = _logPath(execution_id).is_file()
        row["mode"] = str((persisted_by_name.get(container_name) or {}).get("mode") or "")
        docker_rows.append(row)
        persisted_by_name.pop(container_name, None)

    rows = docker_rows + list(persisted_by_name.values())
    rows.sort(key=lambda row: row.get("startTime") or "", reverse=True)

    offset = 0
    token = str(pageToken or "").strip()
    if token.isdigit():
        offset = int(token)

    page = rows[offset : offset + cap]
    next_offset = offset + cap
    next_page_token = str(next_offset) if next_offset < len(rows) else ""

    return {
        "parentJob": _validationImage(),
        "executions": page,
        "nextPageToken": next_page_token,
    }
