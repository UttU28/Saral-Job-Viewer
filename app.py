from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from utilsDatabase import (
    getAllJobs,
    getAllKeywords,
    addKeyword,
    getNotAppliedJobs,
    removeKeyword,
    updateJobStatus,
    addToEasyApply,
    getCountForAcceptDeny,
)

app = FastAPI()

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Models
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
    useBot: bool


class RejectRequestModel(BaseModel):
    jobID: str


class AddToEasyApplyRequest(BaseModel):
    jobID: int
    status: str


# API Endpoints
@app.get("/")
def helloWorld():
    """Welcome endpoint."""
    return {"message": "Hello Duniya"}


@app.get("/getData", response_model=list[JobPostingModel])
def getData():
    """Fetch all job postings."""
    # records = getAllJobs()
    records = getNotAppliedJobs()
    if not records:
        raise HTTPException(status_code=404, detail="No data found.")
    return records

@app.get("/getCountForAcceptDeny")
def countAcceptDeny():
    """
    Fetch the counts of accepted and rejected job applications.
    """
    try:
        counts = getCountForAcceptDeny()
        return {
            "message": "Counts fetched successfully.",
            "data": counts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching counts: {str(e)}")


@app.get("/getKeywords", response_model=list[KeywordModel])
def getKeywords():
    """Fetch all keywords."""
    keywords = getAllKeywords()
    if not keywords:
        raise HTTPException(status_code=404, detail="No keywords found.")
    return keywords


@app.post("/addKeyword")
def addKeywordEndpoint(request: AddKeywordRequest):
    """Add a new keyword."""
    newKeyword = addKeyword(request.name, request.type)
    if newKeyword:
        return {"message": "Keyword added successfully", "id": newKeyword.id}
    raise HTTPException(status_code=500, detail="Failed to add keyword.")


@app.post("/removeKeyword")
def removeKeywordEndpoint(request: RemoveKeywordRequest):
    """Remove a keyword."""
    keyword = removeKeyword(request.id)
    if keyword:
        return {"message": "Keyword removed successfully."}
    raise HTTPException(
        status_code=404, detail=f"No keyword found with ID {request.id}."
    )


@app.post("/applyThis")
def applyJob(request: ApplyRequestModel):
    """Mark a job as applied or add it to Easy Apply."""
    print(request.useBot)
    if request.useBot:
        # If useBot is True, add to Easy Apply
        easyApplyEntry = addToEasyApply(request.jobID, 'PENDING')
        if easyApplyEntry:
            return {
                "message": "Application added to Easy Apply successfully.",
                "jobID": request.jobID,
                "applyMethod": request.applyMethod,
                "link": request.link,
                "useBot": request.useBot,
                "entryID": easyApplyEntry.id,
            }
        raise HTTPException(status_code=500, detail="Failed to add to Easy Apply.")
    else:
        # If useBot is False, just update the job status to "YES"
        job = updateJobStatus(request.jobID, "YES")
        if job:
            return {
                "message": "Application submitted successfully.",
                "jobID": request.jobID,
                "applyMethod": request.applyMethod,
                "link": request.link,
                "useBot": request.useBot,
            }
        raise HTTPException(
            status_code=404, detail=f"No record found with ID {request.jobID}."
        )


@app.post("/rejectThis")
def rejectJob(request: RejectRequestModel):
    """Reject a job posting."""
    job = updateJobStatus(request.jobID, "NEVER")
    if job:
        return {"message": "Rejection recorded successfully.", "jobID": request.jobID}
    raise HTTPException(
        status_code=404, detail=f"No record found with ID {request.jobID}."
    )


# Run the application
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=5000)
