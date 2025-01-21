#!/bin/bash

# Define the application directory and frontend directory
APP_DIR="/home/robada/Desktop/LinkedIn-Saral-Apply"
FRONTEND_DIR="$APP_DIR/frontend"

# Function to validate the presence of frontend directory
check_frontend_dir() {
    if [ ! -d "$FRONTEND_DIR" ]; then
        echo "Error: Frontend directory not found at $FRONTEND_DIR" >&2
        exit 1
    fi
}

# Function to load environment variables from a .env file
load_env_file() {
    ENV_FILE="$FRONTEND_DIR/.env"

    if [ -f "$ENV_FILE" ]; then
        echo "Loading environment variables from $ENV_FILE..."
        export $(grep -v '^#' "$ENV_FILE" | xargs)
        echo "Environment variables loaded successfully."
    else
        echo "Warning: No .env file found in $FRONTEND_DIR. Proceeding without it." >&2
    fi
}

# Function to install npm dependencies (only if not already installed)
install_npm_dependencies() {
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
        echo "npm dependencies installed successfully."
    else
        echo "npm dependencies already installed. Skipping installation."
    fi
}

# Function to ensure Vite is installed
verify_vite_installation() {
    echo "Verifying Vite installation..."
    if ! npx vite --version &>/dev/null; then
        echo "Vite is not installed. Installing Vite..."
        npm install vite --save-dev
        if [ $? -ne 0 ]; then
            echo "Error: Failed to install Vite." >&2
            exit 1
        fi
        echo "Vite installed successfully."
    else
        echo "Vite is already installed."
    fi
}

# Function to run the app in development mode
run_dev_frontend() {
    echo "Running the frontend application in development mode..."
    npx vite --port 3000 --host 0.0.0.0
    if [ $? -ne 0 ]; then
        echo "Error: Failed to start the frontend application in development mode." >&2
        exit 1
    fi
}

# Main execution
echo "Starting frontend setup..."
check_frontend_dir
load_env_file
install_npm_dependencies
verify_vite_installation
run_dev_frontend
