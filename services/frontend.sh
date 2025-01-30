#!/bin/bash

# Define the application directory and related paths
APP_DIR="/home/robada/Desktop/LinkedIn-Saral-Apply"
FRONTEND_DIR="$APP_DIR/frontend"
ENV_FILE="$FRONTEND_DIR/.env"

# Load environment variables from the .env file
load_env_file() {
    if [ -f "$ENV_FILE" ]; then
        echo "Loading environment variables from $ENV_FILE..."
        export $(grep -v '^#' "$ENV_FILE" | xargs)
        echo "Environment variables loaded successfully."
    else
        echo "Warning: No .env file found in $FRONTEND_DIR. Proceeding without it." >&2
    fi
}

# Function to validate directories
check_directories() {
    if [ ! -d "$FRONTEND_DIR" ]; then
        echo "Error: Frontend directory not found at $FRONTEND_DIR" >&2
        exit 1
    fi
}

# Function to install dependencies
setup_dependencies() {
    echo "Navigating to frontend directory..."
    cd "$FRONTEND_DIR" || exit 1

    echo "Checking for existing npm dependencies..."
    if [ ! -d "node_modules" ]; then
        echo "Installing npm dependencies..."
        npm install
        if [ $? -ne 0 ]; then
            echo "Error: Failed to install npm dependencies." >&2
            exit 1
        fi
        echo "npm dependencies installed."
    else
        echo "npm dependencies already installed."
    fi

    echo "Verifying Vite installation..."
    if ! npx vite --version &>/dev/null; then
        echo "Installing Vite..."
        npm install vite --save-dev
        if [ $? -ne 0 ]; then
            echo "Error: Failed to install Vite." >&2
            exit 1
        fi
        echo "Vite installed."
    else
        echo "Vite already installed."
    fi
}

# Function to run the script
run_script() {
    echo "Running the frontend application..."
    npx vite --port 3000 --host 0.0.0.0
    if [ $? -ne 0 ]; then
        echo "Error: Failed to start the frontend application." >&2
        exit 1
    fi
}

# Main execution
echo "Starting frontend setup..."
check_directories
load_env_file
setup_dependencies
run_script
