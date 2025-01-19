#!/bin/bash

# Define the application directory and related paths
APP_DIR="/home/robada/Desktop/LinkedIn-Saral-Apply"
PYTHON_SCRIPT="$APP_DIR/app.py"
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

# Function to terminate any previous ngrok processes
terminate_previous_ngrok() {
    echo "Checking for previous ngrok sessions..."
    ngrok_pid=$(pgrep -f "ngrok.*http.*lucky-adjusted-possum.ngrok-free.app")
    if [ -n "$ngrok_pid" ]; then
        echo "Terminating previous ngrok session with PID $ngrok_pid..."
        kill -9 "$ngrok_pid"
        echo "Previous ngrok session terminated."
    else
        echo "No previous ngrok sessions found."
    fi
}

# Function to terminate the last session of the app if it's already running
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

# Function to run the FastAPI application
run_app() {
    echo "Starting the FastAPI application..."
    source "$VENV_DIR/bin/activate"
    uvicorn app:app --host 0.0.0.0 --port 5000 --reload &
    APP_PID=$! # Store the PID of the FastAPI server
    echo "FastAPI application started on http://0.0.0.0:5000 with PID $APP_PID"
}

# Function to run ngrok
run_ngrok() {
    echo "Starting ngrok to expose the FastAPI application..."
    ngrok http --hostname=lucky-adjusted-possum.ngrok-free.app 5000 &
    NGROK_PID=$! # Store the PID of ngrok
    echo "ngrok started exposing http://lucky-adjusted-possum.ngrok-free.app with PID $NGROK_PID"
}

# Function to handle cleanup on script exit
cleanup() {
    echo "Stopping application and ngrok..."
    if [ -n "$APP_PID" ]; then
        kill -9 "$APP_PID" 2>/dev/null
        echo "FastAPI application stopped."
    fi
    if [ -n "$NGROK_PID" ]; then
        kill -9 "$NGROK_PID" 2>/dev/null
        echo "ngrok stopped."
    fi
}

# Trap script termination signals to ensure cleanup
trap cleanup EXIT

# Main execution
echo "Starting the application..."
setup_venv
terminate_previous_session
terminate_previous_ngrok
run_app
run_ngrok
echo "Application and ngrok are running. Press Ctrl+C to stop."

# Wait for background processes to finish
wait
