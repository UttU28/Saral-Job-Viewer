import logging
from sqlalchemy import create_engine, Column, String, Text, Enum, Integer, DateTime, Float, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
import time
import sqlite3
import json
from typing import Optional, Dict, Any

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.ERROR)
logging.getLogger("sqlalchemy.engine").setLevel(logging.ERROR)

# Initialize SQLAlchemy base
Base = declarative_base()

# Database connection configuration
class DbConfig:
    def __init__(self):
        # Get database type from environment variables (default to sqlite if not specified)
        self.dbType = os.getenv("DB_TYPE", "sqlite").lower()
        
        # MySQL connection URL
        self.mysqlUrl = os.getenv("MYSQL_URL")
        if not self.mysqlUrl and self.dbType == "mysql":
            self.mysqlUrl = os.getenv("DATABASE_URL")  # For backward compatibility
            if not self.mysqlUrl:
                raise ValueError("MYSQL_URL is not set in the .env file!")
        
        # SQLite connection URL (default to a local file)
        self.sqliteDbPath = os.getenv("SQLITE_DB_PATH", "data/localDb.sqlite")
        self.sqliteUrl = f"sqlite:///{self.sqliteDbPath}"
        
        # Create the parent directory for SQLite if it doesn't exist
        if self.dbType == "sqlite":
            os.makedirs(os.path.dirname(self.sqliteDbPath), exist_ok=True)
        
        # Set the connection URL based on the database type
        self.connectionUrl = self.mysqlUrl if self.dbType == "mysql" else self.sqliteUrl
        
        # Print the database configuration
        print(f"Database Type: {self.dbType}")
        print(f"Connection URL: {self.connectionUrl}")

# Create database configuration instance
dbConfig = DbConfig()

# Initialize SQLAlchemy engine and session maker
engine = create_engine(dbConfig.connectionUrl, echo=False)
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
    aiProcessed = Column(Boolean, default=False, nullable=False)
    aiTags = Column(Text, default='[]', nullable=False)  # JSON string for array of tags

class Keyword(Base):
    __tablename__ = "linkedInKeywords"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)  # Changed from Enum to String for SQLite compatibility
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)





# Create all tables if they don't already exist
Base.metadata.create_all(engine)

# Utility function to get a new session
def getSession():
    return Session()

# Function to create sample data if tables are empty
def initializeDatabaseWithSampleData():
    print("Checking if database needs initialization...")
    session = getSession()
    try:
        # Check if tables are empty
        keywordsCount = session.query(Keyword).count()
        
        # Initialize only keyword tables with sample data
        # We're not creating sample data for allLinkedInJobs as requested
        
        if keywordsCount == 0:
            print("Creating sample LinkedIn keywords...")
            sampleLinkedInKeywords = [
                Keyword(
                    name="python",
                    type="SearchList",
                    created_at=datetime.utcnow()
                ),
                Keyword(
                    name="developer",
                    type="SearchList",
                    created_at=datetime.utcnow()
                ),
                Keyword(
                    name="Spam Company",
                    type="NoCompany",
                    created_at=datetime.utcnow()
                )
            ]
            session.add_all(sampleLinkedInKeywords)
        
        
        
        # Commit the sample data if any was added
        if keywordsCount == 0:
            session.commit()
            print("Database initialized with sample data successfully!")
        else:
            print("Database already contains data, skipping initialization.")
            
    except Exception as e:
        session.rollback()
        logging.error(f"Error initializing database with sample data: {e}")
    finally:
        session.close()

