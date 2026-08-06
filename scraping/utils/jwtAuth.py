from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any


def _b64UrlEncode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _b64UrlDecode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _jwtSecret() -> str:
    secret = (os.getenv("JWT_SECRET") or "").strip()
    if not secret:
        raise ValueError("Set JWT_SECRET in .env")
    return secret


def createJwtToken(payload: dict[str, Any], *, expiresInSeconds: int = 60 * 60 * 24 * 7) -> str:
    now = int(time.time())
    claims = dict(payload)
    claims["iat"] = now
    claims["exp"] = now + max(60, int(expiresInSeconds))
    header = {"alg": "HS256", "typ": "JWT"}
    encodedHeader = _b64UrlEncode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encodedPayload = _b64UrlEncode(json.dumps(claims, separators=(",", ":")).encode("utf-8"))
    signingInput = f"{encodedHeader}.{encodedPayload}".encode("utf-8")
    signature = hmac.new(_jwtSecret().encode("utf-8"), signingInput, hashlib.sha256).digest()
    encodedSignature = _b64UrlEncode(signature)
    return f"{encodedHeader}.{encodedPayload}.{encodedSignature}"


def verifyJwtToken(token: str) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid token format")
    encodedHeader, encodedPayload, encodedSignature = parts
    signingInput = f"{encodedHeader}.{encodedPayload}".encode("utf-8")
    expectedSig = hmac.new(_jwtSecret().encode("utf-8"), signingInput, hashlib.sha256).digest()
    actualSig = _b64UrlDecode(encodedSignature)
    if not hmac.compare_digest(expectedSig, actualSig):
        raise ValueError("Invalid token signature")

    payloadRaw = _b64UrlDecode(encodedPayload)
    payload = json.loads(payloadRaw.decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Invalid token payload")
    exp = int(payload.get("exp") or 0)
    if exp <= int(time.time()):
        raise ValueError("Token expired")
    return payload
