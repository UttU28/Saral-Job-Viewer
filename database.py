import logging
from sqlalchemy import create_engine, Column, String, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
import os
from dotenv import load_dotenv


load_dotenv()

# Configure logging to show only errors
logging.basicConfig(level=logging.ERROR)
logging.getLogger('sqlalchemy.engine').setLevel(logging.ERROR)

# Use declarative base
Base = declarative_base()

# Define the JobPosting model
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


# Connect to the MySQL database
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL, echo=False)  # Disable SQLAlchemy echo

# Create tables if they don't exist
Base.metadata.create_all(engine)

# Configure session maker
Session = sessionmaker(bind=engine)


def addTheJob(
    id: str,
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
    """
    Adds a job posting to the database if it doesn't already exist.
    """
    session = Session()
    try:
        # Check if the entry exists
        existing_entry = session.query(JobPosting).filter_by(id=id).first()

        if existing_entry is None:
            # Create a new entry
            new_entry = JobPosting(
                id=id,
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


def checkTheJob(id: str) -> bool:
    """
    Checks if a job posting with the given ID exists in the database.
    """
    session = Session()
    try:
        existing_entry = session.query(JobPosting).filter_by(id=id).first()
        return existing_entry is None
    finally:
        session.close()
