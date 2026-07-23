from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from bson.binary import Binary

from utils.dataManager import MongoUnavailableError, createTables, getMongoDb

PLACETRACK_WORKSPACE_COLLECTION = "placetrackWorkspace"
PLACETRACK_WORKSPACE_DOCUMENT_ID = "default"

_indexesEnsured = False


def _utcNowIso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def ensurePlacetrackWorkspace(*, recreate: bool = False) -> None:
    global _indexesEnsured
    createTables(recreate=recreate)
    if _indexesEnsured and not recreate:
        return
    try:
        db = getMongoDb()
        if recreate:
            names = set(db.list_collection_names())
            if PLACETRACK_WORKSPACE_COLLECTION in names:
                db[PLACETRACK_WORKSPACE_COLLECTION].drop()
        _indexesEnsured = True
    except MongoUnavailableError:
        _indexesEnsured = False
        raise


def _collection():
    ensurePlacetrackWorkspace()
    return getMongoDb()[PLACETRACK_WORKSPACE_COLLECTION]


def _getWorkspaceDoc() -> dict[str, Any]:
    doc = _collection().find_one({"_id": PLACETRACK_WORKSPACE_DOCUMENT_ID})
    return doc if isinstance(doc, dict) else {}


def _patchWorkspace(fields: dict[str, Any]) -> None:
    payload = dict(fields)
    payload["updatedAt"] = _utcNowIso()
    _collection().update_one(
        {"_id": PLACETRACK_WORKSPACE_DOCUMENT_ID},
        {"$set": payload, "$setOnInsert": {"createdAt": _utcNowIso()}},
        upsert=True,
    )


