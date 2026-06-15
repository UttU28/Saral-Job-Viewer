"""Run validation.py in a local Docker container (replaces Cloud Run job trigger)."""
from __future__ import annotations

import json
import os
import subprocess
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

CONTAINER_PREFIX = "saral-dvalidate-run-"

_VALIDATION_ENV_KEYS = (
    "MONGODB_URI",
    "MONGODB_DATABASE",
    "MIDHTECH_EMAIL",
    "MIDHTECH_PASSWORD",
)


def _validationImage() -> str:
    return str(os.getenv("VALIDATION_IMAGE") or "saral-dvalidate:latest").strip()


def _validationNetwork() -> str:
    return str(os.getenv("VALIDATION_DOCKER_NETWORK") or "saral-job-viewer_sjv-net").strip()


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


def triggerValidationContainer(*, modeNumber: str) -> dict[str, str]:
    mode = str(modeNumber or "").strip()
    if mode not in {"1", "2", "3"}:
        raise HTTPException(status_code=400, detail="Validation mode must be 1, 2, or 3.")

    execution_id = uuid.uuid4().hex[:12]
    container_name = f"{CONTAINER_PREFIX}{execution_id}"
    image = _validationImage()
    network = _validationNetwork()

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
        raise HTTPException(status_code=500, detail=f"Failed to start validation container: {detail}")

    container_id = (result.stdout or "").strip()
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

    result = _dockerCmd(["inspect", name, "--format", "{{json .}}"])
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "container not found").strip()
        raise HTTPException(status_code=404, detail=detail)

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Could not parse docker inspect output.") from exc

    return _executionFromInspect(payload)


def listValidationExecutions(*, limit: int, pageToken: str = "") -> dict[str, Any]:
    cap = min(max(1, limit), 50)
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

    rows: list[dict[str, Any]] = []
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
        rows.append(_executionFromInspect(payload))

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
