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
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL, echo=False)  # Disable SQLAlchemy echo

# Create tables if they don't exist
Base.metadata.create_all(engine)

# Configure session maker
Session = sessionmaker(bind=engine)


def get_session():
    """Get a new session."""
    return Session()


def add_the_job(
    id: str,
    job_link: str,
    job_title: str,
    company_name: str,
    job_location: str,
    job_method: str,
    time_stamp: str,
    job_type: str,
    job_description: str,
    applied: str,
):
    """Adds a job posting to the database if it doesn't already exist."""
    session = get_session()
    try:
        # Check if the entry exists
        existing_entry = session.query(JobPosting).filter_by(id=id).first()
        if existing_entry is None:
            # Create a new entry
            new_entry = JobPosting(
                id=id,
                link=job_link,
                title=job_title,
                companyName=company_name,
                location=job_location,
                method=job_method,
                timeStamp=time_stamp,
                jobType=job_type,
                jobDescription=job_description,
                applied=applied,
            )
            session.add(new_entry)
            session.commit()
            print(f"Entry with ID {id} added.")
        else:
            print(f"Entry with ID {id} already exists. Ignoring the new entry.")
    except IntegrityError as e:
        session.rollback()
        print(f"IntegrityError: Could not add job with ID {id}. Reason: {e}")
    except Exception as e:
        session.rollback()
        print(f"Error: Could not add job with ID {id}. Reason: {e}")
    finally:
        session.close()


def check_the_job(id: str) -> bool:
    """Checks if a job posting with the given ID exists in the database."""
    session = get_session()
    try:
        existing_entry = session.query(JobPosting).filter_by(id=id).first()
        return existing_entry is None
    finally:
        session.close()


def get_all_jobs():
    """Fetches all job postings."""
    session = get_session()
    try:
        return session.query(JobPosting).all()
    finally:
        session.close()


def get_all_keywords():
    """Fetches all keywords."""
    session = get_session()
    try:
        return session.query(Keyword).all()
    finally:
        session.close()


def add_keyword(name: str, type: str):
    """Adds a new keyword to the database."""
    session = get_session()
    try:
        new_keyword = Keyword(name=name, type=type)
        session.add(new_keyword)
        session.commit()
        session.refresh(new_keyword)
        return new_keyword
    except Exception as e:
        session.rollback()
        print(f"Error: Could not add keyword. Reason: {e}")
    finally:
        session.close()


def remove_keyword(keyword_id: int):
    """Removes a keyword from the database by ID."""
    session = get_session()
    try:
        keyword = session.query(Keyword).filter(Keyword.id == keyword_id).first()
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


def update_job_status(job_id: str, applied_status: str):
    """Updates the applied status of a job posting."""
    session = get_session()
    try:
        job = session.query(JobPosting).filter(JobPosting.id == job_id).first()
        if job:
            job.applied = applied_status
            session.commit()
            return job
        else:
            return None
    except Exception as e:
        session.rollback()
        print(f"Error: Could not update job status. Reason: {e}")
    finally:
        session.close()


def add_to_easy_apply(job_id: int, user_name: str, status: str):
    session = get_session()
    try:
        new_entry = EasyApply(jobID=job_id, userName=user_name, status=status)
        session.add(new_entry)
        session.commit()
        session.refresh(new_entry)
        return new_entry
    except Exception as e:
        session.rollback()
        print(f"Error: Could not add to easy apply. Reason: {e}")
    finally:
        session.close()

def get_all_easy_apply():
    session = get_session()
    try:
        return session.query(EasyApply).all()
    finally:
        session.close()