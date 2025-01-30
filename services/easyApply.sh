#!/bin/bash

# Define the application directory and related paths
APP_DIR="/home/robada/Desktop/LinkedIn-Saral-Apply"
PYTHON_SCRIPT="$APP_DIR/easyApply.py"
VENV_DIR="$APP_DIR/env"
REQUIREMENTS_FILE="$APP_DIR/requirements.txt"
ENV_FILE="$APP_DIR/.env"

# Load environment variables from the .env file
load_env_file() {
    if [ -f "$ENV_FILE" ]; then
        echo "Loading environment variables from $ENV_FILE..."
        export $(grep -v '^#' "$ENV_FILE" | xargs)
        echo "Environment variables loaded successfully."
        # Set display for X server
        export DISPLAY=:0
    else
        echo "Error: .env file not found at $ENV_FILE" >&2
        exit 1
    fi

    # Validate that necessary environment variables are set
    if [[ -z "$CHROME_DRIVER_PATH" || -z "$CHROME_APP_PATH" || -z "$APPLYING_CHROME_DIR" || -z "$APPLYING_PORT" || -z "$DATABASE_URL" ]]; then
        echo "Error: One or more environment variables are missing in the .env file." >&2
        exit 1
    fi
}

# Function to create and activate the virtual environment if not present
setup_venv() {
    if [ ! -d "$VENV_DIR" ]; then
        echo "Virtual environment not found. Creating one..."
        python3 -m venv "$VENV_DIR"
        echo "Virtual environment created at $VENV_DIR."
    fi
    echo "Activating virtual environment..."
    source "$VENV_DIR/bin/activate"
    echo "Virtual environment activated."
    
    if [ -f "$REQUIREMENTS_FILE" ]; then
        echo "Installing dependencies from $REQUIREMENTS_FILE..."
        pip install --upgrade pip
        pip install -r "$REQUIREMENTS_FILE"
        echo "Dependencies installed."
    else
        echo "Requirements file $REQUIREMENTS_FILE not found. Skipping dependency installation." >&2
    fi
}

# Function to check and kill Chrome instances running on the configured port
kill_chrome_on_port() {
    echo "Checking for Chrome instances on port $APPLYING_PORT..."
    chrome_pids=$(lsof -i :$APPLYING_PORT | awk 'NR>1 {print $2}')
    if [ -n "$chrome_pids" ]; then
        echo "Killing Chrome instances on port $APPLYING_PORT..."
        echo "$chrome_pids" | xargs kill -9
        echo "Chrome instances killed."
    else
        echo "No Chrome instances found on port $APPLYING_PORT."
    fi
}

# Function to check and terminate the last session
terminate_previous_session() {
    echo "Checking for previous script sessions..."
    script_pid=$(pgrep -f "$PYTHON_SCRIPT")
    if [ -n "$script_pid" ]; then
        echo "Terminating previous script session with PID $script_pid..."
        kill -9 "$script_pid"
        echo "Previous script session terminated."
    else
        echo "No previous script session found."
    fi
}

# Function to run the script
run_script() {
    echo "Starting the Python script..."
    source "$VENV_DIR/bin/activate"
    python3 "$PYTHON_SCRIPT" &
    echo "Python script started."
}

# Function to cleanup processes
cleanup() {
    echo "Cleaning up processes..."
    if pgrep -f "$PYTHON_SCRIPT" > /dev/null; then
        pkill -f "$PYTHON_SCRIPT"
        echo "Python script terminated."
    fi
    
    kill_chrome_on_port
    
    if [ -n "$VIRTUAL_ENV" ]; then
        deactivate
        echo "Virtual environment deactivated."
    fi
}

# Trap script termination signals
trap cleanup EXIT

# Main execution
echo "Starting job..."
load_env_file
setup_venv
kill_chrome_on_port
terminate_previous_session
run_script
echo "Waiting for script to complete..."
wait
cleanup
echo "Job completed."
exit 0 