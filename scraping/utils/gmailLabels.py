from __future__ import annotations

from utils.gmailAuth import getGmailService

# User labels used by inbox cleaning for job-application mail.
CLEAN_LABEL_ONESIDED = "oneSided"
CLEAN_LABEL_BAHARMIL = "BaharMil"
CLEAN_LABEL_JOBADS = "jobAds"
CLEAN_LABEL_PENDINGJOBS = "pendingJobs"
CLEAN_LABEL_SHOPPING = "shopping"
CLEAN_LABEL_FINTAX = "finTax"
CLEAN_LABEL_REPLYSPAM = "replySpam"
CLEAN_LABEL_TRASH = "Trash"
CLEAN_LABEL_CICD = "CICD"
CLEAN_LABEL_NAMES = (
    CLEAN_LABEL_ONESIDED,
    CLEAN_LABEL_BAHARMIL,
    CLEAN_LABEL_JOBADS,
    CLEAN_LABEL_PENDINGJOBS,
    CLEAN_LABEL_SHOPPING,
    CLEAN_LABEL_FINTAX,
    CLEAN_LABEL_REPLYSPAM,
    CLEAN_LABEL_TRASH,
    CLEAN_LABEL_CICD,
)
CLEAN_CATEGORIES = (
    "baharMil",
    "oneSided",
    "jobAds",
    "pendingJobs",
    "shopping",
    "finTax",
    "replySpam",
    "trash",
    "cicd",
)


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
    matches: list[dict] = []
    for label in labels:
        labelName = label.get("name")
        if isinstance(labelName, str) and _normalizeLabelName(labelName) == target:
            matches.append(label)
    if not matches:
        return None
    for label in matches:
        if (label.get("type") or "").lower() == "user":
            return label
    return matches[0]


def resolveCleanLabels(
    *,
    createMissing: bool = False,
    onlyNames: tuple[str, ...] | list[str] | None = None,
) -> dict[str, dict]:
    """
    Resolve inbox-clean label ids.
    Creates missing user labels only when createMissing=True (Submit / apply).
    Categorize must pass createMissing=False so Gmail labels are not created early.
    onlyNames limits create/resolve to labels actually being applied.
    """
    names = tuple(onlyNames) if onlyNames else CLEAN_LABEL_NAMES
    gmail = getGmailService(needModify=createMissing)
    listed = listGmailLabels()["labels"]
    resolved: dict[str, dict] = {}

    for name in names:
        if not name:
            continue
        existing = findLabelByName(listed, name)
        if existing and existing.get("id"):
            resolved[name] = {
                "id": existing["id"],
                "name": existing.get("name") or name,
                "created": False,
            }
            continue

        if not createMissing:
            continue

        try:
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
        except Exception:
            listed = listGmailLabels()["labels"]
            existing = findLabelByName(listed, name)
            if existing and existing.get("id"):
                resolved[name] = {
                    "id": existing["id"],
                    "name": existing.get("name") or name,
                    "created": False,
                }
                continue
            raise

        resolved[name] = {
            "id": created["id"],
            "name": created.get("name") or name,
            "created": True,
        }
        listed.append(created)

    return resolved
