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

# Function to install npm dependencies
install_npm_dependencies() {
    echo "Navigating to frontend directory..."
    cd "$FRONTEND_DIR" || exit

    echo "Installing npm dependencies..."
    if ! command -v npm &>/dev/null; then
        echo "Error: npm is not installed. Please install Node.js and npm before proceeding."
        exit 1
    fi
    npm install
    echo "npm dependencies installed successfully."
}

# Function to run the app in development mode
run_dev_frontend() {
    echo "Running the frontend application in development mode on port 3000..."
    npm run dev -- --port 3000 --host 0.0.0.0 &
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
echo "Frontend setup completed successfully. Access the application on your network."