def _normalizeSentRecipientsCache(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    recipients = raw.get("recipients")
    if not isinstance(recipients, list):
        return None
    return {
        "since": raw.get("since") or raw.get("Since"),
        "fetchedAt": raw.get("fetchedAt") or raw.get("fetched_at"),
        "messageCount": raw.get("messageCount") if raw.get("messageCount") is not None else raw.get("message_count"),
        "recipientCount": raw.get("recipientCount")
        if raw.get("recipientCount") is not None
        else raw.get("recipient_count"),
        "recipients": sorted(str(item).strip().lower() for item in recipients if str(item).strip()),
    }


def getPlaceTrackJwt() -> str | None:
    try:
        token = _getWorkspaceDoc().get("placeTrackJwt")
    except MongoUnavailableError:
        return None
    if not isinstance(token, str):
        return None
    trimmed = token.strip()
    return trimmed or None


def savePlaceTrackJwt(token: str) -> None:
    trimmed = token.strip()
    if not trimmed:
        raise ValueError("PlaceTrack JWT cannot be empty.")
    _patchWorkspace(
        {
            "placeTrackJwt": trimmed,
            "placeTrackJwtUpdatedAt": _utcNowIso(),
        }
    )


def clearPlaceTrackJwt() -> None:
    _patchWorkspace({"placeTrackJwt": None, "placeTrackJwtUpdatedAt": _utcNowIso()})


def loadGmailTokenDict() -> dict[str, Any] | None:
    try:
        raw = _getWorkspaceDoc().get("gmailToken")
    except MongoUnavailableError:
        return _loadGmailTokenDictFromFile()
    if isinstance(raw, dict) and raw.get("token"):
        return raw
    return _loadGmailTokenDictFromFile()


def saveGmailTokenDict(token: dict[str, Any]) -> None:
    _patchWorkspace({"gmailToken": token})


def saveGmailTokenJson(tokenJson: str) -> None:
    data = json.loads(tokenJson)
    if not isinstance(data, dict):
        raise ValueError("Gmail token must be a JSON object.")
    saveGmailTokenDict(data)


def clearGmailToken() -> None:
    _patchWorkspace({"gmailToken": None})
    tokenPath = _gmailTokenFilePath()
    if tokenPath.is_file():
        tokenPath.unlink()


def _gmailTokenFilePath() -> Path:
    from utils.gmailConfig import gmailTokenPath

    return gmailTokenPath()


def _loadGmailTokenDictFromFile() -> dict[str, Any] | None:
    path = _gmailTokenFilePath()
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def loadGmailOAuthSession() -> dict[str, Any] | None:
    try:
        raw = _getWorkspaceDoc().get("gmailOAuthState")
    except MongoUnavailableError:
        return _loadGmailOAuthSessionFromFile()
    return raw if isinstance(raw, dict) else _loadGmailOAuthSessionFromFile()


def saveGmailOAuthSession(state: str, codeVerifier: str | None, returnTo: str = "/") -> None:
    payload = {"state": state, "codeVerifier": codeVerifier, "returnTo": returnTo}
    _patchWorkspace({"gmailOAuthState": payload})
    path = _gmailOAuthStateFilePath()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def clearGmailOAuthSession() -> None:
    _patchWorkspace({"gmailOAuthState": None})
    path = _gmailOAuthStateFilePath()
    if path.is_file():
        path.unlink()


def _gmailOAuthStateFilePath() -> Path:
    from utils.gmailConfig import gmailOAuthStatePath

    return gmailOAuthStatePath()


def _loadGmailOAuthSessionFromFile() -> dict[str, Any] | None:
    path = _gmailOAuthStateFilePath()
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def loadSentRecipientsCache() -> dict[str, Any] | None:
    try:
        raw = _getWorkspaceDoc().get("gmailSentRecipientsCache")
    except MongoUnavailableError:
        return _loadSentRecipientsCacheFromFile()
    normalized = _normalizeSentRecipientsCache(raw if isinstance(raw, dict) else None)
    if normalized:
        return normalized
    return _loadSentRecipientsCacheFromFile()


def saveSentRecipientsCache(payload: dict[str, Any]) -> None:
    normalized = _normalizeSentRecipientsCache(payload)
    if not normalized:
        raise ValueError("Invalid sent recipients cache payload.")
    _patchWorkspace({"gmailSentRecipientsCache": normalized})


def _sentRecipientsCacheFilePath() -> Path:
    from utils.gmailConfig import gmailSentRecipientsCachePath

    return gmailSentRecipientsCachePath()


def _loadSentRecipientsCacheFromFile() -> dict[str, Any] | None:
    path = _sentRecipientsCacheFilePath()
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return _normalizeSentRecipientsCache(raw if isinstance(raw, dict) else None)


def getResumeMeta() -> dict[str, Any] | None:
    try:
        raw = _getWorkspaceDoc().get("gmailResumeMeta")
    except MongoUnavailableError:
        return _loadResumeMetaFromFile()
    if isinstance(raw, dict) and (raw.get("attachmentName") or raw.get("attachment_name")):
        return {
            "originalName": raw.get("originalName") or raw.get("original_name"),
            "attachmentName": raw.get("attachmentName") or raw.get("attachment_name"),
            "contentType": raw.get("contentType") or raw.get("content_type") or "application/pdf",
            "savedAt": raw.get("savedAt") or raw.get("saved_at"),
        }
    fileMeta = _loadResumeMetaFromFile()
    return fileMeta


def getResumePdfBytes() -> bytes | None:
    try:
        raw = _getWorkspaceDoc().get("gmailResumePdf")
    except MongoUnavailableError:
        return _loadResumePdfFromFile()
    if isinstance(raw, Binary):
        return bytes(raw)
    if isinstance(raw, (bytes, bytearray)):
        return bytes(raw)
    return _loadResumePdfFromFile()


def saveResumeToStore(data: bytes, *, originalName: str, contentType: str) -> dict[str, Any]:
    from utils.gmailConfig import defaultSenderName

    attachmentName = f"{defaultSenderName()} Resume.pdf"
    meta = {
        "originalName": originalName,
        "attachmentName": attachmentName,
        "contentType": contentType or "application/pdf",
        "savedAt": _utcNowIso(),
    }
    _patchWorkspace(
        {
            "gmailResumeMeta": meta,
            "gmailResumePdf": Binary(data),
        }
    )
    return meta


def deleteResumeFromStore() -> None:
    _patchWorkspace({"gmailResumeMeta": None, "gmailResumePdf": None})
    uploadsDir = _gmailUploadsDir()
    for name in ("resume.pdf", "resume_meta.json"):
        path = uploadsDir / name
        if path.is_file():
            path.unlink()


def _gmailUploadsDir() -> Path:
    from utils.gmailConfig import GMAIL_UPLOADS_DIR

    return GMAIL_UPLOADS_DIR


def _loadResumeMetaFromFile() -> dict[str, Any] | None:
    path = _gmailUploadsDir() / "resume_meta.json"
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict):
        return None
    return {
        "originalName": raw.get("originalName") or raw.get("original_name"),
        "attachmentName": raw.get("attachmentName") or raw.get("attachment_name"),
        "contentType": raw.get("contentType") or raw.get("content_type") or "application/pdf",
        "savedAt": raw.get("savedAt") or raw.get("saved_at"),
    }


