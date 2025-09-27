"""
Trading API Routes
Test trading functionality for SOL ↔ USDT swaps
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
import asyncio
import random
import time
from datetime import datetime

from app.core.database import get_db

router = APIRouter()

# Request/Response models
class TestTradeRequest(BaseModel):
    walletAddress: str
    tradePercentage: float = 10.0

class TradeResult(BaseModel):
    trade1: dict
    trade2: dict
    profit: float
    status: str
    executionTime: float
    timestamp: str

class TestTradeResponse(BaseModel):
    success: bool
    result: Optional[TradeResult] = None
    message: str

def simulate_sol_to_usdt_trade(sol_amount: float) -> dict:
    """Simulate SOL → USDT trade with realistic market data"""
    # Simulate SOL price around $180-220 with some volatility
    base_price = 200.0
    volatility = random.uniform(-5.0, 5.0)  # ±$5 volatility
    sol_price = base_price + volatility

    # Add trading fees (0.25% typical)
    fee_rate = 0.0025
    usdt_received = (sol_amount * sol_price) * (1 - fee_rate)

    return {
        "type": "SELL",
        "amount": sol_amount,
        "price": sol_price,
        "usdtReceived": usdt_received,
        "fee": sol_amount * sol_price * fee_rate,
        "timestamp": datetime.now().isoformat()
    }

def simulate_usdt_to_sol_trade(usdt_amount: float) -> dict:
    """Simulate USDT → SOL trade with realistic market data"""
    # Simulate slight price movement during the trade
    base_price = 200.0
    volatility = random.uniform(-2.0, 2.0)  # Smaller volatility for quick turnaround
    sol_price = base_price + volatility

    # Add trading fees (0.25% typical)
    fee_rate = 0.0025
    usdt_after_fee = usdt_amount * (1 - fee_rate)
    sol_received = usdt_after_fee / sol_price

    return {
        "type": "BUY",
        "amount": usdt_amount,
        "price": sol_price,
        "solReceived": sol_received,
        "fee": usdt_amount * fee_rate,
        "timestamp": datetime.now().isoformat()
    }

@router.post("/test-trade", response_model=TestTradeResponse)
async def execute_test_trade(request: TestTradeRequest, db: AsyncSession = Depends(get_db)):
    """Execute a test trade: SOL → USDT → SOL"""
    start_time = time.time()

    try:
        # Get wallet info and check trading authorization
        result = await db.execute(
            text("""
                SELECT trading_enabled, trading_balance, balance
                FROM connected_wallets
                WHERE wallet_address = :address AND is_active = true
            """),
            {"address": request.walletAddress}
        )

        wallet = result.fetchone()
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")

        if not wallet.trading_enabled:
            raise HTTPException(status_code=403, detail="Trading not enabled for this wallet")

        # Calculate trade amount (percentage of authorized trading balance)
        trade_amount = float(wallet.trading_balance) * (request.tradePercentage / 100.0)

        if trade_amount <= 0:
            raise HTTPException(status_code=400, detail="Invalid trade amount")

        # Simulate network delay
        await asyncio.sleep(0.5)

        # Execute Trade 1: SOL → USDT
        print(f"🔄 Executing Trade 1: {trade_amount} SOL → USDT")
        trade1 = simulate_sol_to_usdt_trade(trade_amount)

        # Simulate processing time
        await asyncio.sleep(0.3)

        # Execute Trade 2: USDT → SOL
        print(f"🔄 Executing Trade 2: {trade1['usdtReceived']} USDT → SOL")
        trade2 = simulate_usdt_to_sol_trade(trade1['usdtReceived'])

        # Calculate profit/loss
        initial_sol = trade_amount
        final_sol = trade2['solReceived']
        profit = final_sol - initial_sol

        execution_time = time.time() - start_time

        # Store trade in database
        await db.execute(
            text("""
                INSERT INTO trades (trade_id, token_symbol, action, amount, price, profit_loss, status)
                VALUES (:trade_id1, 'SOL/USDT', 'sell', :amount1, :price1, 0, 'completed'),
                       (:trade_id2, 'USDT/SOL', 'buy', :amount2, :price2, :profit, 'completed')
            """),
            {
                "trade_id1": f"test_trade_{int(time.time())}_1",
                "amount1": trade_amount,
                "price1": trade1['price'],
                "trade_id2": f"test_trade_{int(time.time())}_2",
                "amount2": trade1['usdtReceived'],
                "price2": trade2['price'],
                "profit": profit
            }
        )

        await db.commit()

        result = TradeResult(
            trade1=trade1,
            trade2=trade2,
            profit=profit,
            status="✅ Completed Successfully",
            executionTime=execution_time,
            timestamp=datetime.now().isoformat()
        )

        print(f"✅ Test trade completed: {profit:+.6f} SOL profit")

        return TestTradeResponse(
            success=True,
            result=result,
            message=f"Test trade completed successfully. Profit: {profit:+.6f} SOL"
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        print(f"❌ Trade failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Trade execution failed: {str(e)}")