#!/bin/bash

# Define the application directory and script paths
APP_DIR="/home/robada/Desktop/LinkedIn-Saral-Apply"
SCRAPING_SCRIPT="$APP_DIR/services/dataScraping.sh"
APPLY_SCRIPT="$APP_DIR/services/easyApply.sh"
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
    for script in "$SCRAPING_SCRIPT" "$APPLY_SCRIPT"; do
        if [ ! -f "$script" ]; then
            echo "Error: Script not found at $script"
            exit 1
        fi
        
        if [ ! -x "$script" ]; then
            echo "Making script executable..."
            chmod +x "$script"
        fi
    done
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

# Function to get minutes until next apply run
get_minutes_until_next_apply() {
    current_hour=$(date +%H)
    current_minute=$(date +%M)
    
    # Skip if current hour is 0, 6, 12, or 18
    if [[ $current_hour == 0 || $current_hour == 6 || $current_hour == 12 || $current_hour == 18 ]]; then
        # Wait until next hour
        echo $((60 - current_minute))
    else
        # If we're in the middle of an hour, wait for remaining minutes
        if [ $current_minute -eq 0 ]; then
            echo "0"
        else
            echo $((60 - current_minute))
        fi
    fi
}

# Function to run the scraping script
run_scraping() {
    echo "Starting scraping job at $(date)"
    "$SCRAPING_SCRIPT" 2>&1
    echo "Scraping job completed at $(date)"
}

# Function to run the apply script
run_apply() {
    echo "Starting apply job at $(date)"
    "$APPLY_SCRIPT" 2>&1
    echo "Apply job completed at $(date)"
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

# Initialize last run times
last_apply_hour=-1

while true; do
    current_hour=$(date +%H)
    current_minute=$(date +%M)
    
    # Check if it's time for scraping
    minutes_to_scraping=$(get_minutes_until_next_scraping)
    next_scraping=$(date -d "+$minutes_to_scraping minutes" "+%Y-%m-%d %H:%M:%S")
    echo "Next scraping scheduled for: $next_scraping"
    
    # Check if it's time for apply
    minutes_to_apply=$(get_minutes_until_next_apply)
    next_apply=$(date -d "+$minutes_to_apply minutes" "+%Y-%m-%d %H:%M:%S")
    echo "Next apply scheduled for: $next_apply"
    
    # Determine which wait time is shorter
    wait_time=$((minutes_to_apply < minutes_to_scraping ? minutes_to_apply : minutes_to_scraping))
    echo "Waiting $wait_time minutes..."
    
    # Sleep until next action
    sleep $((wait_time * 60))
    
    # Check which script(s) to run
    current_hour=$(date +%H)
    
    # Run scraping if it's time (00:00, 06:00, 12:00, 18:00)
    if [[ $current_hour == 0 || $current_hour == 6 || $current_hour == 12 || $current_hour == 18 ]] && [ $(date +%M) -eq 0 ]; then
        run_scraping
    fi
    
    # Run apply if it's not a scraping hour and we haven't run in this hour
    if [[ $current_hour != 0 && $current_hour != 6 && $current_hour != 12 && $current_hour != 18 ]] && [ $current_hour != $last_apply_hour ]; then
        run_apply
        last_apply_hour=$current_hour
    fi
done 