# Initialize database with sample data
initializeDatabaseWithSampleData()

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
    applied: str,
    aiProcessed: bool = False,
    aiTags: list = None
):
    session = getSession()
    try:
        existingEntry = session.query(JobPosting).filter_by(id=jobId).first()
        if not existingEntry:
            # Convert aiTags list to JSON string
            if aiTags is None:
                aiTags = []
            aiTagsJson = json.dumps(aiTags)
            
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
                aiProcessed=aiProcessed,
                aiTags=aiTagsJson,
            )
            session.add(newEntry)
            session.commit()
            logging.info(f"Job with ID {jobId} added.")
            return newEntry
        else:
            logging.info(f"Job with ID {jobId} already exists.")
            return existingEntry
    except IntegrityError as e:
        session.rollback()
        logging.error(f"IntegrityError: {e}")
    except Exception as e:
        session.rollback()
        logging.error(f"Error: {e}")
    finally:
        session.close()


def getNotAppliedJobs():
    session = getSession()
    try:
        currentTimestamp = time.time()
        fortyEightHoursAgo = currentTimestamp - (6 * 60 * 60)
        
        # Cast timeStamp to float - works in both SQLite and MySQL
        jobs = session.query(JobPosting).filter(
            JobPosting.applied == "NO",
        ).all()
        
        # Filter by timestamp in Python code to ensure compatibility
        return [job for job in jobs if float(job.timeStamp) >= fortyEightHoursAgo]
    except Exception as e:
        logging.error(f"Error fetching not applied jobs: {e}")
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
        # Validate keyword type for compatibility
        if keywordType not in ["NoCompany", "SearchList"]:
            logging.error(f"Invalid keyword type: {keywordType}")
            return None
            
        newKeyword = Keyword(name=name, type=keywordType, created_at=datetime.utcnow())
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

# Job fetching and management functions
def getAllJobs():
    session = getSession()
    try:
        return session.query(JobPosting).all()
    except Exception as e:
        logging.error(f"Error fetching all jobs: {e}")
        return []
    finally:
        session.close()

def getHoursOfData(hours: int):
    session = getSession()
    try:
        currentTimestamp = time.time()
        hoursAgo = currentTimestamp - (hours * 60 * 60)
        
        # Get all NO jobs and filter in Python for compatibility
        jobs = session.query(JobPosting).filter(
            JobPosting.applied == "NO",
        ).all()
        
        return [job for job in jobs if float(job.timeStamp) >= hoursAgo]
    except Exception as e:
        logging.error(f"Error fetching jobs for last {hours} hours: {e}")
        return []
    finally:
        session.close()

def getCountForAcceptDeny():
    session = getSession()
    try:
        # SQLite and MySQL compatible query
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

# AI-related helper functions
def getJobTags(jobId: str):
    """Get AI tags for a specific job"""
    session = getSession()
    try:
        job = session.query(JobPosting).filter(JobPosting.id == jobId).first()
        if job and job.aiTags:
            return json.loads(job.aiTags)
        return []
    except Exception as e:
        logging.error(f"Error getting job tags: {e}")
        return []
    finally:
        session.close()

def setJobTags(jobId: str, tags: list):
    """Set AI tags for a specific job"""
    session = getSession()
    try:
        job = session.query(JobPosting).filter(JobPosting.id == jobId).first()
        if job:
            job.aiTags = json.dumps(tags)
            session.commit()
            return True
        return False
    except Exception as e:
        session.rollback()
        logging.error(f"Error setting job tags: {e}")
        return False
    finally:
        session.close()

def markJobAsAiProcessed(jobId: str):
    """Mark a job as AI processed"""
    session = getSession()
    try:
        job = session.query(JobPosting).filter(JobPosting.id == jobId).first()
        if job:
            job.aiProcessed = True
            session.commit()
            return True
        return False
    except Exception as e:
        session.rollback()
        logging.error(f"Error marking job as AI processed: {e}")
        return False
    finally:
        session.close()

def getUnprocessedJobsForAI():
    """Get jobs that haven't been processed by AI yet"""
    session = getSession()
    try:
        jobs = session.query(JobPosting).filter(
            JobPosting.aiProcessed == False
        ).all()
        return jobs
    except Exception as e:
        logging.error(f"Error fetching unprocessed AI jobs: {e}")
        return []
    finally:
        session.close()

