import logging
from sqlalchemy import create_engine, Column, String, Text, Enum, Integer, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

# Configure logging to show only errors
logging.basicConfig(level=logging.ERROR)
logging.getLogger("sqlalchemy.engine").setLevel(logging.ERROR)

# Use declarative base
Base = declarative_base()


# Define the JobPosting and Keyword models
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


class Keyword(Base):
    __tablename__ = "searchKeywords"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    type = Column(Enum("NoCompany", "SearchList", name="keyword_type"), nullable=False)


class EasyApply(Base):
    __tablename__ = "easyApplyData"
    id = Column(Integer, primary_key=True, autoincrement=True)
    jobID = Column(Integer, nullable=False)
    userName = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow)


# Connect to the database
databaseUrl = os.getenv("DATABASE_URL")
engine = create_engine(databaseUrl, echo=False)  # Disable SQLAlchemy echo

# Create tables if they don't exist
Base.metadata.create_all(engine)

# Configure session maker
Session = sessionmaker(bind=engine)


def getSession():
    """Get a new session."""
    return Session()


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
    """Adds a job posting to the database if it doesn't already exist."""
    session = getSession()
    try:
        existingEntry = session.query(JobPosting).filter_by(id=jobId).first()
        if existingEntry is None:
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
            print(f"Entry with ID {jobId} already exists. Ignoring the new entry.")
    except IntegrityError as e:
        session.rollback()
        print(f"IntegrityError: Could not add job with ID {jobId}. Reason: {e}")
    except Exception as e:
        session.rollback()
        print(f"Error: Could not add job with ID {jobId}. Reason: {e}")
    finally:
        session.close()


def checkJob(jobId: str) -> bool:
    """Checks if a job posting with the given ID exists in the database."""
    session = getSession()
    try:
        existingEntry = session.query(JobPosting).filter_by(id=jobId).first()
        return existingEntry is None
    finally:
        session.close()


def getAllJobs():
    """Fetches all job postings."""
    session = getSession()
    try:
        return session.query(JobPosting).all()
    finally:
        session.close()


def getAllKeywords():
    """Fetches all keywords."""
    session = getSession()
    try:
        return session.query(Keyword).all()
    finally:
        session.close()


def addKeyword(name: str, keywordType: str):
    """Adds a new keyword to the database."""
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


def removeKeyword(keywordId: int):
    """Removes a keyword from the database by ID."""
    session = getSession()
    try:
        keyword = session.query(Keyword).filter(Keyword.id == keywordId).first()
        if keyword:
            session.delete(keyword)
            session.commit()
            return keyword
        else:
            return None
    except Exception as e:
        session.rollback()
        print(f"Error: Could not remove keyword. Reason: {e}")
    finally:
        session.close()


def updateJobStatus(jobId: str, appliedStatus: str):
    """Updates the applied status of a job posting."""
    session = getSession()
    try:
        job = session.query(JobPosting).filter(JobPosting.id == jobId).first()
        if job:
            job.applied = appliedStatus
            session.commit()
            return job
        else:
            return None
    except Exception as e:
        session.rollback()
        print(f"Error: Could not update job status. Reason: {e}")
    finally:
        session.close()


def addToEasyApply(jobId: int, userName: str, status: str):
    """Adds a new entry to EasyApply table."""
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


def getAllEasyApply():
    """Fetches all EasyApply entries."""
    session = getSession()
    try:
        return session.query(EasyApply).all()
    finally:
        session.close()
