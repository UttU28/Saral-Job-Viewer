import os
from flask import Flask, render_template, request, jsonify, redirect, url_for
from database import db, Job, Keyword, getSearchKeywords, addKeyword
from config import (
    CHROME_DRIVER_PATH,
    CHROME_APP_PATH,
    CHROME_USER_DATA_DIR,
    DEBUGGING_PORT,
    DATABASE_URL,
)
import ast
from datetime import datetime
import subprocess
from sqlalchemy.exc import OperationalError


app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db.init_app(app)

# Function to update the config file with new values
def update_config_file(key, value):
    with open("config.py", "r") as file:
        lines = file.readlines()

    with open("config.py", "w") as file:
        for line in lines:
            if line.startswith(key):
                file.write(f"{key} = {value}\n")
            else:
                file.write(line)


@app.route("/")
def index():
    page = request.args.get("page", 1, type=int)
    per_page = 10

    try:
        jobs = Job.query.paginate(page=page, per_page=per_page, error_out=False)
    except OperationalError:
        # If the table doesn't exist, create it and return an empty list
        db.create_all()
        jobs = []
        pagination = None
    else:
        pagination = jobs
        jobs = jobs.items

    return render_template("index.html", jobs=jobs, pagination=pagination)


@app.route("/update-applied-status/<job_id>/<status>", methods=["POST"])
def update_applied_status(job_id, status):
    # Update the job's 'applied' status
    job = db.session.get(Job, job_id)
    if job:
        job.applied = status
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"success": False})


@app.route("/run-scraper", methods=["POST"])
def run_scraper():
    try:
        # Run the dataScraping.py script
        subprocess.run(["python", "dataScraping.py"], check=True)
        return jsonify({"success": True})
    except subprocess.CalledProcessError as e:
        print(f"Error running scraper: {e}")
        return jsonify({"success": False})


@app.route("/search-settings", methods=["GET", "POST"])
def search_settings():
    if request.method == "POST":
        category = request.form.get("category")
        keyword = request.form.get("keyword")
        if category and keyword:
            addKeyword(category, keyword)
        return redirect(url_for("search_settings"))

    keywords = getSearchKeywords()
    return render_template("search_settings.html", keywords=keywords)


@app.route("/remove-keyword", methods=["POST"])
def remove_keyword():
    data = request.json
    category = data.get("category")
    keyword = data.get("keyword")
    print(f"cat: {category}, key: {keyword}")
    if category and keyword:
        keyword_to_remove = Keyword.query.filter_by(
            category=category, keyword=keyword
        ).first()
        if keyword_to_remove:
            db.session.delete(keyword_to_remove)
            db.session.commit()
            return jsonify({"success": True})

    return jsonify({"success": False})


# Route for settings page to configure the configuration variables
@app.route("/settings", methods=["GET", "POST"])
def settings():
    if request.method == "POST":
        # Update each field in the config.py file with the new value
        config_data = {
            "CHROME_DRIVER_PATH": request.form.get("CHROME_DRIVER_PATH"),
            "CHROME_APP_PATH": request.form.get("CHROME_APP_PATH"),
            "CHROME_USER_DATA_DIR": request.form.get("CHROME_USER_DATA_DIR"),
            "DEBUGGING_PORT": request.form.get("DEBUGGING_PORT"),
        }

        for key, value in config_data.items():
            update_config_file(key, repr(value))

        return render_template("settings.html", success=True, config=config_data)

    # Pass the current config values to the settings page
    config_data = {
        "CHROME_DRIVER_PATH": CHROME_DRIVER_PATH,
        "CHROME_APP_PATH": CHROME_APP_PATH,
        "CHROME_USER_DATA_DIR": CHROME_USER_DATA_DIR,
        "DEBUGGING_PORT": DEBUGGING_PORT,
    }

    return render_template("settings.html", config=config_data)


@app.template_filter("unix_to_datetime")
def unix_to_datetime(timestamp):
    return datetime.fromtimestamp(float(timestamp)).strftime("%Y-%m-%d %H:%M:%S")


if __name__ == "__main__":
    app.run(debug=True)
