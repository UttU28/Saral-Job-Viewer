#!/bin/bash

# PM2 Deploy script for Saral Job Viewer Backend
echo "🚀 Starting PM2 deployment of Saral Job Viewer Backend..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Python is installed
if ! command -v python &> /dev/null; then
    print_error "Python is not installed. Please install Python first."
    exit 1
fi

# Check if pip is installed
if ! command -v pip &> /dev/null; then
    print_error "pip is not installed. Please install pip first."
    exit 1
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    print_error "PM2 is not installed. Please install PM2 first: npm install -g pm2"
    exit 1
fi

# Check if virtual environment exists, create if not
if [ ! -d "env" ]; then
    print_status "Creating virtual environment..."
    python -m venv env
fi

# Activate virtual environment
print_status "Activating virtual environment..."
source env/bin/activate

# Install/upgrade pip
print_status "Upgrading pip..."
pip install --upgrade pip

# Install dependencies
print_status "Installing Python dependencies..."
pip install -r requirements.txt

# # Fix anyio compatibility issue if it exists
# print_status "Checking for package compatibility issues..."
# pip uninstall -y anyio 2>/dev/null || true
# pip install "anyio>=3.7.0,<4.0.0" 2>/dev/null || true

# Check if all required packages are installed
print_status "Verifying dependencies..."
python -c "
import fastapi, uvicorn, pydantic, selenium
print('✅ All required packages are installed')
" 2>/dev/null || {
    print_error "Some required packages are missing. Please check requirements.txt"
    exit 1
}

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Please ensure environment variables are set."
    print_warning "Required variables: DB_TYPE (optional, defaults to sqlite)"
fi

# Stop existing PM2 process if running
print_status "Stopping existing PM2 process..."
pm2 delete jobviewer-backend 2>/dev/null || true

# Start new PM2 process
print_status "Starting PM2 process..."
pm2 start app.py --name jobviewer-backend --interpreter python

# Save PM2 configuration
print_status "Saving PM2 configuration..."
pm2 save

# Check if process is running
sleep 2  # Give it a moment to start
if pm2 list | grep -q "jobviewer-backend.*online"; then
    print_status "✅ Deployment successful!"
    print_status "Backend is running on http://localhost:3011"
    print_status "API available at: http://localhost:3011/"
    
    # Show process status
    print_status "PM2 Status:"
    pm2 status
    
    # Show memory usage
    MEMORY=$(pm2 list | grep jobviewer-backend | awk '{print $10}')
    print_status "Memory usage: $MEMORY"
    
    # Show logs
    print_status "Recent logs:"
    pm2 logs jobviewer-backend --lines 5
    
    # Test health endpoint
    print_status "Testing API endpoint..."
    if command -v curl &> /dev/null; then
        sleep 3  # Wait for server to fully start
        if curl -s http://localhost:3011/ > /dev/null; then
            print_status "✅ API check passed!"
            print_status "Backend accessible at: http://localhost:3011/"
            print_status "Through nginx it will be: https://jobviewer.thatinsaneguy.com/api/"
        else
            print_warning "⚠️ API check failed - server might still be starting"
        fi
    fi
else
    print_error "❌ Deployment failed!"
    print_error "Check PM2 logs with: pm2 logs jobviewer-backend"
    exit 1
fi

# Setup PM2 to start on boot
print_status "Setting up PM2 to start on boot..."
pm2 startup

print_status "🎉 PM2 deployment complete!"
print_status ""
print_status "Useful commands:"
print_status "  pm2 status                   - Check process status"
print_status "  pm2 logs jobviewer-backend   - View logs"
print_status "  pm2 restart jobviewer-backend - Restart the service"
print_status "  pm2 stop jobviewer-backend   - Stop the service"
print_status "  pm2 delete jobviewer-backend - Remove the service"
print_status ""
print_status "Your Job Scraper API server will now keep running even after closing SSH!"
