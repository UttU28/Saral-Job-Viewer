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

# Function to load environment variables from a .env file
load_env_file() {
    ENV_FILE="$FRONTEND_DIR/.env"

    if [ -f "$ENV_FILE" ]; then
        echo "Loading environment variables from $ENV_FILE..."
        export $(grep -v '^#' "$ENV_FILE" | xargs)
        echo "Environment variables loaded successfully."
    else
        echo "Warning: No .env file found in $FRONTEND_DIR. Proceeding without it."
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

# Function to build the project for production
build_frontend() {
    echo "Building the frontend application for production..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "Error: Frontend build failed."
        exit 1
    fi
    echo "Frontend application built successfully."
}

# Function to serve the built project
serve_frontend() {
    echo "Serving the frontend application in production mode..."
    npm install -g serve
    serve -s build -l 0.0.0.0:3000 &
    if [ $? -ne 0 ]; then
        echo "Error: Failed to serve the frontend application."
        exit 1
    fi
    echo "Frontend application is now accessible on the network at port 3000."
}

# Main execution
echo "Starting frontend setup..."
check_frontend_dir
load_env_file
install_npm_dependencies
build_frontend
serve_frontend
