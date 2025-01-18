from sqlalchemy import create_engine, Column, String, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()

class JobPosting(Base):
    __tablename__ = "bhawishya_wani"

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


engine = create_engine("sqlite:///database.db", echo=True)


Base.metadata.create_all(engine)

Session = sessionmaker(bind=engine)


def addTheJob(
    id,
    jobLink,
    jobTitle,
    companyName,
    jobLocation,
    jobMethod,
    timeStamp,
    jobType,
    jobDescription,
    applied
):
    session = Session()

    existing_entry = session.query(JobPosting).filter_by(id=id).first()

    if existing_entry is None:
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

    session.close()


def checkTheJob(id):
    session = Session()
    existing_entry = session.query(JobPosting).filter_by(id=id).first()
    session.close()
    if existing_entry is None:
        return True
    return False
