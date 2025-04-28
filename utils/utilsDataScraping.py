import logging
from sqlalchemy import create_engine, Column, String, Text, Integer, Enum, TIMESTAMP, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
from datetime import datetime

# Import the database config from utilsDatabase
from utils.utilsDatabase import DbConfig, getSession, Keyword, DiceKeyword

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
    try:
        session = getSession()
        excludedCompanies = []
        searchList = []
        
        keywords = session.query(Keyword).all()
        for keyword in keywords:
            if keyword.type.lower() == "no":
                excludedCompanies.append(keyword.name)
            elif keyword.type.lower() == "yes":
                searchList.append(keyword.name)
        
        session.close()
        return {"noCompany": excludedCompanies, "searchList": searchList}
    except Exception as e:
        print(f"Error getting keywords: {e}")
        return {"noCompany": [], "searchList": []}

# Get keywords from database for Dice scraping
def getDiceSearchKeywords():
    try:
        session = getSession()
        excludedCompanies = []
        searchList = []
        
        keywords = session.query(DiceKeyword).all()
        for keyword in keywords:
            if keyword.type.lower() == "no" or keyword.type.lower() == "nocompany":
                excludedCompanies.append(keyword.name)
            elif keyword.type.lower() == "yes" or keyword.type.lower() == "searchlist":
                searchList.append(keyword.name)
        
        session.close()
        return {"noCompany": excludedCompanies, "searchList": searchList}
    except Exception as e:
        print(f"Error getting dice keywords: {e}")
        return {"noCompany": [], "searchList": []}

# Add dummy data to database
def createDummyKeywords():
    try:
        session = getSession()
        
        # Add keywords
        defaultKeywords = [
            {"name": "Python developer", "type": "YES"},
            {"name": "backend developer", "type": "YES"},
            {"name": "software engineer", "type": "YES"},
            {"name": "Google", "type": "NO"},
            {"name": "Meta", "type": "NO"}
        ]
        
        for kw in defaultKeywords:
            # Check if keyword already exists
            existing = session.query(Keyword).filter_by(name=kw["name"]).first()
            if not existing:
                keyword = Keyword(name=kw["name"], type=kw["type"])
                session.add(keyword)
        
        session.commit()
        print("Dummy keywords created successfully")
        session.close()
        return True
    except Exception as e:
        print(f"Error creating dummy keywords: {e}")
        session.rollback()
        session.close()
        return False

# Add dummy data to Dice keywords database
def createDiceDummyKeywords():
    try:
        session = getSession()
        
        # Add dice keywords
        defaultKeywords = [
            {"name": "Python developer", "type": "SearchList"},
            {"name": "software engineer", "type": "SearchList"},
            {"name": "Django Flask", "type": "SearchList"},
            {"name": "Python LLM", "type": "SearchList"},
            {"name": "Revature", "type": "NoCompany"},
            {"name": "Dice", "type": "NoCompany"}
        ]
        
        for kw in defaultKeywords:
            # Check if keyword already exists
            existing = session.query(DiceKeyword).filter_by(name=kw["name"]).first()
            if not existing:
                keyword = DiceKeyword(name=kw["name"], type=kw["type"])
                session.add(keyword)
        
        session.commit()
        print("Dummy dice keywords created successfully")
        session.close()
        return True
    except Exception as e:
        print(f"Error creating dummy dice keywords: {e}")
        session.rollback()
        session.close()
        return False

# Example usage of the dummy data creator
if __name__ == "__main__":
    createDummyKeywords()
    keywords = getSearchKeywords()
    print("NoCompany Keywords:", keywords["noCompany"])
    print("SearchList Keywords:", keywords["searchList"]) 