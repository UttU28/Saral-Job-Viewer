from database import db, Job, Keyword
from app import app

with app.app_context():
    db.create_all()

    # Add sample data
    # sample_job = Job(
    #     id="3",
    #     link="https://example.com/job1",
    #     title="Software Engineer",
    #     companyName="Tech Corp",
    #     location="Remote",
    #     method="Online",
    #     timeStamp="2025-01-20",
    #     jobType="Full-Time",
    #     jobDescription="Develop and maintain software solutions.",
    #     applied="No",
    # )

    # db.session.add(sample_job)

    sample_keyword = Keyword(
        id=5,
        category="noCompany",
        keyword="Job via Dice",
    )
    db.session.add(sample_keyword)
    db.session.commit()
    print("Database initialized with sample data!")