def _loadResumePdfFromFile() -> bytes | None:
    path = _gmailUploadsDir() / "resume.pdf"
    if not path.is_file():
        return None
    try:
        return path.read_bytes()
    except OSError:
        return None


def _normalizeMailTemplateCategory(raw: dict[str, Any]) -> dict[str, Any] | None:
    categoryId = raw.get("id")
    name = raw.get("name")
    if not isinstance(categoryId, str) or not categoryId.strip():
        return None
    if not isinstance(name, str) or not name.strip():
        return None
    return {
        "id": categoryId.strip(),
        "name": name.strip(),
        "description": raw.get("description") if isinstance(raw.get("description"), str) else None,
        "sortOrder": int(raw.get("sortOrder") if raw.get("sortOrder") is not None else raw.get("sort_order") or 0),
    }


def _normalizeMailTemplate(raw: dict[str, Any]) -> dict[str, Any] | None:
    templateId = raw.get("id")
    categoryId = raw.get("categoryId") or raw.get("category_id")
    name = raw.get("name")
    subject = raw.get("subject")
    body = raw.get("body")
    if not all(isinstance(value, str) and value.strip() for value in (templateId, categoryId, name, subject, body)):
        return None
    style = raw.get("style")
    if not isinstance(style, str) or not style.strip():
        style = templateId
    return {
        "id": templateId.strip(),
        "categoryId": categoryId.strip(),
        "name": name.strip(),
        "style": style.strip(),
        "description": raw.get("description") if isinstance(raw.get("description"), str) else None,
        "subject": subject.strip(),
        "body": body,
        "sortOrder": int(raw.get("sortOrder") if raw.get("sortOrder") is not None else raw.get("sort_order") or 0),
        "isDefault": bool(raw.get("isDefault") if raw.get("isDefault") is not None else raw.get("is_default")),
    }


