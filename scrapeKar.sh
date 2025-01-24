#!/bin/bash

# Define the application directory and related paths
APP_DIR="/home/robada/Desktop/LinkedIn-Saral-Apply"
PYTHON_SCRIPT="$APP_DIR/dataScraping.py"
VENV_DIR="$APP_DIR/env"
REQUIREMENTS_FILE="$APP_DIR/requirements.txt"
ENV_FILE="$APP_DIR/.env"

# Load environment variables from the .env file
if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | xargs)
else
    echo "Error: .env file not found at $ENV_FILE"
    exit 1
fi

# Validate that necessary environment variables are set
if [[ -z "$CHROME_DRIVER_PATH" || -z "$CHROME_APP_PATH" || -z "$CHROME_USER_DATA_DIR" || -z "$DEBUGGING_PORT" || -z "$DATABASE_URL" ]]; then
    echo "Error: One or more environment variables are missing in the .env file."
    exit 1
fi

# Get the current X session user
X_USER=$(who | grep -m1 '(:0)' | cut -d' ' -f1)
export DISPLAY=:0
export XAUTHORITY=/home/$X_USER/.Xauthority

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
        echo "Requirements file $REQUIREMENTS_FILE not found. Skipping dependency installation."
    fi
}

# Function to check and kill Chrome instances running on the configured port
kill_chrome_on_port() {
    echo "Checking for Chrome instances on port $DEBUGGING_PORT..."
    chrome_pids=$(lsof -i :$DEBUGGING_PORT | awk 'NR>1 {print $2}')
    if [ -n "$chrome_pids" ]; then
        echo "Killing Chrome instances on port $DEBUGGING_PORT..."
        echo "$chrome_pids" | xargs kill -9
        echo "Chrome instances killed."
    else
        echo "No Chrome instances found on port $DEBUGGING_PORT."
    fi
}

# Function to check and terminate the last session of the script
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

# Function to run the Python script
run_script() {
    echo "Starting the Python script..."
    source "$VENV_DIR/bin/activate"
    
    # Ensure we're running as the correct user for X session access
    if [ "$(whoami)" = "root" ]; then
        echo "Running script as $X_USER..."
        su - $X_USER -c "DISPLAY=:0 XAUTHORITY=/home/$X_USER/.Xauthority python3 '$PYTHON_SCRIPT'"
    else
        python3 "$PYTHON_SCRIPT"
    fi
    echo "Python script started."
}

# Function to cleanup and terminate all processes
cleanup() {
    echo "Cleaning up processes..."
    # Kill the Python script if it's running
    if pgrep -f "$PYTHON_SCRIPT" > /dev/null; then
        pkill -f "$PYTHON_SCRIPT"
        echo "Python script terminated."
    fi
    
    # Kill any Chrome instances on the debugging port
    kill_chrome_on_port
    
    # Deactivate virtual environment if active
    if [ -n "$VIRTUAL_ENV" ]; then
        deactivate
        echo "Virtual environment deactivated."
    fi
}

# Main execution
echo "Starting job..."
setup_venv
kill_chrome_on_port
terminate_previous_session
run_script
echo "Waiting for script to complete..."
wait
cleanup
echo "Job completed."
