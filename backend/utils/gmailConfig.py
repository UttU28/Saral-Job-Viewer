from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT_DIR = Path(__file__).resolve().parent.parent
GMAIL_DATA_DIR = ROOT_DIR / "data" / "gmail"
GMAIL_UPLOADS_DIR = Path(
    os.getenv("GMAIL_UPLOADS_DIR") or str(GMAIL_DATA_DIR / "uploads"),
)

GMAIL_DATA_DIR.mkdir(parents=True, exist_ok=True)
GMAIL_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

GMAIL_SCOPE_COMPOSE = "https://www.googleapis.com/auth/gmail.compose"
GMAIL_SCOPE_SEND = "https://www.googleapis.com/auth/gmail.send"
GMAIL_SCOPE_READONLY = "https://www.googleapis.com/auth/gmail.readonly"
GMAIL_SCOPE_MODIFY = "https://www.googleapis.com/auth/gmail.modify"

# Requested on new OAuth connects (modify supersedes readonly for reading + labels).
GMAIL_SCOPES = [
    GMAIL_SCOPE_COMPOSE,
    GMAIL_SCOPE_SEND,
    GMAIL_SCOPE_MODIFY,
]

DEFAULT_SENT_SINCE = os.getenv("GMAIL_SENT_SINCE") or "2026-07-20"
GMAIL_CALLBACK_PATH = "/api/gmail/auth/callback"
GMAIL_DEFAULT_RETURN_PATH = "/placetrack"


def gmailCredentialsPath() -> Path:
    raw = os.getenv("GMAIL_CREDENTIALS_FILE") or str(ROOT_DIR / "client_secret.json")
    return Path(raw)


def gmailTokenPath() -> Path:
    raw = os.getenv("GMAIL_TOKEN_FILE") or str(GMAIL_DATA_DIR / "token.json")
    return Path(raw)


def gmailOAuthStatePath() -> Path:
    return gmailTokenPath().parent / "oauth_state.json"


def gmailSentRecipientsCachePath() -> Path:
    return gmailTokenPath().parent / "sent_recipients_cache.json"


def apiPort() -> int:
    return int((os.getenv("API_PORT") or "9260").strip())


def _publicSiteUrl() -> str | None:
    # Prefer the public site over GMAIL_OAUTH_BASE_URL so a leftover localhost
    # override cannot send production Google OAuth to 127.0.0.1.
    for key in ("SARAL_API_BASE_URL", "VITE_API_URL", "FRONTEND_URL", "GMAIL_OAUTH_BASE_URL"):
        value = (os.getenv(key) or "").strip().rstrip("/")
        if value:
            return value

    domain = (os.getenv("SARAL_DOMAIN") or "").strip()
    if domain:
        return f"https://{domain}"
    return None


def _hostName(hostHeader: str) -> str:
    host = hostHeader.strip().lower()
    if host.startswith("[") and "]" in host:
        return host[1 : host.index("]")]
    return host.split(":")[0]


def _allowedOauthHosts() -> set[str]:
    hosts = {"localhost", "127.0.0.1"}
    domain = (os.getenv("SARAL_DOMAIN") or "").strip().lower()
    if domain:
        hosts.add(domain)
    extra = (os.getenv("GMAIL_OAUTH_ALLOWED_HOSTS") or "").strip()
    for part in extra.split(","):
        name = _hostName(part)
        if name:
            hosts.add(name)
    return hosts


def gmailPublicOriginFromRequest(request: Any | None) -> str | None:
    if request is None:
        return None
    headers = getattr(request, "headers", None)
    if headers is None:
        return None

    forwardedHost = (headers.get("x-forwarded-host") or "").split(",")[0].strip()
    host = forwardedHost or (headers.get("host") or "").strip()
    if not host:
        return None

    hostname = _hostName(host)
    if hostname not in _allowedOauthHosts():
        return None

    proto = (headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    if proto not in ("http", "https"):
        domain = (os.getenv("SARAL_DOMAIN") or "").strip().lower()
        if hostname == domain:
            proto = "https"
        else:
            url = getattr(request, "url", None)
            proto = str(getattr(url, "scheme", "") or "http")

    if hostname in ("localhost", "127.0.0.1"):
        return f"{proto}://{host}".rstrip("/")
    return f"{proto}://{hostname}".rstrip("/")


def gmailOAuthBaseUrl(request: Any | None = None) -> str:
    origin = gmailPublicOriginFromRequest(request)
    if origin:
        return origin
    return (_publicSiteUrl() or f"http://localhost:{apiPort()}").rstrip("/")


def gmailFrontendUrl(request: Any | None = None) -> str:
    origin = gmailPublicOriginFromRequest(request)
    hostname = (urlparse(origin).hostname or "") if origin else ""
    if origin and hostname not in ("localhost", "127.0.0.1"):
        return origin
    explicit = (
        os.getenv("GMAIL_FRONTEND_URL")
        or os.getenv("FRONTEND_URL")
        or os.getenv("VITE_API_URL")
        or ""
    ).strip().rstrip("/")
    if explicit:
        return explicit
    return (_publicSiteUrl() or "http://localhost:5173").rstrip("/")


def gmailOAuthRedirectUri(request: Any | None = None) -> str:
    return f"{gmailOAuthBaseUrl(request)}{GMAIL_CALLBACK_PATH}"


def gmailOAuthReturnPath() -> str:
    raw = (os.getenv("GMAIL_OAUTH_RETURN_PATH") or GMAIL_DEFAULT_RETURN_PATH).strip()
    return raw if raw.startswith("/") else GMAIL_DEFAULT_RETURN_PATH


def defaultSenderName() -> str:
    return (os.getenv("GMAIL_DEFAULT_SENDER_NAME") or "Utsav Chaudhary").strip()
