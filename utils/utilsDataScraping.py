import logging
from sqlalchemy import create_engine, Column, String, Text, Integer, Enum, TIMESTAMP, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
from datetime import datetime

# Import the database config from utilsDatabase
from utils.utilsDatabase import DbConfig, getSession

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.ERROR)
logging.getLogger("sqlalchemy.engine").setLevel(logging.ERROR)

# Get database configuration
dbConfig = DbConfig()

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

# Define SearchKeywords model - changed to be compatible with SQLite
class SearchKeywords(Base):
    __tablename__ = "linkedInKeywords"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)  # Changed from Enum to String for SQLite compatibility
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

# Create tables if they don't exist using the configured database
engine = create_engine(dbConfig.connectionUrl, echo=False)
Base.metadata.create_all(engine)

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
            return True
        else:
            print(f"Entry with ID {jobId} already exists. Ignoring.")
            return False
    except Exception as e:
        session.rollback()
        print(f"Error: Could not add job with ID {jobId}. Reason: {e}")
        return False
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
        # Filter by type strings instead of enums for SQLite compatibility
        allKeywords = session.query(SearchKeywords).all()
        noCompany = [keyword.name for keyword in allKeywords if keyword.type == "NoCompany"]
        searchList = [keyword.name for keyword in allKeywords if keyword.type == "SearchList"]
        return {"noCompany": noCompany, "searchList": searchList}
    except Exception as e:
        print(f"Error: Could not fetch search keywords. Reason: {e}")
        return {"noCompany": [], "searchList": []}
    finally:
        session.close()

# Create dummy data for search keywords
def createDummyKeywords():
    session = getSession()
    try:
        # Check if we already have dummy data
        existing_count = session.query(SearchKeywords).count()
        if existing_count > 0:
            print(f"Database already contains {existing_count} keywords. Skipping dummy data creation.")
            return
        
        # Dummy data for NoCompany keywords (keywords without specific company names)
        noCompany_keywords = [
            "jobbot", "Jobot", "Lensa"
        ]
        
        # Dummy data for SearchList keywords (specific search terms or job titles)
        searchList_keywords = [
            "python developer", "full stack developer", "automation developer"
        ]
        
        current_time = datetime.utcnow()
        
        # Add NoCompany keywords
        for keyword in noCompany_keywords:
            new_keyword = SearchKeywords(
                name=keyword,
                type="NoCompany",
                created_at=current_time
            )
            session.add(new_keyword)
        
        # Add SearchList keywords
        for keyword in searchList_keywords:
            new_keyword = SearchKeywords(
                name=keyword,
                type="SearchList",
                created_at=current_time
            )
            session.add(new_keyword)
        
        session.commit()
        print(f"Added {len(noCompany_keywords)} NoCompany keywords and {len(searchList_keywords)} SearchList keywords.")
    except Exception as e:
        session.rollback()
        print(f"Error: Could not create dummy keywords. Reason: {e}")
    finally:
        session.close()

# Example usage of the dummy data creator
if __name__ == "__main__":
    createDummyKeywords()
    keywords = getSearchKeywords()
    print("NoCompany Keywords:", keywords["noCompany"])
    print("SearchList Keywords:", keywords["searchList"])
