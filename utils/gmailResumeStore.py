from __future__ import annotations

from utils.gmailConfig import GMAIL_UPLOADS_DIR, defaultSenderName
from utils.gmailService import AttachmentInput
from utils.placetrackStore import (
    deleteResumeFromStore,
    getResumeMeta,
    getResumePdfBytes,
    saveResumeToStore,
)

RESUME_META_FILE = GMAIL_UPLOADS_DIR / "resume_meta.json"
RESUME_FILE = GMAIL_UPLOADS_DIR / "resume.pdf"


def _attachmentFilename() -> str:
    return f"{defaultSenderName()} Resume.pdf"


def getResumeInfo() -> dict:
    meta = getResumeMeta()
    pdfBytes = getResumePdfBytes()
    if not meta or not pdfBytes:
        return {
            "saved": False,
            "filename": None,
            "path": None,
            "originalName": None,
        }

    return {
        "saved": True,
        "filename": meta.get("attachmentName") or _attachmentFilename(),
        "path": str(RESUME_FILE),
        "originalName": meta.get("originalName"),
        "savedAt": meta.get("savedAt"),
    }


def saveResume(data: bytes, originalName: str, contentType: str) -> dict:
    saveResumeToStore(data, originalName=originalName, contentType=contentType)
    return getResumeInfo()


def deleteResume() -> None:
    deleteResumeFromStore()


def loadResumeAttachment() -> AttachmentInput | None:
    meta = getResumeMeta()
    pdfBytes = getResumePdfBytes()
    if not pdfBytes:
        return None

    contentType = "application/pdf"
    if isinstance(meta, dict):
        contentType = meta.get("contentType") or contentType

    return AttachmentInput(
        filename=_attachmentFilename(),
        contentType=contentType,
        data=pdfBytes,
    )
