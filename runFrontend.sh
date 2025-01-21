#!/bin/bash

# Define the application directory and frontend directory
APP_DIR="/home/robada/Desktop/LinkedIn-Saral-Apply"
FRONTEND_DIR="$APP_DIR/frontend"

# Function to validate the presence of frontend directory
check_frontend_dir() {
    if [ ! -d "$FRONTEND_DIR" ]; then
        echo "Error: Frontend directory not found at $FRONTEND_DIR"
        exit 1
    fi
}

# Function to install npm dependencies (only if not already installed)
install_npm_dependencies() {
    echo "Navigating to frontend directory..."
    cd "$FRONTEND_DIR" || exit

    echo "Checking for existing npm dependencies..."
    if [ ! -d "node_modules" ]; then
        echo "Installing npm dependencies..."
        npm install
        echo "npm dependencies installed successfully."
    else
        echo "npm dependencies already installed. Skipping installation."
    fi
}

# Function to run the app in development mode
run_dev_frontend() {
    echo "Running the frontend application in development mode on port 3000..."
    npm run dev -- --port 3000 --host 0.0.0.0
    if [ $? -ne 0 ]; then
        echo "Error: Failed to start the frontend application in development mode."
        exit 1
    fi
    echo "Frontend application is running in development mode on port 3000."
}

# Main execution
echo "Starting frontend setup..."
check_frontend_dir
install_npm_dependencies
run_dev_frontend
