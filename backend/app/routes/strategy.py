"""
Strategy Management API Routes
Trading strategies, risk settings
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

router = APIRouter()

@router.get("/")
async def get_strategy(db: AsyncSession = Depends(get_db)):
    """Get current trading strategy"""
    return {
        "success": True,
        "strategy": {
            "name": "Conservative",
            "riskLevel": "low",
            "maxPositionSize": 5.0,
            "stopLoss": 3.0,
            "takeProfit": 10.0,
            "isActive": True
        }
    }