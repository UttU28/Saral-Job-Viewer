from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session
from sqlalchemy import Column, String, Text

Base = declarative_base()

# Define the SQLAlchemy model
class BhawishyaWani(Base):
    __tablename__ = "allJobData"

    id = Column(String, primary_key=True)
    link = Column(Text)
    title = Column(Text)
    companyName = Column(Text)
    location = Column(Text)
    method = Column(Text)
    timeStamp = Column(Text)
    jobType = Column(Text)
    jobDescription = Column(Text)
    applied = Column(Text)



# Database setup
DATABASE_URL = "mysql+pymysql://utsav:root@10.0.0.17:3306/bhawishyaWani" 
engine = create_engine(DATABASE_URL, echo=True)
Base.metadata.create_all(engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

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
    jobLink: str
    jobTitle: str
    companyName: str
    jobLocation: str
    jobMethod: str
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
    """Endpoint to fetch all records from the BhawishyaWani table."""
    db: Session = SessionLocal()
    try:
        records = db.query(BhawishyaWani).all()
        if not records:
            raise HTTPException(status_code=404, detail="No data found.")
        return records
    finally:
        db.close()

@app.get("/getData/{id}", response_model=BhawishyaWaniModel)
def get_data_by_id(id: str):
    """Endpoint to fetch a specific record by ID."""
    db: Session = SessionLocal()
    try:
        record = db.query(BhawishyaWani).filter(BhawishyaWani.id == id).first()
        if not record:
            raise HTTPException(status_code=404, detail=f"No record found with ID {id}.")
        return record
    finally:
        db.close()

@app.post("/applyThis")
def apply_this(request: ApplyRequestModel):
    """Endpoint to handle job application submissions."""
    db: Session = SessionLocal()
    try:
        # Fetch the job record by ID
        record = db.query(BhawishyaWani).filter(BhawishyaWani.id == request.jobID).first()
        if not record:
            raise HTTPException(status_code=404, detail=f"No record found with ID {request.jobID}.")

        # Update the `applied` column to "YES"
        record.applied = "YES"
        db.commit()  # Commit the transaction

        return {
            "message": "Application submitted successfully.",
            "jobID": request.jobID,
            "applyMethod": request.applyMethod,
            "link": request.link
        }
    except Exception as e:
        db.rollback()  # Rollback in case of an error
        raise HTTPException(status_code=500, detail="An error occurred while processing the request.") from e
    finally:
        db.close()

@app.post("/rejectThis")
def reject_this(request: RejectRequestModel):
    """Endpoint to handle job rejection submissions."""
    db: Session = SessionLocal()
    try:
        # Fetch the job record by ID
        record = db.query(BhawishyaWani).filter(BhawishyaWani.id == request.jobID).first()
        if not record:
            raise HTTPException(status_code=404, detail=f"No record found with ID {request.jobID}.")

        # Update the `applied` column to "NO"
        record.applied = "NO"
        db.commit()  # Commit the transaction

        return {
            "message": "Rejection recorded successfully.",
            "jobID": request.jobID,
        }
    except Exception as e:
        db.rollback()  # Rollback in case of an error
        # Log the full error message
        print(f"Error occurred: {e}")
        raise HTTPException(status_code=500, detail=f"An error occurred: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
