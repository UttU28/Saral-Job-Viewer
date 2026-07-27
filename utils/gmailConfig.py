from __future__ import annotations

import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
GMAIL_DATA_DIR = ROOT_DIR / "data" / "gmail"
GMAIL_UPLOADS_DIR = Path(
    os.getenv("GMAIL_UPLOADS_DIR") or str(GMAIL_DATA_DIR / "uploads"),
)

GMAIL_DATA_DIR.mkdir(parents=True, exist_ok=True)
GMAIL_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
]

DEFAULT_SENT_SINCE = os.getenv("GMAIL_SENT_SINCE") or "2026-07-20"
GMAIL_CALLBACK_PATH = "/api/gmail/auth/callback"


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


def gmailOAuthBaseUrl() -> str:
    base = (
        os.getenv("GMAIL_OAUTH_BASE_URL")
        or os.getenv("SARAL_API_BASE_URL")
        or f"http://localhost:{apiPort()}"
    )
    return base.rstrip("/")


def gmailFrontendUrl() -> str:
    return (
        os.getenv("GMAIL_FRONTEND_URL")
        or os.getenv("FRONTEND_URL")
        or "http://localhost:5173"
    ).rstrip("/")


def gmailOAuthRedirectUri() -> str:
    return f"{gmailOAuthBaseUrl()}{GMAIL_CALLBACK_PATH}"


def defaultSenderName() -> str:
    return (os.getenv("GMAIL_DEFAULT_SENDER_NAME") or "Utsav Chaudhary").strip()
