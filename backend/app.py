from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from utils.utilsDatabase import (
    getAllJobs,
    getAllKeywords,
    getHoursOfData,
    addKeyword,
    getNotAppliedJobs,
    removeKeyword,
    updateJobStatus,
    getCountForAcceptDeny,
)
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

# Get database configuration
dbType = os.getenv("DB_TYPE", "sqlite")
print(f"Using database type: {dbType}")

app = FastAPI()

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
    aiTags: Optional[str] = None
    aiProcessed: bool = False

    class Config:
        from_attributes = True

class KeywordModel(BaseModel):
    id: int
    name: str
    type: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class AddKeywordRequest(BaseModel):
    name: str
    type: str

class RemoveKeywordRequest(BaseModel):
    id: int

class HoursRequest(BaseModel):
    hours: int

class JobStatusRequest(BaseModel):
    jobID: str
    status: str

# API Endpoints
@app.get("/")
def helloWorld():
    """Welcome endpoint."""
    return {
        "message": "Job Viewer Web API",
        "databaseType": dbType
    }

@app.get("/getData", response_model=List[JobPostingModel])
def getData():
    """Fetch LinkedIn job postings."""
    records = getNotAppliedJobs()
    if not records:
        raise HTTPException(status_code=404, detail="No LinkedIn jobs found.")
    return records


@app.get("/getKeywords", response_model=List[KeywordModel])
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

@app.get("/getAllJobs", response_model=List[JobPostingModel])
def getAllJobsEndpoint():
    """Fetch all LinkedIn job postings."""
    records = getAllJobs()
    if not records:
        raise HTTPException(status_code=404, detail="No jobs found.")
    return records

@app.post("/getHoursOfData", response_model=List[JobPostingModel])
def getHoursOfDataEndpoint(request: HoursRequest):
    """Fetch job postings from the last specified hours."""
    try:
        timedRecords = getHoursOfData(request.hours)
        if not timedRecords:
            raise HTTPException(status_code=404, detail="No job postings found for the given hours.")
        return timedRecords
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching data: {str(e)}")

@app.get("/getCountForAcceptDeny")
def getCountForAcceptDenyEndpoint():
    """Fetch the counts of accepted and rejected job applications."""
    try:
        counts = getCountForAcceptDeny()
        return {
            "message": "Counts fetched successfully.",
            "data": counts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching counts: {str(e)}")

@app.post("/updateJobStatus")
def updateJobStatusEndpoint(request: JobStatusRequest):
    """Update job status (YES, NO, NEVER)."""
    job = updateJobStatus(request.jobID, request.status)
    if job:
        return {"message": "Job status updated successfully.", "jobID": request.jobID, "status": request.status}
    raise HTTPException(
        status_code=404, detail=f"No job found with ID {request.jobID}."
    )

# Run the application
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3011)