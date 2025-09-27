#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to cleanup processes on exit
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down services...${NC}"

    # Kill backend
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
        echo -e "${RED}🔴 Backend stopped${NC}"
    fi

    # Kill frontend
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
        echo -e "${BLUE}🔴 Frontend stopped${NC}"
    fi

    # Kill any remaining processes
    pkill -f "uvicorn.*app.main:app" 2>/dev/null
    pkill -f "next.*dev" 2>/dev/null

    # Stop PostgreSQL container
    echo -e "${YELLOW}🐘 Stopping PostgreSQL database...${NC}"
    docker-compose stop postgres

    echo -e "${GREEN}✅ All services stopped${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo -e "${GREEN}🚀 Starting Solana Trading Bot Development Environment${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "backend" ]; then
    echo -e "${RED}❌ Please run this script from the project root directory${NC}"
    exit 1
fi

# Create log directory
mkdir -p logs

# Start PostgreSQL Database (Docker only)
echo -e "${YELLOW}🐘 Starting PostgreSQL database (Docker)...${NC}"
docker-compose up -d postgres

# Wait for database to be ready
echo -e "${YELLOW}⏳ Waiting for database to be ready...${NC}"
until docker-compose exec postgres pg_isready -U dev -d tradingbot > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}✅ Database is ready${NC}"

# Start Backend
echo -e "${PURPLE}🔧 Starting Backend (FastAPI + uvicorn)...${NC}"
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 2

# Check if backend started successfully
if kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${GREEN}✅ Backend started successfully (PID: $BACKEND_PID)${NC}"
    echo -e "${GREEN}   📡 API available at: http://localhost:8000${NC}"
    echo -e "${GREEN}   📚 Docs available at: http://localhost:8000/docs${NC}"
else
    echo -e "${RED}❌ Backend failed to start${NC}"
    exit 1
fi

# Start Frontend
echo -e "${BLUE}🔧 Starting Frontend (Next.js + Turbopack)...${NC}"
npm run dev > logs/frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait a moment for frontend to start
sleep 3

# Check if frontend started successfully
if kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${GREEN}✅ Frontend started successfully (PID: $FRONTEND_PID)${NC}"
    echo -e "${GREEN}   🌐 App available at: http://localhost:3000${NC}"
else
    echo -e "${RED}❌ Frontend failed to start${NC}"
    cleanup
fi

echo ""
echo -e "${GREEN}🎉 Both services are running!${NC}"
echo -e "${YELLOW}📊 Watching logs (Backend=Purple, Frontend=Blue)...${NC}"
echo ""

# Function to prefix log lines with service name and color
tail_with_prefix() {
    local service=$1
    local color=$2
    local logfile=$3

    tail -f "$logfile" 2>/dev/null | while IFS= read -r line; do
        echo -e "${color}[$service]${NC} $line"
    done
}

# Start tailing both log files with different colors
tail_with_prefix "BACKEND " "$PURPLE" "logs/backend.log" &
BACKEND_TAIL_PID=$!

tail_with_prefix "FRONTEND" "$BLUE" "logs/frontend.log" &
FRONTEND_TAIL_PID=$!

# Wait for user to interrupt
wait

# This should never be reached due to the trap, but just in case
cleanup
