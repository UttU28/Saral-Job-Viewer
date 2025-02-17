import logging
from sqlalchemy import create_engine, Column, String, Text, Enum, Integer, DateTime, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
import time

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.ERROR)
logging.getLogger("sqlalchemy.engine").setLevel(logging.ERROR)

# Initialize SQLAlchemy base
Base = declarative_base()

# Database connection URL from environment variables
databaseUrl = os.getenv("DATABASE_URL")
if not databaseUrl:
    raise ValueError("DATABASE_URL is not set in the .env file!")

# Initialize SQLAlchemy engine and session maker
engine = create_engine(databaseUrl, echo=False)
Session = sessionmaker(bind=engine)

# Models
class JobPosting(Base):
    __tablename__ = "allLinkedInJobs"

    id = Column(String, primary_key=True)
    link = Column(Text)
    title = Column(Text)
    companyName = Column(Text)
    location = Column(Text)
    method = Column(Text)
    timeStamp = Column(String)  # Assuming timeStamp is stored as a string
    jobType = Column(Text)
    jobDescription = Column(Text)
    applied = Column(Text)

class Keyword(Base):
    __tablename__ = "linkedInKeywords"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    type = Column(Enum("NoCompany", "SearchList", name="keyword_type"), nullable=False)

class DiceKeyword(Base):
    __tablename__ = "diceKeywords"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    type = Column(Enum("NoCompany", "SearchList", name="keyword_type"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class EasyApply(Base):
    __tablename__ = "easyApplyData"

    id = Column(Integer, primary_key=True, autoincrement=True)
    jobID = Column(Integer, nullable=False)
    status = Column(String(50), nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow)

class DiceJobPosting(Base):
    __tablename__ = "allDiceJobs"

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

# Create all tables if they don't already exist
Base.metadata.create_all(engine)

# Utility function to get a new session
def getSession():
    return Session()

# CRUD Functions
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
    applied: str
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
            logging.info(f"Job with ID {jobId} added.")
        else:
            logging.info(f"Job with ID {jobId} already exists.")
    except IntegrityError as e:
        session.rollback()
        logging.error(f"IntegrityError: {e}")
    except Exception as e:
        session.rollback()
        logging.error(f"Error: {e}")
    finally:
        session.close()

def getCountForAcceptDeny():
    session = getSession()
    try:
        countAccepted = session.query(JobPosting).filter(JobPosting.applied == "YES").count()
        countRejected = session.query(JobPosting).filter(JobPosting.applied == "NEVER").count()
        return {
            "countAccepted": countAccepted,
            "countRejected": countRejected
        }
    except Exception as e:
        logging.error(f"Error fetching counts: {e}")
        return {"countAccepted": 0, "countRejected": 0}
    finally:
        session.close()

def getNotAppliedJobs():
    session = getSession()
    try:
        currentTimestamp = time.time()
        fortyEightHoursAgo = currentTimestamp - (6 * 60 * 60)
        return session.query(JobPosting).filter(
            JobPosting.applied == "NO",
            JobPosting.timeStamp.cast(Float) >= fortyEightHoursAgo
        ).all()
    except Exception as e:
        logging.error(f"Error fetching not applied jobs: {e}")
        return []
    finally:
        session.close()

def getHoursOfData(hours: int):
    session = getSession()
    try:
        currentTimestamp = time.time()
        fortyEightHoursAgo = currentTimestamp - (hours * 60 * 60)
        return session.query(JobPosting).filter(
            JobPosting.applied == "NO",
            JobPosting.timeStamp.cast(Float) >= fortyEightHoursAgo
        ).all()
    except Exception as e:
        logging.error(f"Error fetching not applied jobs: {e}")
        return []
    finally:
        session.close()

def getAllJobs():
    session = getSession()
    try:
        return session.query(JobPosting).all()
    except Exception as e:
        logging.error(f"Error fetching all jobs: {e}")
        return []
    finally:
        session.close()

def getAllKeywords():
    session = getSession()
    try:
        return session.query(Keyword).all()
    except Exception as e:
        logging.error(f"Error fetching all keywords: {e}")
        return []
    finally:
        session.close()


def addKeyword(name: str, keywordType: str):
    session = getSession()
    try:
        newKeyword = Keyword(name=name, type=keywordType)
        session.add(newKeyword)
        session.commit()
        session.refresh(newKeyword)
        return newKeyword
    except IntegrityError as e:
        session.rollback()
        logging.error(f"IntegrityError adding keyword: {e}")
    except Exception as e:
        session.rollback()
        logging.error(f"Error adding keyword: {e}")
    finally:
        session.close()

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
        logging.error(f"Error removing keyword: {e}")
        return None
    finally:
        session.close()

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
        logging.error(f"Error updating job status: {e}")
        return None
    finally:
        session.close()

def addToEasyApply(jobId: int, status: str):
    session = getSession()
    try:
        newEntry = EasyApply(jobID=jobId, status=status)
        session.add(newEntry)
        session.commit()
        session.refresh(newEntry)

        # Update job status to "YES"
        updateJobStatus(jobId=str(jobId), appliedStatus="YES")

        return newEntry
    except Exception as e:
        session.rollback()
        logging.error(f"Error adding to Easy Apply: {e}")
        return None
    finally:
        session.close()

def getAllEasyApply():
    session = getSession()
    try:
        return session.query(EasyApply).all()
    except Exception as e:
        logging.error(f"Error fetching Easy Apply entries: {e}")
        return []
    finally:
        session.close()


def addDiceJob(
    jobId: str,
    jobLink: str,
    jobTitle: str,
    companyName: str,
    jobLocation: str,
    jobMethod: str,
    timeStamp: str,
    jobType: str,
    jobDescription: str,
    applied: str
):
    session = getSession()
    try:
        existingEntry = session.query(DiceJobPosting).filter_by(id=jobId).first()
        if not existingEntry:
            newEntry = DiceJobPosting(
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
            logging.info(f"Dice job with ID {jobId} added.")
        else:
            logging.info(f"Dice job with ID {jobId} already exists.")
    except IntegrityError as e:
        session.rollback()
        logging.error(f"IntegrityError: {e}")
    except Exception as e:
        session.rollback()
        logging.error(f"Error: {e}")
    finally:
        session.close()

def getNotAppliedDiceJobs():
    session = getSession()
    try:
        currentTimestamp = time.time()
        twentyFourHoursAgo = currentTimestamp - (24 * 60 * 60)
        return session.query(DiceJobPosting).filter(
            DiceJobPosting.applied == "NO",
            DiceJobPosting.timeStamp.cast(Float) >= twentyFourHoursAgo
        ).all()
    except Exception as e:
        logging.error(f"Error fetching not applied Dice jobs: {e}")
        return []
    finally:
        session.close()

def getCountForDiceAcceptDeny():
    session = getSession()
    try:
        countAccepted = session.query(DiceJobPosting).filter(DiceJobPosting.applied == "YES").count()
        countRejected = session.query(DiceJobPosting).filter(DiceJobPosting.applied == "NEVER").count()
        return {
            "countAccepted": countAccepted,
            "countRejected": countRejected
        }
    except Exception as e:
        logging.error(f"Error fetching counts: {e}")
        return {"countAccepted": 0, "countRejected": 0}
    finally:
        session.close()

def getHoursOfDiceData(hours: int):
    session = getSession()
    try:
        currentTimestamp = time.time()
        fortyEightHoursAgo = currentTimestamp - (hours * 60 * 60)
        return session.query(DiceJobPosting).filter(
            DiceJobPosting.applied == "NO",
            DiceJobPosting.timeStamp.cast(Float) >= fortyEightHoursAgo
        ).all()
    except Exception as e:
        logging.error(f"Error fetching not applied jobs: {e}")
        return []
    finally:
        session.close()

def addDiceKeyword(name: str, keywordType: str):
    session = getSession()
    try:
        newKeyword = DiceKeyword(
            name=name, 
            type=keywordType,
            created_at=datetime.utcnow()
        )
        session.add(newKeyword)
        session.commit()
        session.refresh(newKeyword)
        return newKeyword
    except IntegrityError as e:
        session.rollback()
        logging.error(f"IntegrityError adding keyword: {e}")
    except Exception as e:
        session.rollback()
        logging.error(f"Error adding keyword: {e}")
    finally:
        session.close()

def removeDiceKeyword(keywordId: int):
    session = getSession()
    try:
        keyword = session.query(DiceKeyword).filter(DiceKeyword.id == keywordId).first()
        if keyword:
            session.delete(keyword)
            session.commit()
            return keyword
        return None
    except Exception as e:
        session.rollback()
        logging.error(f"Error removing keyword: {e}")
        return None
    finally:
        session.close()

def updateDiceJobStatus(jobId: str, appliedStatus: str):
    session = getSession()
    try:
        job = session.query(DiceJobPosting).filter(DiceJobPosting.id == jobId).first()
        if job:
            job.applied = appliedStatus
            session.commit()
            return job
        return None
    except Exception as e:
        session.rollback()
        logging.error(f"Error updating job status: {e}")
        return None
    finally:
        session.close()

def getAllDiceKeywords():
    session = getSession()
    try:
        return session.query(DiceKeyword).all()
    except Exception as e:
        logging.error(f"Error fetching all dice keywords: {e}")
        return []
    finally:
        session.close()
