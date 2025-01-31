import logging
import os
import json
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

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

class EasyApply(Base):
    __tablename__ = "easyApplyData"

    id = Column(Integer, primary_key=True, autoincrement=True)
    jobID = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow)

# Create all tables if they don't already exist
Base.metadata.create_all(engine)

def getSession():
    return Session()

def getAllEasyApply():
    session = getSession()
    try:
        return session.query(EasyApply).all()
    except Exception as e:
        logging.error(f"Error fetching Easy Apply entries: {e}")
        return []
    finally:
        session.close()

def getPendingEasyApplyJobs():
    session = getSession()
    try:
        pending_jobs = session.query(EasyApply).filter(
            EasyApply.status == "PENDING"
        ).all()
        return [str(job.jobID) for job in pending_jobs]
    except Exception as e:
        logging.error(f"Error fetching pending Easy Apply jobs: {e}")
        return []
    finally:
        session.close()

def updateEasyApplyStatus(jobId: str, success: str):
    session = getSession()
    try:
        job = session.query(EasyApply).filter(
            EasyApply.jobID == jobId
        ).first()
        
        if job:
            job.status = success if success else "FAILED"
            session.commit()
            logging.info(f"Updated job {jobId} status to {job.status}")
            return True
        else:
            logging.warning(f"Job {jobId} not found in EasyApply table")
            return False
    except Exception as e:
        session.rollback()
        logging.error(f"Error updating Easy Apply status: {e}")
        return False
    finally:
        session.close()
