"""
Trading API Routes
REAL trading functionality for SOL ↔ USDT swaps using Jupiter
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
import asyncio
import aiohttp
import time
from datetime import datetime

from app.core.database import get_db

router = APIRouter()

# Request/Response models
class TradeRequest(BaseModel):
    walletAddress: str
    tradePercentage: float = 10.0

class TradeResult(BaseModel):
    trade1: dict
    trade2: dict
    profit: float
    status: str
    executionTime: float
    timestamp: str
    transactions: list = []

class TradeResponse(BaseModel):
    success: bool
    result: Optional[TradeResult] = None
    message: str
    requiresSigning: bool = False
    transactionData: Optional[dict] = None

# Solana token addresses
SOL_MINT = "So11111111111111111111111111111111111111112"
USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"

async def get_jupiter_quote(input_mint: str, output_mint: str, amount: int) -> dict:
    """Get quote from Jupiter for token swap"""
    try:
        async with aiohttp.ClientSession() as session:
            url = f"https://quote-api.jup.ag/v6/quote"
            params = {
                "inputMint": input_mint,
                "outputMint": output_mint,
                "amount": str(amount),
                "slippageBps": 50  # 0.5% slippage
            }

            async with session.get(url, params=params) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    raise Exception(f"Jupiter quote failed: {response.status}")
    except Exception as e:
        print(f"Error getting Jupiter quote: {e}")
        raise

async def create_jupiter_transaction(wallet_address: str, quote: dict) -> dict:
    """Create transaction from Jupiter quote"""
    try:
        async with aiohttp.ClientSession() as session:
            url = "https://quote-api.jup.ag/v6/swap"
            data = {
                "userPublicKey": wallet_address,
                "quoteResponse": quote,
                "wrapAndUnwrapSol": True,
                "useSharedAccounts": True,
                "feeAccount": None,
                "computeUnitPriceMicroLamports": "auto",
                "asLegacyTransaction": False
            }

            async with session.post(url, json=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    raise Exception(f"Jupiter transaction creation failed: {response.status}")
    except Exception as e:
        print(f"Error creating Jupiter transaction: {e}")
        raise

def prepare_real_trade_info(quote: dict, trade_type: str) -> dict:
    """Prepare trade information from Jupiter quote"""
    input_amount = int(quote["inAmount"])
    output_amount = int(quote["outAmount"])

    if trade_type == "SOL_TO_USDT":
        sol_amount = input_amount / 1_000_000_000  # Convert lamports to SOL
        usdt_amount = output_amount / 1_000_000     # Convert USDT decimals
        price = usdt_amount / sol_amount if sol_amount > 0 else 0

        return {
            "type": "SELL",
            "amount": sol_amount,
            "price": price,
            "usdtReceived": usdt_amount,
            "slippage": quote.get("slippageBps", 50) / 10000,
            "timestamp": datetime.now().isoformat(),
            "route": quote.get("routePlan", [])
        }
    else:  # USDT_TO_SOL
        usdt_amount = input_amount / 1_000_000      # Convert USDT decimals
        sol_amount = output_amount / 1_000_000_000  # Convert lamports to SOL
        price = usdt_amount / sol_amount if sol_amount > 0 else 0

        return {
            "type": "BUY",
            "amount": usdt_amount,
            "price": price,
            "solReceived": sol_amount,
            "slippage": quote.get("slippageBps", 50) / 10000,
            "timestamp": datetime.now().isoformat(),
            "route": quote.get("routePlan", [])
        }

@router.post("/execute-trade", response_model=TradeResponse)
async def execute_real_trade(request: TradeRequest, db: AsyncSession = Depends(get_db)):
    """Execute REAL trade: SOL → USDT → SOL with wallet signing"""
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

        # Convert SOL to lamports for Jupiter API
        lamports_amount = int(trade_amount * 1_000_000_000)

        print(f"🔄 Getting REAL Jupiter quotes for {trade_amount} SOL...")

        # Get real quote from Jupiter for SOL → USDT
        print(f"💹 Trade 1: Getting quote for {trade_amount} SOL → USDT")
        quote1 = await get_jupiter_quote(SOL_MINT, USDT_MINT, lamports_amount)
        trade1 = prepare_real_trade_info(quote1, "SOL_TO_USDT")

        # Get the USDT amount we would receive
        usdt_received_amount = int(quote1["outAmount"])

        # Get real quote from Jupiter for USDT → SOL (immediate buyback)
        print(f"💹 Trade 2: Getting quote for {trade1['usdtReceived']:.2f} USDT → SOL")
        quote2 = await get_jupiter_quote(USDT_MINT, SOL_MINT, usdt_received_amount)
        trade2 = prepare_real_trade_info(quote2, "USDT_TO_SOL")

        # Calculate profit/loss based on REAL market prices
        initial_sol = trade_amount
        final_sol = trade2['solReceived']
        profit = final_sol - initial_sol

        # Create the actual transactions that need to be signed
        print(f"📝 Creating REAL transactions for wallet signing...")

        # Create Jupiter transaction for SOL → USDT
        transaction1_data = await create_jupiter_transaction(request.walletAddress, quote1)
        trade1["transactionData"] = transaction1_data

        # Create Jupiter transaction for USDT → SOL
        transaction2_data = await create_jupiter_transaction(request.walletAddress, quote2)
        trade2["transactionData"] = transaction2_data

        print(f"📊 REAL Trading Prepared:")
        print(f"   Trade 1: {trade1['amount']:.6f} SOL → {trade1['usdtReceived']:.2f} USDT @ ${trade1['price']:.2f}/SOL")
        print(f"   Trade 2: {trade2['amount']:.2f} USDT → {trade2['solReceived']:.6f} SOL @ ${trade2['price']:.2f}/SOL")
        print(f"   Expected P&L: {profit:+.6f} SOL")
        print(f"   Status: Ready for wallet signing")

        execution_time = time.time() - start_time

        # Store pending trade in database
        trade_id = f"real_trade_{int(time.time())}"
        await db.execute(
            text("""
                INSERT INTO trades (trade_id, token_symbol, action, amount, price, profit_loss, status)
                VALUES (:trade_id, 'SOL/USDT', 'sell', :amount, :price, :profit, 'pending')
            """),
            {
                "trade_id": trade_id,
                "amount": trade_amount,
                "price": trade1['price'],
                "profit": profit
            }
        )

        await db.commit()

        result = TradeResult(
            trade1=trade1,
            trade2=trade2,
            profit=profit,
            status="🔏 Ready for Wallet Signing",
            executionTime=execution_time,
            timestamp=datetime.now().isoformat(),
            transactions=[transaction1_data, transaction2_data]
        )

        print(f"✅ REAL transactions prepared: {profit:+.6f} SOL expected result - READY FOR SIGNING")

        return TradeResponse(
            success=True,
            result=result,
            message=f"REAL transactions prepared. Expected result: {profit:+.6f} SOL. Ready for wallet signing.",
            requiresSigning=True,
            transactionData={
                "tradeId": trade_id,
                "transaction1": transaction1_data.get("swapTransaction"),
                "transaction2": transaction2_data.get("swapTransaction")
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        print(f"❌ Trade failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Trade execution failed: {str(e)}")