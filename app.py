from fastapi import FastAPI, HTTPException, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from utils.utilsDatabase import (
    getAllJobs,
    getAllKeywords,
    getHoursOfData,
    addKeyword,
    getNotAppliedJobs,
    removeKeyword,
    updateJobStatus,
    addToEasyApply,
    getCountForAcceptDeny,
    getNotAppliedDiceJobs,
    getHoursOfDiceData,
    getCountForDiceAcceptDeny,
    getAllDiceKeywords,
    addDiceKeyword,
    removeDiceKeyword,
    updateDiceJobStatus,
)
import os
import subprocess
import socket
import json
from dotenv import load_dotenv
from datetime import datetime
load_dotenv()

# Get database configuration
dbType = os.getenv("DB_TYPE", "sqlite")
print(f"Using database type: {dbType}")

questionsFilePath = os.getenv('QUESTIONS_JSON')


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
    created_at: datetime | None = None

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

class HoursRequest(BaseModel):
    hours: int

class LinkedInQuestion(BaseModel):
    question: str
    type: str
    required: bool
    options: list[str] | None
    currentAnswer: str | list[str] | None
    verified: bool

class UpdateLinkedInQuestionsRequest(BaseModel):
    questions: list[LinkedInQuestion]

# Route to switch database
@app.get("/switchDb/{db_type}")
def switchDatabase(db_type: str = Path(..., pattern="^(mysql|sqlite)$")):
    """
    Switch the database type between MySQL and SQLite.
    This only updates the environment variable, you need to restart the application for changes to take effect.
    """
    try:
        # Update the .env file
        envPath = os.path.join(os.getcwd(), '.env')
        with open(envPath, 'r') as file:
            lines = file.readlines()
        
        updatedLines = []
        for line in lines:
            if line.startswith('DB_TYPE='):
                updatedLines.append(f'DB_TYPE={db_type.lower()}\n')
            else:
                updatedLines.append(line)
        
        with open(envPath, 'w') as file:
            file.writelines(updatedLines)
        
        return {
            "success": True,
            "message": f"Database type switched to {db_type}. Restart the application for changes to take effect.",
            "currentDbType": db_type
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to switch database type: {str(e)}"
        )

# API Endpoints
@app.get("/")
def helloWorld():
    """Welcome endpoint."""
    return {
        "message": "Hello Duniya",
        "databaseType": dbType
    }


@app.get("/getData", response_model=list[JobPostingModel])
def getData():
    """Fetch all job postings."""
    # records = getAllJobs()
    records = getNotAppliedJobs()
    if not records:
        raise HTTPException(status_code=404, detail="No data found.")
    return records

@app.get("/getDiceData", response_model=list[JobPostingModel])
def getDiceData():
    """Fetch all job postings."""
    # records = getAllJobs()
    records = getNotAppliedDiceJobs()
    if not records:
        raise HTTPException(status_code=404, detail="No data found.")
    return records


@app.get("/scrapeLinkedIn")
def scrapeLinkedIn():
    """Trigger the LinkedIn data scraping script asynchronously."""
    try:
        script_path = "/home/robada/Desktop/Saral-Job-Viewer/services/linkedInScraping.sh"
        subprocess.Popen([script_path], 
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        start_new_session=True)
        
        return {"success": True, "message": "Data scraping initiated"}
            
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to trigger scraper: {str(e)}"
        )


@app.get("/scrapeDice")
def scrapeDice():
    """Trigger the LinkedIn data scraping script asynchronously."""
    try:
        script_path = "/home/robada/Desktop/Saral-Job-Viewer/services/diceScraping.sh"
        subprocess.Popen([script_path], 
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        start_new_session=True)
        
        return {"success": True, "message": "Data scraping initiated"}
            
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to trigger scraper: {str(e)}"
        )


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
    
