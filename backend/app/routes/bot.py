"""
Bot Management API Routes
Status, configuration, start/stop controls
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Dict, Any
from pydantic import BaseModel

from app.core.database import get_db

router = APIRouter()

# Request/Response models
class BotStatusResponse(BaseModel):
    success: bool
    status: Dict[str, Any]

class BotActionRequest(BaseModel):
    action: str  # "start" or "stop"

class BotActionResponse(BaseModel):
    success: bool
    message: str

# Bot wallet address (from old backend)
BOT_WALLET_ADDRESS = "DGPrryYStTsmKkMhkJrTzapbCYKvN3srHJvSHqZCWYP6"

@router.get("/status", response_model=BotStatusResponse)
async def get_bot_status(db: AsyncSession = Depends(get_db)):
    """Get current bot status from database"""
    try:
        # Query bot status from database
        result = await db.execute(
            text("SELECT * FROM bot_status ORDER BY created_at DESC LIMIT 1")
        )
        row = result.fetchone()

        if row:
            status = {
                "isRunning": row.is_running,
                "lastUpdate": row.last_update.isoformat() if row.last_update else None,
                "totalTrades": row.total_trades,
                "activePositions": row.active_positions,
                "backendConnected": row.backend_connected
            }
        else:
            # Default status if no record exists
            status = {
                "isRunning": False,
                "lastUpdate": None,
                "totalTrades": 0,
                "activePositions": 0,
                "backendConnected": True
            }

        return BotStatusResponse(success=True, status=status)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch bot status: {str(e)}")

@router.post("/status", response_model=BotActionResponse)
async def control_bot(request: BotActionRequest, db: AsyncSession = Depends(get_db)):
    """Start or stop the trading bot"""
    try:
        if request.action == "start":
            # Update bot status to running
            await db.execute(
                text("""
                    INSERT INTO bot_status (is_running, total_trades, active_positions, backend_connected)
                    VALUES (true, 0, 0, true)
                    ON CONFLICT (id) DO UPDATE SET
                        is_running = true,
                        last_update = CURRENT_TIMESTAMP,
                        backend_connected = true
                """)
            )
            await db.commit()

            return BotActionResponse(
                success=True,
                message="🚀 Trading bot started successfully"
            )

        elif request.action == "stop":
            # Update bot status to stopped
            await db.execute(
                text("""
                    INSERT INTO bot_status (is_running, total_trades, active_positions, backend_connected)
                    VALUES (false, 0, 0, true)
                    ON CONFLICT (id) DO UPDATE SET
                        is_running = false,
                        last_update = CURRENT_TIMESTAMP,
                        backend_connected = true
                """)
            )
            await db.commit()

            return BotActionResponse(
                success=True,
                message="⏹️ Trading bot stopped successfully"
            )
        else:
            raise HTTPException(status_code=400, detail="Invalid action. Use 'start' or 'stop'")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to control bot: {str(e)}")

@router.get("/wallet-address")
async def get_bot_wallet_address():
    """Get the bot's Solana wallet address"""
    return {
        "success": True,
        "address": BOT_WALLET_ADDRESS
    }