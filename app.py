from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import JobPosting, Session, addTheJob, checkTheJob  # Import from database.py

# Create FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic model for data serialization
class BhawishyaWaniModel(BaseModel):
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
        orm_mode = True


class ApplyRequestModel(BaseModel):
    jobID: str
    applyMethod: str
    link: str


class RejectRequestModel(BaseModel):
    jobID: str


@app.get("/getData", response_model=list[BhawishyaWaniModel])
def get_data():
    """Endpoint to fetch all records from the JobPosting table."""
    db: Session = Session()
    try:
        records = db.query(JobPosting).all()
        if not records:
            raise HTTPException(status_code=404, detail="No data found.")
        return records
    finally:
        db.close()


@app.get("/getData/{id}", response_model=BhawishyaWaniModel)
def get_data_by_id(id: str):
    """Endpoint to fetch a specific record by ID."""
    db: Session = Session()
    try:
        record = db.query(JobPosting).filter(JobPosting.id == id).first()
        if not record:
            raise HTTPException(status_code=404, detail=f"No record found with ID {id}.")
        return record
    finally:
        db.close()


@app.post("/applyThis")
def apply_this(request: ApplyRequestModel):
    """Endpoint to handle job application submissions."""
    db: Session = Session()
    try:
        record = db.query(JobPosting).filter(JobPosting.id == request.jobID).first()
        if not record:
            raise HTTPException(status_code=404, detail=f"No record found with ID {request.jobID}.")
        record.applied = "1"
        db.commit()
        return {
            "message": "Application submitted successfully.",
            "jobID": request.jobID,
            "applyMethod": request.applyMethod,
            "link": request.link
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"An error occurred: {e}")
    finally:
        db.close()


@app.post("/rejectThis")
def reject_this(request: RejectRequestModel):
    """Endpoint to handle job rejection submissions."""
    db: Session = Session()
    try:
        record = db.query(JobPosting).filter(JobPosting.id == request.jobID).first()
        if not record:
            raise HTTPException(status_code=404, detail=f"No record found with ID {request.jobID}.")
        record.applied = "0"
        db.commit()
        return {
            "message": "Rejection recorded successfully.",
            "jobID": request.jobID,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"An error occurred: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
