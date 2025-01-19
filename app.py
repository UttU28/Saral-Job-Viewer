from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, Enum, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.exc import IntegrityError
from dotenv import load_dotenv
import os

load_dotenv()


DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL, echo=False)
Base = declarative_base()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class JobPosting(Base):
    __tablename__ = "allJobData"
    id = Column(String, primary_key=True)
    link = Column(String)
    title = Column(String)
    companyName = Column(String)
    location = Column(String)
    method = Column(String)
    timeStamp = Column(String)
    jobType = Column(String)
    jobDescription = Column(String)
    applied = Column(String)

class Keyword(Base):
    __tablename__ = "searchKeywords"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    type = Column(Enum("NoCompany", "SearchList", name="keyword_type"), nullable=False)

Base.metadata.create_all(bind=engine)

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

def getDb():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
def helwld():
    return "Hello Duniya"

@app.get("/getData", response_model=list[JobPostingModel])
def getData(db: Session = Depends(getDb)):
    records = db.query(JobPosting).all()
    if not records:
        raise HTTPException(status_code=404, detail="No data found.")
    return records

@app.get("/getKeywords", response_model=list[KeywordModel])
def getKeywords(db: Session = Depends(getDb)):
    keywords = db.query(Keyword).all()
    if not keywords:
        raise HTTPException(status_code=404, detail="No keywords found.")
    return keywords

@app.post("/addKeyword")
def addKeyword(request: AddKeywordRequest, db: Session = Depends(getDb)):
    newKeyword = Keyword(name=request.name, type=request.type)
    db.add(newKeyword)
    db.commit()
    db.refresh(newKeyword)
    return {"message": "Keyword added successfully", "id": newKeyword.id}

@app.post("/removeKeyword")
def removeKeyword(request: RemoveKeywordRequest, db: Session = Depends(getDb)):
    keyword = db.query(Keyword).filter(Keyword.id == request.id).first()
    if not keyword:
        raise HTTPException(status_code=404, detail=f"No keyword found with ID {request.id}.")
    db.delete(keyword)
    db.commit()
    return {"message": "Keyword removed successfully"}

@app.post("/applyThis")
def applyThis(request: ApplyRequestModel, db: Session = Depends(getDb)):
    record = db.query(JobPosting).filter(JobPosting.id == request.jobID).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"No record found with ID {request.jobID}.")
    record.applied = "YES"
    db.commit()
    return {"message": "Application submitted successfully.", "jobID": request.jobID, "applyMethod": request.applyMethod, "link": request.link}

@app.post("/rejectThis")
def rejectThis(request: RejectRequestModel, db: Session = Depends(getDb)):
    record = db.query(JobPosting).filter(JobPosting.id == request.jobID).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"No record found with ID {request.jobID}.")
    record.applied = "NEVER"
    db.commit()
    return {"message": "Rejection recorded successfully.", "jobID": request.jobID}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
