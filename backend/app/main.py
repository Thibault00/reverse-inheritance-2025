"""
Solana Trading Bot - FastAPI Backend
Professional trading bot with risk management and real-time execution
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

from app.core.database import init_db, close_db
from app.routes import bot, trades, profit, wallet, strategy, trading

# Load environment variables
load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    yield
    # Shutdown
    await close_db()

# Create FastAPI app
app = FastAPI(
    title="Solana Trading Bot API",
    description="Professional trading bot with advanced risk management",
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "solana-trading-bot",
        "version": "2.0.0",
        "database": "connected"
    }

# Include routers
app.include_router(bot.router, prefix="/api/bot", tags=["Bot Management"])
app.include_router(trades.router, prefix="/api/trades", tags=["Trading"])
app.include_router(profit.router, prefix="/api/profit", tags=["Analytics"])
app.include_router(wallet.router, prefix="/api/wallet", tags=["Wallet"])
app.include_router(strategy.router, prefix="/api/strategy", tags=["Strategy"])
app.include_router(trading.router, prefix="/api/trading", tags=["Live Trading"])

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "Solana Trading Bot API",
        "version": "2.0.0",
        "docs": "/docs",
        "health": "/health"
    }

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )