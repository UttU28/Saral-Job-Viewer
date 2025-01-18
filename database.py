from sqlalchemy import create_engine, Column, String, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()

class BhawishyaWani(Base):
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


engine = create_engine("sqlite:///bhawishyaWani.db", echo=True)


Base.metadata.create_all(engine)

Session = sessionmaker(bind=engine)


def addBhawishyaWani(
    id,
    jobLink,
    jobTitle,
    companyName,
    jobLocation,
    jobMethod,
    timeStamp,
    jobType,
    jobDescription,
):
    session = Session()

    existing_entry = session.query(BhawishyaWani).filter_by(id=id).first()

    if existing_entry is None:
        new_entry = BhawishyaWani(
            id=id,
            link=jobLink,
            title=jobTitle,
            companyName=companyName,
            location=jobLocation,
            method=jobMethod,
            timeStamp=timeStamp,
            jobType=jobType,
            jobDescription=jobDescription,
        )
        session.add(new_entry)
        session.commit()
        print(f"Entry with ID {id} added.")
    else:
        print(f"Entry with ID {id} already exists. Ignoring the new entry.")

    session.close()


def checkBhawishyaWani(id):
    session = Session()
    existing_entry = session.query(BhawishyaWani).filter_by(id=id).first()
    session.close()
    if existing_entry is None:
        return True
    return False
