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
    __tablename__ = "bhawishya_wani"

    id = Column(String, primary_key=True)
    link = Column(Text)
    title = Column(Text)
    companyName = Column(Text)
    location = Column(Text)
    method = Column(Text)
    timeStamp = Column(Text)
    jobType = Column(Text)
    jobDescription = Column(Text)

# Database setup
DATABASE_URL = "sqlite:///bhawishyaWani.db"
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
    link: str
    title: str
    companyName: str
    location: str
    method: str
    timeStamp: str
    jobType: str
    jobDescription: str

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
    print("Received application request:", request.dict())
    return {
        "message": "Application data validated successfully.",
        "jobID": request.jobID,
        "applyMethod": request.applyMethod,
        "link": request.link
    }

@app.post("/rejectThis")
def reject_this(request: RejectRequestModel):
    """Endpoint to handle job rejection submissions."""
    print("Received rejection request:", request.dict())
    return {
        "message": "Rejection data validated successfully.",
        "jobID": request.jobID,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
