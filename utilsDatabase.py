import logging
from sqlalchemy import create_engine, Column, String, Text, Enum, Integer, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
import os
from dotenv import load_dotenv
from datetime import datetime

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.ERROR)
logging.getLogger("sqlalchemy.engine").setLevel(logging.ERROR)

# Initialize the SQLAlchemy declarative base
Base = declarative_base()

# Define JobPosting model
class JobPosting(Base):
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

# Define Keyword model
class Keyword(Base):
    __tablename__ = "searchKeywords"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    type = Column(Enum("NoCompany", "SearchList", name="keyword_type"), nullable=False)

# Define EasyApply model
class EasyApply(Base):
    __tablename__ = "easyApplyData"
    id = Column(Integer, primary_key=True, autoincrement=True)
    jobID = Column(Integer, nullable=False)
    userName = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow)

# Database connection URL from environment variables
databaseUrl = os.getenv("DATABASE_URL")
if not databaseUrl:
    raise ValueError("DATABASE_URL is not set in the .env file!")

# Initialize the SQLAlchemy engine
engine = create_engine(databaseUrl, echo=False)

# Create all tables in the database if they don't already exist
Base.metadata.create_all(engine)

# Create a session maker
Session = sessionmaker(bind=engine)

# Function to get a new session
def getSession():
    return Session()

# Add a new job posting
def addJob(
    jobId: str,
    jobLink: str,
    jobTitle: str,
    companyName: str,
    jobLocation: str,
    jobMethod: str,
    timeStamp: str,
    jobType: str,
    jobDescription: str,
    applied: str,
):
    session = getSession()
    try:
        existingEntry = session.query(JobPosting).filter_by(id=jobId).first()
        if not existingEntry:
            newEntry = JobPosting(
                id=jobId,
                link=jobLink,
                title=jobTitle,
                companyName=companyName,
                location=jobLocation,
                method=jobMethod,
                timeStamp=timeStamp,
                jobType=jobType,
                jobDescription=jobDescription,
                applied=applied,
            )
            session.add(newEntry)
            session.commit()
            print(f"Entry with ID {jobId} added.")
        else:
            print(f"Entry with ID {jobId} already exists. Ignoring.")
    except IntegrityError as e:
        session.rollback()
        print(f"IntegrityError: Could not add job with ID {jobId}. Reason: {e}")
    except Exception as e:
        session.rollback()
        print(f"Error: Could not add job with ID {jobId}. Reason: {e}")
    finally:
        session.close()

# Check if a job exists by ID
def checkJob(jobId: str) -> bool:
    session = getSession()
    try:
        existingEntry = session.query(JobPosting).filter_by(id=jobId).first()
        return existingEntry is None
    finally:
        session.close()

# Fetch all job postings
def getAllJobs():
    session = getSession()
    try:
        return session.query(JobPosting).all()
    finally:
        session.close()

def getNotAppliedJobs():
    session = getSession()
    try:
        return session.query(JobPosting).filter(JobPosting.applied == "NO").all()
    finally:
        session.close()

# Fetch all keywords
def getAllKeywords():
    session = getSession()
    try:
        return session.query(Keyword).all()
    finally:
        session.close()

# Add a new keyword
def addKeyword(name: str, keywordType: str):
    session = getSession()
    try:
        newKeyword = Keyword(name=name, type=keywordType)
        session.add(newKeyword)
        session.commit()
        session.refresh(newKeyword)
        return newKeyword
    except Exception as e:
        session.rollback()
        print(f"Error: Could not add keyword. Reason: {e}")
    finally:
        session.close()

# Remove a keyword by ID
def removeKeyword(keywordId: int):
    session = getSession()
    try:
        keyword = session.query(Keyword).filter(Keyword.id == keywordId).first()
        if keyword:
            session.delete(keyword)
            session.commit()
            return keyword
        return None
    except Exception as e:
        session.rollback()
        print(f"Error: Could not remove keyword. Reason: {e}")
    finally:
        session.close()

# Update job applied status
def updateJobStatus(jobId: str, appliedStatus: str):
    session = getSession()
    try:
        job = session.query(JobPosting).filter(JobPosting.id == jobId).first()
        if job:
            job.applied = appliedStatus
            session.commit()
            return job
        return None
    except Exception as e:
        session.rollback()
        print(f"Error: Could not update job status. Reason: {e}")
    finally:
        session.close()

# Add a job to EasyApply table
def addToEasyApply(jobId: int, userName: str, status: str):
    session = getSession()
    try:
        newEntry = EasyApply(jobID=jobId, userName=userName, status=status)
        session.add(newEntry)
        session.commit()
        session.refresh(newEntry)
        return newEntry
    except Exception as e:
        session.rollback()
        print(f"Error: Could not add to Easy Apply. Reason: {e}")
    finally:
        session.close()

# Fetch all EasyApply entries
def getAllEasyApply():
    session = getSession()
    try:
        return session.query(EasyApply).all()
    finally:
        session.close()