def _normalizeMailTemplatesConfig(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    categoriesRaw = raw.get("categories")
    templatesRaw = raw.get("templates")
    if not isinstance(categoriesRaw, list) or not isinstance(templatesRaw, list):
        return None

    categories = [
        normalized
        for item in categoriesRaw
        if isinstance(item, dict) and (normalized := _normalizeMailTemplateCategory(item))
    ]
    templates = [
        normalized
        for item in templatesRaw
        if isinstance(item, dict) and (normalized := _normalizeMailTemplate(item))
    ]
    if not categories or not templates:
        return None

    defaultTemplateId = raw.get("defaultTemplateId") or raw.get("default_template_id")
    if not isinstance(defaultTemplateId, str) or not defaultTemplateId.strip():
        defaultTemplate = next((item for item in templates if item.get("isDefault")), templates[0])
        defaultTemplateId = defaultTemplate["id"]
    elif not any(item["id"] == defaultTemplateId for item in templates):
        defaultTemplateId = templates[0]["id"]

    categories.sort(key=lambda item: (item["sortOrder"], item["name"]))
    templates.sort(key=lambda item: (item["sortOrder"], item["name"]))

    return {
        "categories": categories,
        "templates": templates,
        "defaultTemplateId": defaultTemplateId.strip(),
    }


def getDefaultMailTemplatesConfig() -> dict[str, Any]:
    from utils.mailTemplatesDefaults import DEFAULT_MAIL_TEMPLATES_CONFIG

    normalized = _normalizeMailTemplatesConfig(DEFAULT_MAIL_TEMPLATES_CONFIG)
    if not normalized:
        raise ValueError("Built-in mail templates are invalid.")
    return normalized


def getMailTemplatesConfig(*, seedIfMissing: bool = True) -> dict[str, Any]:
    try:
        raw = _getWorkspaceDoc().get("gmailMailTemplates")
    except MongoUnavailableError:
        return getDefaultMailTemplatesConfig()

    normalized = _normalizeMailTemplatesConfig(raw if isinstance(raw, dict) else None)
    if normalized:
        return normalized
    if seedIfMissing:
        defaults = getDefaultMailTemplatesConfig()
        saveMailTemplatesConfig(defaults)
        return defaults
    return getDefaultMailTemplatesConfig()


def saveMailTemplatesConfig(config: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalizeMailTemplatesConfig(config)
    if not normalized:
        raise ValueError("Invalid mail templates configuration.")
    _patchWorkspace({"gmailMailTemplates": normalized})
    return normalized


def importLocalJsonData(
    *,
    jwt: str | None = None,
    tokenFile: Path | None = None,
    sentCacheFile: Path | None = None,
    resumeMetaFile: Path | None = None,
    resumePdfFile: Path | None = None,
    mailTemplatesFile: Path | None = None,
    seedMailTemplates: bool = True,
) -> dict[str, Any]:
    """Merge local JSON/file data into placetrackWorkspace (upsert fields only when present)."""
    ensurePlacetrackWorkspace()
    imported: dict[str, Any] = {"fields": []}

    if jwt and jwt.strip():
        savePlaceTrackJwt(jwt.strip())
        imported["fields"].append("placeTrackJwt")

    tokenPath = tokenFile or _gmailTokenFilePath()
    if tokenPath.is_file():
        saveGmailTokenJson(tokenPath.read_text(encoding="utf-8"))
        imported["fields"].append("gmailToken")

    cachePath = sentCacheFile or _sentRecipientsCacheFilePath()
    if cachePath.is_file():
        raw = json.loads(cachePath.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            saveSentRecipientsCache(raw)
            imported["fields"].append("gmailSentRecipientsCache")

    metaPath = resumeMetaFile or (_gmailUploadsDir() / "resume_meta.json")
    pdfPath = resumePdfFile or (_gmailUploadsDir() / "resume.pdf")
    if pdfPath.is_file():
        meta: dict[str, Any] = {}
        if metaPath.is_file():
            try:
                loaded = json.loads(metaPath.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    meta = loaded
            except (OSError, json.JSONDecodeError):
                pass
        originalName = meta.get("originalName") or meta.get("original_name") or pdfPath.name
        contentType = meta.get("contentType") or meta.get("content_type") or "application/pdf"
        saveResumeToStore(pdfPath.read_bytes(), originalName=str(originalName), contentType=str(contentType))
        imported["fields"].append("gmailResume")

    templatesPath = mailTemplatesFile
    if templatesPath and templatesPath.is_file():
        try:
            raw = json.loads(templatesPath.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raw = None
        if isinstance(raw, list):
            categoryId = "vendor-outreach"
            templates = []
            for index, item in enumerate(raw):
                if not isinstance(item, dict):
                    continue
                templateId = str(item.get("id") or "").strip()
                if not templateId:
                    continue
                templates.append(
                    {
                        "id": templateId,
                        "categoryId": categoryId,
                        "name": str(item.get("name") or templateId),
                        "style": templateId,
                        "description": None,
                        "subject": str(item.get("subject") or ""),
                        "body": str(item.get("body") or ""),
                        "sortOrder": index,
                        "isDefault": index == 0,
                    }
                )
            config = {
                "categories": [
                    {
                        "id": categoryId,
                        "name": "Vendor Outreach",
                        "description": "Initial outreach to vendors and recruiters",
                        "sortOrder": 0,
                    }
                ],
                "templates": templates,
                "defaultTemplateId": templates[0]["id"] if templates else "classic",
            }
            saveMailTemplatesConfig(config)
            imported["fields"].append("gmailMailTemplates")
        elif isinstance(raw, dict):
            saveMailTemplatesConfig(raw)
            imported["fields"].append("gmailMailTemplates")
    elif seedMailTemplates:
        existing = _getWorkspaceDoc().get("gmailMailTemplates")
        if not _normalizeMailTemplatesConfig(existing if isinstance(existing, dict) else None):
            saveMailTemplatesConfig(getDefaultMailTemplatesConfig())
            imported["fields"].append("gmailMailTemplates")

    imported["documentId"] = PLACETRACK_WORKSPACE_DOCUMENT_ID
    imported["collection"] = PLACETRACK_WORKSPACE_COLLECTION
    return imported