@app.get("/getCountForDiceAcceptDeny")
def countDiceAcceptDeny():
    """
    Fetch the counts of accepted and rejected job applications.
    """
    try:
        counts = getCountForDiceAcceptDeny()
        return {
            "message": "Counts fetched successfully.",
            "data": counts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching counts: {str(e)}")

@app.post("/getHoursOfData", response_model=list[JobPostingModel])
def get_hours_of_data(request: HoursRequest):
    """Fetch job postings from the last specified hours."""
    try:
        print(request.hours)
        timedRecords = getHoursOfData(request.hours)
        if not timedRecords:
            raise HTTPException(status_code=404, detail="No job postings found for the given hours.")
        return timedRecords
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching data: {str(e)}")
    
@app.post("/getHoursOfDiceData", response_model=list[JobPostingModel])
def get_hours_of_dice_data(request: HoursRequest):
    """Fetch job postings from the last specified hours."""
    try:
        print(request.hours)
        timedRecords = getHoursOfDiceData(request.hours)
        if not timedRecords:
            raise HTTPException(status_code=404, detail="No job postings found for the given hours.")
        return timedRecords
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching data: {str(e)}")

@app.get("/getKeywords", response_model=list[KeywordModel])
def getKeywords():
    """Fetch all keywords."""
    keywords = getAllKeywords()
    if not keywords:
        raise HTTPException(status_code=404, detail="No keywords found.")
    return keywords

@app.get("/getDiceKeywords", response_model=list[KeywordModel])
def getDiceKeywords():
    """Fetch all dice keywords."""
    keywords = getAllDiceKeywords()
    if not keywords:
        raise HTTPException(status_code=404, detail="No dice keywords found.")
    return keywords


@app.post("/addKeyword")
def addKeywordEndpoint(request: AddKeywordRequest):
    """Add a new keyword."""
    newKeyword = addKeyword(request.name, request.type)
    if newKeyword:
        return {"message": "Keyword added successfully", "id": newKeyword.id}
    raise HTTPException(status_code=500, detail="Failed to add keyword.")


@app.post("/addDiceKeyword")
def addDiceKeywordEndpoint(request: AddKeywordRequest):
    """Add a new dice keyword."""
    newKeyword = addDiceKeyword(request.name, request.type)
    if newKeyword:
        return {"message": "Dice keyword added successfully", "id": newKeyword.id}
    raise HTTPException(status_code=500, detail="Failed to add dice keyword.")


@app.post("/removeKeyword")
def removeKeywordEndpoint(request: RemoveKeywordRequest):
    """Remove a keyword."""
    keyword = removeKeyword(request.id)
    if keyword:
        return {"message": "Keyword removed successfully."}
    raise HTTPException(
        status_code=404, detail=f"No keyword found with ID {request.id}."
    )


@app.post("/removeDiceKeyword")
def removeDiceKeywordEndpoint(request: RemoveKeywordRequest):
    """Remove a dice keyword."""
    keyword = removeDiceKeyword(request.id)
    if keyword:
        return {"message": "Dice keyword removed successfully."}
    raise HTTPException(
        status_code=404, detail=f"No dice keyword found with ID {request.id}."
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

@app.post("/applyThisDice")
def applyDiceJob(request: ApplyRequestModel):
    """Mark a dice job as applied."""
    job = updateDiceJobStatus(request.jobID, "YES")
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


@app.post("/rejectThisDice")
def rejectDiceJob(request: RejectRequestModel):
    """Reject a dice job posting."""
    job = updateDiceJobStatus(request.jobID, "NEVER")
    if job:
        return {"message": "Rejection recorded successfully.", "jobID": request.jobID}
    raise HTTPException(
        status_code=404, detail=f"No record found with ID {request.jobID}."
    )


@app.get("/getLinkedInQuestions")
def get_linkedin_questions():
    """Fetch LinkedIn questions from JSON file."""
    try:
        with open(questionsFilePath, 'r') as file:
            questions_data = json.load(file)
        return {
            "message": "Questions fetched successfully",
            "data": questions_data
        }
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Questions file not found"
        )
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Error parsing questions file"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error reading questions file: {str(e)}"
        )


@app.post("/updateLinkedInQuestions")
def update_linkedin_questions(request: UpdateLinkedInQuestionsRequest):
    """Update LinkedIn questions in JSON file."""
    try:
        
        # Convert the questions to a list of dictionaries
        questions_data = [question.model_dump() for question in request.questions]
        
        # Write the updated questions to the file
        with open(questionsFilePath, 'w') as file:
            json.dump(questions_data, file, indent=2)
            
        return {
            "message": "Questions updated successfully",
            "data": questions_data
        }
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Questions file not found"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error updating questions file: {str(e)}"
        )


# Run the application
if __name__ == "__main__":
    import uvicorn
    import argparse
    
    # Create command line argument parser
    parser = argparse.ArgumentParser(description="Run the FastAPI application")
    parser.add_argument("--db-type", choices=["mysql", "sqlite"], default=dbType,
                      help="Database type to use (mysql or sqlite)")
    args = parser.parse_args()
    
    # Update environment variable based on command line argument
    if args.db_type != dbType:
        print(f"Switching database type from {dbType} to {args.db_type}")
        os.environ["DB_TYPE"] = args.db_type
        # Note: This doesn't update the .env file, only the runtime environment
    
    uvicorn.run(app, host="0.0.0.0", port=5000)
