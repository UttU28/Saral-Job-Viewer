from __future__ import annotations

import hashlib
import json
import os
from typing import Any

try:
    import redis
except Exception:  # pragma: no cover
    redis = None  # type: ignore[assignment]


_redisClient: Any | None = None
_redisUnavailable = False


def _envBool(name: str, default: bool) -> bool:
    raw = str(os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def isRedisEnabled() -> bool:
    return _envBool("REDIS_ENABLED", False)


def _cachePrefix() -> str:
    return str(os.getenv("REDIS_PREFIX") or "sjv").strip() or "sjv"


def _versionPrefix() -> str:
    return f"{_cachePrefix()}:v1"


def _defaultTtlSeconds() -> int:
    try:
        return max(5, int(str(os.getenv("REDIS_DEFAULT_TTL_SECONDS") or "60").strip()))
    except Exception:
        return 60


def _fullKey(suffix: str) -> str:
    return f"{_versionPrefix()}:{suffix}"


def getRedisClient():
    global _redisClient, _redisUnavailable
    if _redisUnavailable:
        return None
    if not isRedisEnabled():
        return None
    if _redisClient is not None:
        return _redisClient
    if redis is None:
        _redisUnavailable = True
        return None
    try:
        redisUrl = str(os.getenv("REDIS_URL") or "redis://127.0.0.1:6379/0").strip()
        socketTimeoutMs = int(str(os.getenv("REDIS_SOCKET_TIMEOUT_MS") or "500").strip())
        socketConnectTimeoutMs = int(str(os.getenv("REDIS_CONNECT_TIMEOUT_MS") or "500").strip())
        client = redis.Redis.from_url(
            redisUrl,
            decode_responses=True,
            socket_timeout=max(0.1, socketTimeoutMs / 1000.0),
            socket_connect_timeout=max(0.1, socketConnectTimeoutMs / 1000.0),
            health_check_interval=30,
        )
        client.ping()
        _redisClient = client
        return _redisClient
    except Exception:
        _redisUnavailable = True
        return None


def _stableHash(value: dict[str, Any]) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def getIntValue(keySuffix: str, defaultValue: int = 0) -> int:
    client = getRedisClient()
    if client is None:
        return defaultValue
    try:
        raw = client.get(_fullKey(keySuffix))
        if raw is None:
            return defaultValue
        return int(str(raw).strip())
    except Exception:
        return defaultValue


def incrementIntValue(keySuffix: str) -> int:
    client = getRedisClient()
    if client is None:
        return 0
    try:
        return int(client.incr(_fullKey(keySuffix)))
    except Exception:
        return 0


def deleteCacheKey(keySuffix: str) -> None:
    client = getRedisClient()
    if client is None:
        return
    try:
        client.delete(_fullKey(keySuffix))
    except Exception:
        return


def getCachedJson(keySuffix: str) -> Any | None:
    client = getRedisClient()
    if client is None:
        return None
    try:
        raw = client.get(_fullKey(keySuffix))
        if raw is None:
            return None
        return json.loads(raw)
    except Exception:
        return None


def setCachedJson(keySuffix: str, value: Any, ttlSeconds: int | None = None) -> None:
    client = getRedisClient()
    if client is None:
        return
    ttl = ttlSeconds if ttlSeconds is not None else _defaultTtlSeconds()
    if ttl <= 0:
        return
    try:
        payload = json.dumps(value, separators=(",", ":"), default=str)
        client.setex(_fullKey(keySuffix), int(ttl), payload)
    except Exception:
        return


def jobsListVersion() -> int:
    return getIntValue("jobs:listVersion", 1)


def bumpJobsListVersion() -> int:
    return incrementIntValue("jobs:listVersion")


def keyJobsList(params: dict[str, Any]) -> str:
    version = jobsListVersion()
    return f"jobs:list:v{version}:{_stableHash(params)}"


def keyJobsSummary() -> str:
    return "jobs:summary"


def keyJobPlatforms() -> str:
    return "jobs:platforms"


def keyJobDetail(jobId: str) -> str:
    return f"jobs:detail:{str(jobId or '').strip()}"


def keyProfileWeeklyReport(userId: str) -> str:
    return f"profile:weeklyReport:{str(userId or '').strip()}"


def keyProfileCurrentWeekAccepts(userId: str) -> str:
    return f"profile:currentWeekAccepts:{str(userId or '').strip()}"


def keyAdminUsers() -> str:
    return "admin:users"


def keyAdminJobStatusSummary() -> str:
    return "admin:jobs:statusSummary"
