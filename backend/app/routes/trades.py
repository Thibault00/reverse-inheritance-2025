"""
Trading API Routes
Trade history, execution, monitoring
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.database import get_db

router = APIRouter()

@router.get("/")
async def get_trades(db: AsyncSession = Depends(get_db)):
    """Get trade history"""
    try:
        result = await db.execute(
            text("SELECT * FROM trades ORDER BY timestamp DESC LIMIT 50")
        )
        trades = [dict(row._mapping) for row in result.fetchall()]

        return {
            "success": True,
            "trades": trades
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "trades": []
        }