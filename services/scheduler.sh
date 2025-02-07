#!/bin/bash

# Define the application directory and script paths
APP_DIR="/home/robada/Desktop/Saral-Job-Viewer"
SCRAPING_SCRIPT="$APP_DIR/services/linkedInScraping.sh"
LOG_FILE="$APP_DIR/scheduler.log"

# Function to log messages to both console and log file
log_message() {
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

# Redirect all stdout and stderr to both console and log file
exec 1> >(while read -r line; do log_message "$line"; done)
exec 2> >(while read -r line; do log_message "ERROR: $line"; done)

# Function to check if scripts exist and are executable
check_scripts() {
    if [ ! -f "$SCRAPING_SCRIPT" ]; then
        echo "Error: Script not found at $SCRAPING_SCRIPT"
        exit 1
    fi
    
    if [ ! -x "$SCRAPING_SCRIPT" ]; then
        echo "Making script executable..."
        chmod +x "$SCRAPING_SCRIPT"
    fi
}

# Function to get minutes until next scraping run
get_minutes_until_next_scraping() {
    current_hour=$(date +%H)
    current_minute=$(date +%M)
    
    # Convert current time to minutes since midnight
    current_time_minutes=$((current_hour * 60 + current_minute))
    
    # Define scraping run times in minutes since midnight
    run_times=(0 360 720 1080)  # 00:00, 06:00, 12:00, 18:00
    
    # Find next run time
    for run_time in "${run_times[@]}"; do
        if [ $run_time -gt $current_time_minutes ]; then
            echo $((run_time - current_time_minutes))
            return
        fi
    done
    
    # If we're past the last run time, calculate minutes until midnight
    echo $((1440 - current_time_minutes))
}

# Function to run the scraping script
run_scraping() {
    echo "Starting scraping job at $(date)"
    "$SCRAPING_SCRIPT" 2>&1
    echo "Scraping job completed at $(date)"
}

# Function to cleanup on exit
cleanup() {
    echo "Scheduler stopping..."
    echo "Log file location: $LOG_FILE"
    exit 0
}

# Trap script termination signals
trap cleanup EXIT

# Main execution
echo "Starting scheduler..."
check_scripts

while true; do
    # Check if it's time for scraping
    minutes_to_scraping=$(get_minutes_until_next_scraping)
    next_scraping=$(date -d "+$minutes_to_scraping minutes" "+%Y-%m-%d %H:%M:%S")
    echo "Next scraping scheduled for: $next_scraping"
    
    echo "Waiting $minutes_to_scraping minutes..."
    
    # Sleep until next action
    sleep $((minutes_to_scraping * 60))
    
    current_minute=$(date +%M)
    current_hour=$(date +%H)
    
    # Run scraping if it's time (00:00, 06:00, 12:00, 18:00)
    if [[ $current_hour == 0 || $current_hour == 6 || $current_hour == 12 || $current_hour == 18 ]] && [ $current_minute -eq 0 ]; then
        run_scraping
    fi
done 