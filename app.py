import os
from flask import Flask, render_template, request, jsonify
from database import db, Job
from config import (
    CHROME_DRIVER_PATH,
    CHROME_APP_PATH,
    CHROME_USER_DATA_DIR,
    DEBUGGING_PORT,
    DATABASE_URL,
)
import ast

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


# Route for the home page
@app.route("/")
def index():
    jobs = Job.query.all()
    return render_template("index.html", jobs=jobs)


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


if __name__ == "__main__":
    app.run(debug=True)
