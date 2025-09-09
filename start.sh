#!/bin/bash

# Traffic QA Dashboard v2 - Development Start Script
# Monitors file changes and auto-reloads browser

PORT=3001
PID_FILE="./dev.pid"
LOG_FILE="./dev.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to clean up background processes
cleanup() {
    echo -e "\n${YELLOW}🧹 Cleaning up processes...${NC}"
    
    if [ -f "$PID_FILE" ]; then
        while read pid; do
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "${BLUE}   Stopping process $pid${NC}"
                kill "$pid" 2>/dev/null
            fi
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi
    
    # Kill any lingering node processes on our port
    lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
    
    echo -e "${GREEN}✅ Cleanup complete${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Check if nodemon is installed
if ! command -v nodemon &> /dev/null; then
    echo -e "${YELLOW}📦 Installing nodemon...${NC}"
    npm install -g nodemon
fi

echo -e "${BLUE}🚀 Starting Traffic QA Dashboard v2 Development Environment${NC}"
echo -e "${BLUE}   Port: $PORT${NC}"
echo -e "${BLUE}   Auto-reload: Enabled${NC}"
echo -e "${BLUE}   Browser refresh: Enabled${NC}"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
fi

# Start the server with nodemon
echo -e "${GREEN}🔄 Starting server with auto-reload...${NC}"
nodemon server.js --watch ./ --ext js,json,html,css --ignore node_modules/ --ignore data/ >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo $SERVER_PID >> "$PID_FILE"

# Wait for server to start
sleep 2

# Open browser if not already open
if command -v google-chrome &> /dev/null; then
    BROWSER="google-chrome"
elif command -v firefox &> /dev/null; then
    BROWSER="firefox"
elif command -v chromium-browser &> /dev/null; then
    BROWSER="chromium-browser"
else
    echo -e "${YELLOW}⚠️  No supported browser found. Please open http://localhost:$PORT manually${NC}"
    BROWSER=""
fi

if [ ! -z "$BROWSER" ]; then
    echo -e "${GREEN}🌐 Opening browser...${NC}"
    $BROWSER "http://localhost:$PORT" > /dev/null 2>&1 &
    BROWSER_PID=$!
    echo $BROWSER_PID >> "$PID_FILE"
fi

# Start file watcher for browser refresh
echo -e "${GREEN}👁️  Starting file watcher for browser refresh...${NC}"
(
    # Install browser-sync if not available
    if ! command -v browser-sync &> /dev/null; then
        echo -e "${YELLOW}📦 Installing browser-sync...${NC}"
        npm install -g browser-sync
    fi
    
    # Start browser-sync proxy
    browser-sync start \
        --proxy "localhost:$PORT" \
        --files "public/**/*,modules/**/*" \
        --no-open \
        --no-notify \
        --port 3002 \
        >> "$LOG_FILE" 2>&1
) &
SYNC_PID=$!
echo $SYNC_PID >> "$PID_FILE"

echo -e "${GREEN}✅ Development environment ready!${NC}"
echo -e "${BLUE}   Main app: http://localhost:$PORT${NC}"
echo -e "${BLUE}   Auto-reload: http://localhost:3002${NC}"
echo -e "${YELLOW}   Press Ctrl+C to stop${NC}"

# Keep script running and show logs
tail -f "$LOG_FILE" 2>/dev/null &
TAIL_PID=$!
echo $TAIL_PID >> "$PID_FILE"

# Wait for user interrupt
wait