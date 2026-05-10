"""Redis cache key helpers — no live Redis required when REDIS_ENABLED=false."""
from __future__ import annotations

import os

import pytest

import utils.redisCache as redis_cache


@pytest.fixture(autouse=True)
def redisOff(monkeypatch):
    monkeypatch.setenv("REDIS_ENABLED", "false")
    monkeypatch.setenv("REDIS_PREFIX", "tjv")
    redis_cache._redisClient = None  # type: ignore[attr-defined]
    redis_cache._redisUnavailable = False  # type: ignore[attr-defined]


def test_keyJobDetail_stable():
    assert redis_cache.keyJobDetail("abc") == "jobs:detail:abc"
    assert redis_cache.keyJobDetail("") == "jobs:detail:"


def test_keyJobsList_includesHash(monkeypatch):
    monkeypatch.setattr(redis_cache, "jobsListVersion", lambda: 3)
    k = redis_cache.keyJobsList({"page": 1, "q": "x"})
    assert k.startswith("jobs:list:v3:")
    k2 = redis_cache.keyJobsList({"page": 1, "q": "x"})
    assert k == k2


def test_jobsListVersion_defaultsWhenRedisOff():
    assert redis_cache.jobsListVersion() >= 1


def test_isRedisEnabled_readsEnv(monkeypatch):
    monkeypatch.setenv("REDIS_ENABLED", "true")
    assert redis_cache.isRedisEnabled() is True
    monkeypatch.setenv("REDIS_ENABLED", "0")
    assert redis_cache.isRedisEnabled() is False


def test_getCachedJson_returnsNoneWithoutRedis():
    assert redis_cache.getCachedJson("any") is None

