#!/bin/bash

# PM2 Deploy script for Saral Job Viewer Full-Stack Application
echo "🚀 Starting PM2 deployment of Saral Job Viewer Full-Stack App..."

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

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    print_error "PM2 is not installed. Please install PM2 first: npm install -g pm2"
    exit 1
fi

# Install dependencies
print_status "Installing dependencies..."
npm install

# Build the full-stack application (client + server)
print_status "Building full-stack application..."
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    print_error "Build failed! dist/ directory not found."
    exit 1
fi

# Stop existing PM2 process if running
print_status "Stopping existing PM2 process..."
pm2 delete jobviewer-frontend 2>/dev/null || true

# Start new PM2 process with the built Node.js server
print_status "Starting PM2 process..."
PORT=3010 NODE_ENV=production pm2 start dist/index.js --name jobviewer-frontend

# Save PM2 configuration
print_status "Saving PM2 configuration..."
pm2 save

# Check if process is running
if pm2 list | grep -q "jobviewer-frontend.*online"; then
    print_status "✅ Deployment successful!"
    print_status "Full-stack app is running on http://localhost:3010"
    print_status "Job Viewer Full-Stack App deployed successfully!"
    print_status "Access via nginx at: https://jobviewer.thatinsaneguy.com/"
    
    # Show process status
    print_status "PM2 Status:"
    pm2 status
    
    # Show memory usage
    MEMORY=$(pm2 list | grep jobviewer-frontend | awk '{print $10}')
    print_status "Memory usage: $MEMORY"
else
    print_error "❌ Deployment failed!"
    print_error "Check PM2 logs with: pm2 logs jobviewer-frontend"
    exit 1
fi

print_status "🎉 PM2 deployment complete!" 