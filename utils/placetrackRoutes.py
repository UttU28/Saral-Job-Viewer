from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from utils.dataManager import MongoUnavailableError
from utils.placetrackStore import (
    clearPlaceTrackJwt,
    getMailTemplatesConfig,
    getPlaceTrackJwt,
    saveMailTemplatesConfig,
    savePlaceTrackJwt,
)

placetrackRouter = APIRouter(tags=["placetrack"])


class PlaceTrackJwtBody(BaseModel):
    token: str = Field(min_length=1)


@placetrackRouter.get("/api/placetrack/jwt")
def getPlaceTrackJwtRoute() -> dict:
    try:
        token = getPlaceTrackJwt()
    except MongoUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"saved": bool(token), "token": token}


@placetrackRouter.put("/api/placetrack/jwt")
def savePlaceTrackJwtRoute(body: PlaceTrackJwtBody) -> dict:
    try:
        savePlaceTrackJwt(body.token)
    except MongoUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"saved": True}


@placetrackRouter.delete("/api/placetrack/jwt")
def deletePlaceTrackJwtRoute() -> dict:
    try:
        clearPlaceTrackJwt()
    except MongoUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"saved": False}


@placetrackRouter.get("/api/placetrack/mail-templates")
def getMailTemplatesRoute() -> dict:
    try:
        return getMailTemplatesConfig(seedIfMissing=True)
    except MongoUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


class MailTemplateCategoryBody(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str | None = None
    sortOrder: int = 0


class MailTemplateBody(BaseModel):
    id: str = Field(min_length=1)
    categoryId: str = Field(min_length=1)
    name: str = Field(min_length=1)
    style: str = Field(min_length=1)
    description: str | None = None
    subject: str = Field(min_length=1)
    body: str = Field(min_length=1)
    sortOrder: int = 0
    isDefault: bool = False


class MailTemplatesConfigBody(BaseModel):
    categories: list[MailTemplateCategoryBody]
    templates: list[MailTemplateBody]
    defaultTemplateId: str = Field(min_length=1)


@placetrackRouter.put("/api/placetrack/mail-templates")
def saveMailTemplatesRoute(body: MailTemplatesConfigBody) -> dict:
    try:
        return saveMailTemplatesConfig(body.model_dump())
    except MongoUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
