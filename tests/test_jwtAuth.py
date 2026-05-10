"""Tests for utils/jwtAuth.py."""
from __future__ import annotations

import time

import pytest

from utils.jwtAuth import createJwtToken, verifyJwtToken


def test_createJwtToken_roundTrip():
    payload_in = {"userId": "u1", "email": "a@b.co"}
    token = createJwtToken(payload_in, expiresInSeconds=3600)
    payload_out = verifyJwtToken(token)
    assert payload_out["userId"] == "u1"
    assert payload_out["email"] == "a@b.co"
    assert "exp" in payload_out and "iat" in payload_out


def test_verifyJwtToken_rejectsTamperedPayload():
    token = createJwtToken({"userId": "x"}, expiresInSeconds=120)
    parts = token.split(".")
    assert len(parts) == 3
    bogus = f"{parts[0]}.{parts[1]}wrong.{parts[2]}"
    with pytest.raises(ValueError, match="signature|Invalid"):
        verifyJwtToken(bogus)


def test_verifyJwtToken_expired(monkeypatch):
    """Exp is enforced against time.time()."""
    fixed_now = 1_700_000_000
    monkeypatch.setattr(time, "time", lambda: fixed_now)
    token = createJwtToken({"k": "v"}, expiresInSeconds=60)
    monkeypatch.setattr(time, "time", lambda: fixed_now + 120)
    with pytest.raises(ValueError, match="expired"):
        verifyJwtToken(token)
