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
    # Backfill missing admin flag for older users.
    users.update_many({"isAdmin": {"$exists": False}}, {"$set": {"isAdmin": False}})
    # Backfill profile photo URL for older users.
    for row in users.find(
        {"$or": [{"profilePhotoUrl": {"$exists": False}}, {"profilePhotoUrl": ""}]},
        {"_id": 1, "userId": 1, "email": 1},
    ):
        seed = _profilePhotoSeed(
            userId=str(row.get("userId") or ""),
            email=str(row.get("email") or ""),
        )
        users.update_one(
            {"_id": row["_id"]},
            {"$set": {"profilePhotoUrl": _buildProfilePhotoUrl(seed=seed)}},
        )


def _normalizeEmail(email: str) -> str:
    return str(email or "").strip().lower()


def _buildProfilePhotoUrl(*, seed: str) -> str:
    cleanSeed = str(seed or "").strip() or "default"
    return f"https://api.dicebear.com/7.x/bottts/svg?seed={cleanSeed}"


def _profilePhotoSeed(*, userId: str, email: str) -> str:
    return str(userId or "").strip() or _normalizeEmail(email) or "default"


def _sanitizeUserDoc(userDoc: dict[str, Any]) -> dict[str, Any]:
    return {
        "userId": str(userDoc.get("userId") or ""),
        "name": str(userDoc.get("name") or ""),
        "email": str(userDoc.get("email") or ""),
        "isAdmin": bool(userDoc.get("isAdmin")),
        "profilePhotoUrl": str(userDoc.get("profilePhotoUrl") or ""),
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
            "isAdmin": False,
            "profilePhotoUrl": _buildProfilePhotoUrl(seed=_profilePhotoSeed(userId=userId, email=cleanEmail)),
            "createdAt": _utcNowIso(),
            "updatedAt": _utcNowIso(),
        }
    )
    return {
        "userId": userId,
        "name": cleanName,
        "email": cleanEmail,
        "isAdmin": False,
        "profilePhotoUrl": _buildProfilePhotoUrl(seed=_profilePhotoSeed(userId=userId, email=cleanEmail)),
    }


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


def createUserSessionToken(user: dict[str, Any]) -> str:
    return createJwtToken(
        {
            "sub": user["userId"],
            "email": user["email"],
            "name": user["name"],
            "isAdmin": bool(user.get("isAdmin")),
            "profilePhotoUrl": str(user.get("profilePhotoUrl") or ""),
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


def requireAdminUser(*, user: dict[str, Any]) -> None:
    if not bool(user.get("isAdmin")):
        raise ValueError("Admin access required")


def listAllUsersForAdmin() -> dict[str, Any]:
    ensureUserIndexes()
    usersCollection = getMongoDb()[USER_COLLECTION]
    cursor = usersCollection.find(
        {},
        {
            "_id": 0,
            "userId": 1,
            "name": 1,
            "email": 1,
            "isAdmin": 1,
            "profilePhotoUrl": 1,
            "createdAt": 1,
            "updatedAt": 1,
        },
    ).sort([("createdAt", -1), ("email", 1)])

    users = []
    for row in cursor:
        users.append(
            {
                "userId": str(row.get("userId") or ""),
                "name": str(row.get("name") or ""),
                "email": str(row.get("email") or ""),
                "isAdmin": bool(row.get("isAdmin")),
                "profilePhotoUrl": str(row.get("profilePhotoUrl") or ""),
                "createdAt": str(row.get("createdAt") or ""),
                "updatedAt": str(row.get("updatedAt") or ""),
            }
        )

    totalUsers = len(users)
    adminUsers = sum(1 for row in users if row.get("isAdmin"))
    return {
        "users": users,
        "summary": {
            "totalUsers": totalUsers,
            "adminUsers": adminUsers,
            "nonAdminUsers": totalUsers - adminUsers,
        },
    }


def setUserAdminStatus(*, targetUserId: str, isAdmin: bool) -> None:
    cleanUserId = str(targetUserId or "").strip()
    if not cleanUserId:
        raise ValueError("Target user is required")

    ensureUserIndexes()
    usersCollection = getMongoDb()[USER_COLLECTION]
    result = usersCollection.update_one(
        {"userId": cleanUserId},
        {
            "$set": {
                "isAdmin": bool(isAdmin),
                "updatedAt": _utcNowIso(),
            }
        },
    )
    if result.matched_count == 0:
        raise ValueError("User not found")


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
