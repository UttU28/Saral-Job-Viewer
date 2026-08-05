from __future__ import annotations

from utils.gmailAuth import getGmailService

# User labels used by inbox cleaning for job-application mail.
CLEAN_LABEL_ONESIDED = "oneSided"
CLEAN_LABEL_BAHARMIL = "BaharMil"
CLEAN_LABEL_JOBADS = "jobAds"
CLEAN_LABEL_NAMES = (CLEAN_LABEL_ONESIDED, CLEAN_LABEL_BAHARMIL, CLEAN_LABEL_JOBADS)


def listGmailLabels() -> dict:
    gmail = getGmailService()
    response = gmail.users().labels().list(userId="me").execute()
    labels = []
    for item in response.get("labels") or []:
        labels.append(
            {
                "id": item.get("id"),
                "name": item.get("name"),
                "type": item.get("type"),
                "messageListVisibility": item.get("messageListVisibility"),
                "labelListVisibility": item.get("labelListVisibility"),
            }
        )
    labels.sort(key=lambda row: ((row.get("type") or ""), (row.get("name") or "").lower()))
    return {
        "count": len(labels),
        "labels": labels,
    }


def _normalizeLabelName(name: str) -> str:
    return "".join(ch for ch in name.strip().lower() if ch.isalnum())


def findLabelByName(labels: list[dict], name: str) -> dict | None:
    target = _normalizeLabelName(name)
    if not target:
        return None
    for label in labels:
        labelName = label.get("name")
        if isinstance(labelName, str) and _normalizeLabelName(labelName) == target:
            return label
    return None


def resolveCleanLabels(*, createMissing: bool = True) -> dict[str, dict]:
    """
    Resolve BaharMil / oneSided / jobAds label ids. Creates missing user labels when allowed.
    Returns map of canonical name -> {id, name, created}.
    """
    gmail = getGmailService()
    listed = listGmailLabels()["labels"]
    resolved: dict[str, dict] = {}

    for name in CLEAN_LABEL_NAMES:
        existing = findLabelByName(listed, name)
        if existing and existing.get("id"):
            resolved[name] = {
                "id": existing["id"],
                "name": existing.get("name") or name,
                "created": False,
            }
            continue

        if not createMissing:
            raise RuntimeError(f"Gmail label {name!r} not found. Create it in Gmail first.")

        created = (
            gmail.users()
            .labels()
            .create(
                userId="me",
                body={
                    "name": name,
                    "labelListVisibility": "labelShow",
                    "messageListVisibility": "show",
                },
            )
            .execute()
        )
        resolved[name] = {
            "id": created["id"],
            "name": created.get("name") or name,
            "created": True,
        }
        listed.append(created)

    return resolved
