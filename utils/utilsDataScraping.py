import logging
from sqlalchemy import create_engine, Column, String, Text, Integer, Enum, TIMESTAMP
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.ERROR)
logging.getLogger("sqlalchemy.engine").setLevel(logging.ERROR)

# Initialize the SQLAlchemy declarative base
Base = declarative_base()

# Define JobPosting model
class JobPosting(Base):
    __tablename__ = "allLinkedInJobs"

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

# Define SearchKeywords model
class SearchKeywords(Base):
    __tablename__ = "linkedInKeywords"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    type = Column(Enum("NoCompany", "SearchList"), nullable=False)
    created_at = Column(TIMESTAMP)

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

# Fetch and organize search keywords into two arrays
def getSearchKeywords():
    session = getSession()
    try:
        allKeywords = session.query(SearchKeywords).all()
        noCompany = [keyword.name for keyword in allKeywords if keyword.type == "NoCompany"]
        searchList = [keyword.name for keyword in allKeywords if keyword.type == "SearchList"]
        return {"noCompany": noCompany, "searchList": searchList}
    except Exception as e:
        print(f"Error: Could not fetch search keywords. Reason: {e}")
        return {"noCompany": [], "searchList": []}
    finally:
        session.close()
