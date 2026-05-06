from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from utils.dataManager import getMongoDb
from utils.jwtAuth import createJwtToken, verifyJwtToken

USER_COLLECTION = "users"


def _utcNowIso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def ensureUserIndexes() -> None:
    users = getMongoDb()[USER_COLLECTION]
    users.create_index("email", unique=True)


def _normalizeEmail(email: str) -> str:
    return str(email or "").strip().lower()


def _sanitizeUserDoc(userDoc: dict[str, Any]) -> dict[str, str]:
    return {
        "userId": str(userDoc.get("userId") or ""),
        "name": str(userDoc.get("name") or ""),
        "email": str(userDoc.get("email") or ""),
    }


def registerUser(*, name: str, email: str, password: str) -> dict[str, str]:
    cleanName = str(name or "").strip()
    cleanEmail = _normalizeEmail(email)
    cleanPassword = str(password or "")
    if not cleanName:
        raise ValueError("Name is required")
    if not cleanEmail:
        raise ValueError("Email is required")
    if "@" not in cleanEmail:
        raise ValueError("Email looks invalid")
    if not cleanPassword:
        raise ValueError("Password is required")

    ensureUserIndexes()
    users = getMongoDb()[USER_COLLECTION]
    existing = users.find_one({"email": cleanEmail}, {"_id": 1})
    if existing:
        raise ValueError("Email already registered")

    userId = f"user_{cleanEmail}"
    users.insert_one(
        {
            "userId": userId,
            "name": cleanName,
            "email": cleanEmail,
            "password": cleanPassword,
            "createdAt": _utcNowIso(),
            "updatedAt": _utcNowIso(),
        }
    )
    return {"userId": userId, "name": cleanName, "email": cleanEmail}


def loginUser(*, email: str, password: str) -> dict[str, str]:
    cleanEmail = _normalizeEmail(email)
    cleanPassword = str(password or "")
    if not cleanEmail or not cleanPassword:
        raise ValueError("Email and password are required")

    ensureUserIndexes()
    users = getMongoDb()[USER_COLLECTION]
    userDoc = users.find_one({"email": cleanEmail})
    if not userDoc:
        raise ValueError("Invalid email or password")
    if str(userDoc.get("password") or "") != cleanPassword:
        raise ValueError("Invalid email or password")
    return _sanitizeUserDoc(userDoc)


def createUserSessionToken(user: dict[str, str]) -> str:
    return createJwtToken(
        {
            "sub": user["userId"],
            "email": user["email"],
            "name": user["name"],
        }
    )


def getUserFromToken(token: str) -> dict[str, str]:
    payload = verifyJwtToken(token)
    userId = str(payload.get("sub") or "").strip()
    email = _normalizeEmail(str(payload.get("email") or ""))
    if not userId or not email:
        raise ValueError("Invalid token payload")

    ensureUserIndexes()
    users = getMongoDb()[USER_COLLECTION]
    userDoc = users.find_one({"userId": userId, "email": email})
    if not userDoc:
        raise ValueError("User no longer exists")
    return _sanitizeUserDoc(userDoc)


def changeUserPassword(*, userId: str, currentPassword: str, newPassword: str) -> None:
    cleanUserId = str(userId or "").strip()
    existingPassword = str(currentPassword or "")
    nextPassword = str(newPassword or "")
    if not cleanUserId:
        raise ValueError("User not found")
    if not existingPassword:
        raise ValueError("Current password is required")
    if not nextPassword:
        raise ValueError("New password is required")

    ensureUserIndexes()
    users = getMongoDb()[USER_COLLECTION]
    userDoc = users.find_one({"userId": cleanUserId})
    if not userDoc:
        raise ValueError("User not found")
    if str(userDoc.get("password") or "") != existingPassword:
        raise ValueError("Current password is incorrect")

    users.update_one(
        {"userId": cleanUserId},
        {
            "$set": {
                "password": nextPassword,
                "updatedAt": _utcNowIso(),
            }
        },
    )
