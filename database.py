from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


# Database Model
class Job(db.Model):
    __tablename__ = "jobs"
    id = db.Column(db.String, primary_key=True)
    link = db.Column(db.Text)
    title = db.Column(db.Text)
    companyName = db.Column(db.Text)
    location = db.Column(db.Text)
    method = db.Column(db.Text)
    timeStamp = db.Column(db.Text)
    jobType = db.Column(db.Text)
    jobDescription = db.Column(db.Text)
    applied = db.Column(db.Text)


class Keyword(db.Model):
    __tablename__ = "keywords"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    category = db.Column(db.String, nullable=False)  # "noCompany" or "searchList"
    keyword = db.Column(db.String, nullable=False)


# Function to add a new job to the database
def addTheJob(jobId, jobLink, jobTitle, companyName, jobLocation, applyMethod, timeStamp, jobType, jobDescription, applied):
    """
    Adds a new job to the database if it doesn't already exist.

    :param job_data: Dictionary containing job information. Keys:
                     - id, link, title, companyName, location,
                       method, timeStamp, jobType, jobDescription, applied
    """
    existing_job = Job.query.get(jobId)
    if not existing_job:
        new_job = Job(
            id=jobId,
            link=jobLink,
            title=jobTitle,
            companyName=companyName,
            location=jobLocation,
            method=applyMethod,
            timeStamp=timeStamp,
            jobType=jobType,
            jobDescription=jobDescription,
            applied=applied,
        )
        db.session.add(new_job)
        db.session.commit()
        print(f"Job '{jobTitle}' added to the database.")
    else:
        print(f"Job '{jobTitle}' already exists in the database.")


# Function to check if a job exists in the database
def checkTheJob(job_id):
    """
    Checks if a job with the given ID exists in the database.

    :param job_id: The ID of the job to check.
    :return: True if the job exists, False otherwise.
    """
    existing_job = Job.query.get(job_id)
    return existing_job is not None


def addKeyword(category, keyword):
    """
    Adds a keyword to the database under a specific category.

    :param category: The category of the keyword (e.g., "noCompany" or "searchList").
    :param keyword: The keyword to add.
    """
    if category not in ["noCompany", "searchList"]:
        raise ValueError("Invalid category. Use 'noCompany' or 'searchList'.")

    # Check if the keyword already exists in the same category
    existing_keyword = Keyword.query.filter_by(
        category=category, keyword=keyword
    ).first()
    if not existing_keyword:
        new_keyword = Keyword(category=category, keyword=keyword)
        db.session.add(new_keyword)
        db.session.commit()
        print(f"Keyword '{keyword}' added to category '{category}'.")
    else:
        print(f"Keyword '{keyword}' already exists in category '{category}'.")


def getSearchKeywords():
    """
    Retrieves keywords from the database, categorized into 'noCompany' and 'searchList'.

    :return: A dictionary with two lists:
             - 'noCompany': Keywords to exclude companies.
             - 'searchList': Keywords for job searches.
    """
    no_company_keywords = [
        k.keyword for k in Keyword.query.filter_by(category="noCompany").all()
    ]
    search_list_keywords = [
        k.keyword for k in Keyword.query.filter_by(category="searchList").all()
    ]

    return {"noCompany": no_company_keywords, "searchList": search_list_keywords}
