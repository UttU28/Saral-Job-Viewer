#!/bin/bash

# Define the port to listen on
PORT=12345

# Define the script path
SCRAPER_SCRIPT="/home/robada/Desktop/LinkedIn-Saral-Apply/scrapeKar.sh"

# Create a named pipe for netcat to use
PIPE="/tmp/scriptpipe"
mkfifo "$PIPE"

echo "Starting listener on port $PORT..."

while true; do
    # Listen for incoming connections from any IP (0.0.0.0)
    nc -l 0.0.0.0 "$PORT" < "$PIPE" | while read command; do
        if [ "$command" = "run_scraper" ]; then
            echo "Received command to run scraper"
            # Execute the scraper script
            /bin/bash "$SCRAPER_SCRIPT" &
            echo "Script started" > "$PIPE"
        fi
    done
done 