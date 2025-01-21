from database import db, Job
from app import app

with app.app_context():
    db.create_all()

    # Add sample data
    sample_job = Job(
        id="2",
        link="https://example.com/job1",
        title="Software Engineer",
        companyName="Tech Corp",
        location="Remote",
        method="Online",
        timeStamp="2025-01-20",
        jobType="Full-Time",
        jobDescription="Develop and maintain software solutions.",
        applied="No",
    )

    db.session.add(sample_job)
    db.session.commit()
    print("Database initialized with sample data!")
