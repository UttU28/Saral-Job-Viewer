from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import (
    get_all_jobs,
    get_all_keywords,
    add_keyword,
    remove_keyword,
    update_job_status,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class JobPostingModel(BaseModel):
    id: str
    link: str
    title: str
    companyName: str
    location: str
    method: str
    timeStamp: str
    jobType: str
    jobDescription: str
    applied: str

    class Config:
        from_attributes = True


class KeywordModel(BaseModel):
    id: int
    name: str
    type: str

    class Config:
        from_attributes = True


class AddKeywordRequest(BaseModel):
    name: str
    type: str


class RemoveKeywordRequest(BaseModel):
    id: int


class ApplyRequestModel(BaseModel):
    jobID: str
    applyMethod: str
    link: str


class RejectRequestModel(BaseModel):
    jobID: str


@app.get("/")
def helwld():
    return "Hello Duniya"


@app.get("/getData", response_model=list[JobPostingModel])
def getData():
    records = get_all_jobs()
    if not records:
        raise HTTPException(status_code=404, detail="No data found.")
    return records


@app.get("/getKeywords", response_model=list[KeywordModel])
def getKeywords():
    keywords = get_all_keywords()
    if not keywords:
        raise HTTPException(status_code=404, detail="No keywords found.")
    return keywords


@app.post("/addKeyword")
def addKeyword(request: AddKeywordRequest):
    new_keyword = add_keyword(request.name, request.type)
    if new_keyword:
        return {"message": "Keyword added successfully", "id": new_keyword.id}
    raise HTTPException(status_code=500, detail="Failed to add keyword")


@app.post("/removeKeyword")
def removeKeyword(request: RemoveKeywordRequest):
    keyword = remove_keyword(request.id)
    if keyword:
        return {"message": "Keyword removed successfully"}
    raise HTTPException(
        status_code=404, detail=f"No keyword found with ID {request.id}."
    )


@app.post("/applyThis")
def applyThis(request: ApplyRequestModel):
    job = update_job_status(request.jobID, "YES")
    if job:
        return {
            "message": "Application submitted successfully.",
            "jobID": request.jobID,
            "applyMethod": request.applyMethod,
            "link": request.link,
        }
    raise HTTPException(
        status_code=404, detail=f"No record found with ID {request.jobID}."
    )


@app.post("/rejectThis")
def rejectThis(request: RejectRequestModel):
    job = update_job_status(request.jobID, "NEVER")
    if job:
        return {"message": "Rejection recorded successfully.", "jobID": request.jobID}
    raise HTTPException(
        status_code=404, detail=f"No record found with ID {request.jobID}."
    )

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=5000)
