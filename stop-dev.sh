#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 Stopping all development services...${NC}"

# Stop backend processes
echo -e "${RED}Stopping backend...${NC}"
pkill -f "uvicorn.*app.main:app"
pkill -f "python.*uvicorn"

# Stop frontend processes
echo -e "${RED}Stopping frontend...${NC}"
pkill -f "next.*dev"
pkill -f "npm run dev"
pkill -f "next-server"

# Clean up any remaining node processes related to our project
pkill -f "node.*next"

# Wait a moment
sleep 1

# Check if processes are still running
BACKEND_RUNNING=$(ps aux | grep -E "uvicorn.*app.main:app" | grep -v grep | wc -l)
FRONTEND_RUNNING=$(ps aux | grep -E "next.*dev|npm run dev|next-server" | grep -v grep | wc -l)

if [ "$BACKEND_RUNNING" -eq 0 ] && [ "$FRONTEND_RUNNING" -eq 0 ]; then
    echo -e "${GREEN}✅ All services stopped successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Some processes may still be running. Check with: ps aux | grep -E '(uvicorn|next)'${NC}"
fi

# Clean up log files
if [ -d "logs" ]; then
    rm -f logs/backend.log logs/frontend.log
    echo -e "${GREEN}🧹 Cleaned up log files${NC}"
fi
