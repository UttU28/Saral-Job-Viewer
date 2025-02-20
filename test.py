from sqlalchemy import create_engine, text
import json

# Database connection string
DATABASE_URL = "mysql+pymysql://utsav:root@10.0.0.17:3306/bhawishyaWani"

# Create SQLAlchemy engine
engine = create_engine(DATABASE_URL)

# Query and export data
with engine.connect() as connection:
    result = connection.execute(text("SELECT title, jobDescription, applied FROM allLinkedInJobs WHERE method = 'Manual'"))
    
    # Convert result to a list of dictionaries with only the required fields
    jobs = [dict(row._mapping) for row in result]

    # Save JSON file with only selected fields
    with open("manual_jobs_filtered.json", "w", encoding="utf-8") as json_file:
        json.dump(jobs, json_file, indent=4, ensure_ascii=False)

    print("Exported data to manual_jobs_filtered.json")
