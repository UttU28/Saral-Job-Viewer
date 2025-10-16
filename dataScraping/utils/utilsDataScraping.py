import os
from dotenv import load_dotenv

# Import the database functions we need
from utils.utilsDatabase import getSession, Keyword, addJob as dbAddJob, JobPosting

# Load environment variables from .env file
load_dotenv()

# Add a new job posting - simplified wrapper
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
    try:
        result = dbAddJob(
            jobId=jobId,
            jobLink=jobLink,
            jobTitle=jobTitle,
            companyName=companyName,
            jobLocation=jobLocation,
            jobMethod=jobMethod,
            timeStamp=timeStamp,
            jobType=jobType,
            jobDescription=jobDescription,
            applied=applied,
            aiProcessed=aiProcessed,
            aiTags=aiTags
        )
        if result:
            print(f"Entry with ID {jobId} added.")
            return True
        else:
            print(f"Entry with ID {jobId} already exists. Ignoring.")
            return False
    except Exception as e:
        print(f"Error: Could not add job with ID {jobId}. Reason: {e}")
        return False

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
            if keyword.type.lower() == "no" or keyword.type.lower() == "nocompany":
                excludedCompanies.append(keyword.name)
            elif keyword.type.lower() == "yes" or keyword.type.lower() == "searchlist":
                searchList.append(keyword.name)
        
        session.close()
        return {"noCompany": excludedCompanies, "searchList": searchList}
    except Exception as e:
        print(f"Error getting keywords: {e}")
        return {"noCompany": [], "searchList": []}

# Initialize keywords for scraping if none exist
def createDummyKeywords():
    try:
        session = getSession()
        
        # Add default keywords for scraping
        defaultKeywords = [
            {"name": "Python developer", "type": "SearchList"},
            {"name": "backend developer", "type": "SearchList"},
            {"name": "software engineer", "type": "SearchList"},
            {"name": "Google", "type": "NoCompany"},
            {"name": "Meta", "type": "NoCompany"}
        ]
        
        for kw in defaultKeywords:
            # Check if keyword already exists
            existing = session.query(Keyword).filter_by(name=kw["name"]).first()
            if not existing:
                keyword = Keyword(name=kw["name"], type=kw["type"])
                session.add(keyword)
        
        session.commit()
        print("Default scraping keywords created successfully")
        session.close()
        return True
    except Exception as e:
        print(f"Error creating default keywords: {e}")
        session.rollback()
        session.close()
        return False