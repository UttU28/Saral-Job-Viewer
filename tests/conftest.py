"""Shared pytest setup — env vars must run before importing app."""
from __future__ import annotations

import os

os.environ.setdefault(
    "JWT_SECRET",
    "test-jwt-secret-for-pytest-only-min-32-characters-long!!",
)
os.environ.setdefault("REDIS_ENABLED", "false")
