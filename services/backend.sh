#!/bin/bash

# Define the application directory and related paths
APP_DIR="/home/robada/Desktop/Saral-Job-Viewer"
PYTHON_SCRIPT="$APP_DIR/app.py"
VENV_DIR="$APP_DIR/env"
REQUIREMENTS_FILE="$APP_DIR/requirements.txt"
ENV_FILE="$APP_DIR/.env"

# Load environment variables from the .env file
load_env_file() {
    if [ -f "$ENV_FILE" ]; then
        echo "Loading environment variables from $ENV_FILE..."
        export $(grep -v '^#' "$ENV_FILE" | xargs)
        echo "Environment variables loaded successfully."
    else
        echo "Error: .env file not found at $ENV_FILE" >&2
        exit 1
    fi
}

# Function to create and activate the virtual environment if not present
setup_venv() {
    if [ ! -d "$VENV_DIR" ]; then
        echo "Virtual environment not found. Creating one..."
        # Ensure python3-full is installed first
        sudo apt-get install -y python3-full
        python3 -m venv "$VENV_DIR"
        echo "Virtual environment created at $VENV_DIR."
    fi
    echo "Activating virtual environment..."
    source "$VENV_DIR/bin/activate"
    echo "Virtual environment activated."
    
    if [ -f "$REQUIREMENTS_FILE" ]; then
        echo "Installing dependencies from $REQUIREMENTS_FILE..."
        "$VENV_DIR/bin/pip" install --upgrade pip
        "$VENV_DIR/bin/pip" install -r "$REQUIREMENTS_FILE"
        echo "Dependencies installed."
    else
        echo "Requirements file $REQUIREMENTS_FILE not found. Skipping dependency installation." >&2
    fi
}

# Function to check and terminate the last session
terminate_previous_session() {
    echo "Checking for previous application sessions..."
    app_pid=$(pgrep -f "uvicorn.*app:app")
    if [ -n "$app_pid" ]; then
        echo "Terminating previous application session with PID $app_pid..."
        kill -9 "$app_pid"
        echo "Previous application session terminated."
    else
        echo "No previous application session found."
    fi
}

# Function to run the script
run_script() {
    echo "Starting the FastAPI application..."
    source "$VENV_DIR/bin/activate"
    "$VENV_DIR/bin/uvicorn" app:app --host 0.0.0.0 --port 5000 --reload &
    APP_PID=$!
    echo "FastAPI application started on http://0.0.0.0:5000 with PID $APP_PID"
}

# Function to cleanup processes
cleanup() {
    echo "Stopping application..."
    if [ -n "$APP_PID" ]; then
        kill -9 "$APP_PID" 2>/dev/null
        echo "FastAPI application stopped."
    fi
}

# Trap script termination signals
trap cleanup EXIT

# Main execution
echo "Starting the application..."
load_env_file
setup_venv
terminate_previous_session
run_script
echo "Application is running. Press Ctrl+C to stop."

wait
