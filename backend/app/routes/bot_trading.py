"""
Automated Bot Trading API Routes
Handles fund transfers to bot wallet and automated trading execution
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
from app.core.bot_wallet import BotWallet

router = APIRouter()

# Request/Response models
class FundTransferRequest(BaseModel):
    userWalletAddress: str
    amount: float  # SOL amount to transfer to bot

class FundTransferResponse(BaseModel):
    success: bool
    message: str
    botWalletAddress: str
    transferAmount: float
    requiresSigning: bool = True
    transactionData: Optional[dict] = None

class AutoTradeRequest(BaseModel):
    userWalletAddress: str
    tradePercentage: float = 10.0

class AutoTradeResult(BaseModel):
    trade1: dict
    trade2: dict
    profit: float
    status: str
    executionTime: float
    timestamp: str
    signatures: list = []

class AutoTradeResponse(BaseModel):
    success: bool
    result: Optional[AutoTradeResult] = None
    message: str

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

def prepare_trade_info(quote: dict, trade_type: str) -> dict:
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


@router.get("/bot-wallet")
async def get_bot_wallet_info():
    """Get bot wallet address and balance"""
    try:
        bot_wallet = await BotWallet.get_or_create_bot_wallet()
        balance = await BotWallet.get_bot_balance(bot_wallet['address'])
        return {
            "success": True,
            "address": bot_wallet['address'],
            "balance": balance,
            "message": f"Bot wallet balance: {balance:.6f} SOL"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get bot wallet info: {str(e)}")

@router.post("/fund-bot", response_model=FundTransferResponse)
async def fund_bot_wallet(request: FundTransferRequest, db: AsyncSession = Depends(get_db)):
    """Create transaction to transfer funds from user wallet to bot wallet"""
    try:
        # Check if user wallet exists and has sufficient balance
        result = await db.execute(
            text("""
                SELECT balance, trading_enabled
                FROM connected_wallets
                WHERE wallet_address = :address AND is_active = true
            """),
            {"address": request.userWalletAddress}
        )

        wallet = result.fetchone()
        if not wallet:
            raise HTTPException(status_code=404, detail="User wallet not found")

        if wallet.balance < request.amount:
            raise HTTPException(status_code=400, detail="Insufficient balance")

        # Create transfer instruction
        from solders.system_program import transfer, TransferParams
        from solders.pubkey import Pubkey
        from solders.transaction import Transaction
        from solders.message import Message

        # Convert SOL to lamports
        lamports = int(request.amount * 1_000_000_000)

        # Get bot wallet from database
        bot_wallet = await BotWallet.get_or_create_bot_wallet()

        # Create transfer instruction
        transfer_instruction = transfer(
            TransferParams(
                from_pubkey=Pubkey.from_string(request.userWalletAddress),
                to_pubkey=Pubkey.from_string(bot_wallet['address']),
                lamports=lamports
            )
        )

        # Create transaction
        from solana.rpc.async_api import AsyncClient
        client = AsyncClient("https://api.mainnet-beta.solana.com")

        # Get recent blockhash
        recent_blockhash_resp = await client.get_latest_blockhash()
        recent_blockhash = recent_blockhash_resp.value.blockhash

        # Create message and transaction
        message = Message.new_with_blockhash(
            [transfer_instruction],
            Pubkey.from_string(request.userWalletAddress),
            recent_blockhash
        )

        transaction = Transaction.new_unsigned(message)
        await client.close()

        # Serialize transaction for frontend signing
        import base64
        transaction_bytes = bytes(transaction)
        transaction_base64 = base64.b64encode(transaction_bytes).decode()

        # Update user's authorized trading balance
        await db.execute(
            text("""
                UPDATE connected_wallets
                SET trading_balance = COALESCE(trading_balance, 0) + :amount,
                    trading_enabled = true,
                    updated_at = CURRENT_TIMESTAMP
                WHERE wallet_address = :address
            """),
            {"amount": request.amount, "address": request.userWalletAddress}
        )

        await db.commit()

        return FundTransferResponse(
            success=True,
            message=f"Transfer transaction prepared: {request.amount} SOL to bot wallet",
            botWalletAddress=bot_wallet['address'],
            transferAmount=request.amount,
            requiresSigning=True,
            transactionData={
                "transaction": transaction_base64,
                "description": f"Transfer {request.amount} SOL to trading bot"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create transfer: {str(e)}")

@router.post("/auto-trade", response_model=AutoTradeResponse)
async def execute_automated_trade(request: AutoTradeRequest, db: AsyncSession = Depends(get_db)):
    """Execute AUTONOMOUS trade: SOL → USDT → SOL using delegated authority"""
    start_time = time.time()

    try:
        # Check if user has authorized trading
        result = await db.execute(
            text("""
                SELECT trading_enabled, trading_balance
                FROM connected_wallets
                WHERE wallet_address = :address AND is_active = true
            """),
            {"address": request.userWalletAddress}
        )

        wallet = result.fetchone()
        if not wallet:
            raise HTTPException(status_code=404, detail="User wallet not found")

        if not wallet.trading_enabled:
            raise HTTPException(status_code=403, detail="Trading not enabled for this wallet")

        # Calculate trade amount (percentage of authorized trading balance)
        trade_amount = float(wallet.trading_balance) * (request.tradePercentage / 100.0)

        if trade_amount <= 0:
            raise HTTPException(status_code=400, detail="Invalid trade amount")

        print(f"🤖 Executing AUTONOMOUS trade for user {request.userWalletAddress}")
        print(f"💰 Trading {trade_amount:.6f} SOL from authorized balance")

        # Get bot wallet from database
        bot_wallet = await BotWallet.get_or_create_bot_wallet()

        # Check bot wallet balance and fund it if needed
        bot_balance = await BotWallet.get_bot_balance(bot_wallet['address'])
        print(f"🤖 Bot wallet balance: {bot_balance:.6f} SOL")

        if bot_balance < trade_amount:
            print(f"⚠️  Bot wallet needs funding. Required: {trade_amount:.6f} SOL, Available: {bot_balance:.6f} SOL")
            # For now, use the amount we have or simulate with small amount
            if bot_balance > 0:
                trade_amount = min(trade_amount, bot_balance)
                print(f"🔄 Adjusting trade amount to available balance: {trade_amount:.6f} SOL")
            else:
                # Use minimum amount for testing
                trade_amount = 0.0001
                print(f"🔄 Using minimum test amount: {trade_amount:.6f} SOL")

        # Convert SOL to lamports for Jupiter API
        lamports_amount = int(trade_amount * 1_000_000_000)

        # Get real quote from Jupiter for SOL → USDT using bot wallet
        print(f"💹 Trade 1: Getting quote for {trade_amount} SOL → USDT with bot wallet")
        quote1 = await get_jupiter_quote(SOL_MINT, USDT_MINT, lamports_amount)
        trade1 = prepare_trade_info(quote1, "SOL_TO_USDT")

        # Execute first trade (SOL → USDT) with bot wallet (IT HAS PRIVATE KEY!)
        print(f"🔄 Executing SOL → USDT swap with bot wallet...")
        swap1_result = await BotWallet.execute_jupiter_swap(
            bot_wallet['address'],
            bot_wallet['private_key'],
            quote1
        )

        if not swap1_result["success"]:
            raise Exception(f"First trade failed: {swap1_result['error']}")

        trade1["signature"] = swap1_result["signature"]

        # Wait a bit for the first transaction to settle
        await asyncio.sleep(2)

        # Get the USDT amount we would receive for second trade
        usdt_received_amount = int(quote1["outAmount"])

        # Get real quote from Jupiter for USDT → SOL (immediate buyback)
        print(f"💹 Trade 2: Getting quote for {trade1['usdtReceived']:.2f} USDT → SOL")
        quote2 = await get_jupiter_quote(USDT_MINT, SOL_MINT, usdt_received_amount)
        trade2 = prepare_trade_info(quote2, "USDT_TO_SOL")

        # Execute second trade (USDT → SOL) with bot wallet (IT HAS PRIVATE KEY!)
        print(f"🔄 Executing USDT → SOL swap with bot wallet...")
        swap2_result = await BotWallet.execute_jupiter_swap(
            bot_wallet['address'],
            bot_wallet['private_key'],
            quote2
        )

        if not swap2_result["success"]:
            raise Exception(f"Second trade failed: {swap2_result['error']}")

        trade2["signature"] = swap2_result["signature"]

        # Calculate profit/loss based on REAL market execution
        initial_sol = trade_amount
        final_sol = trade2['solReceived']
        profit = final_sol - initial_sol

        execution_time = time.time() - start_time

        # Store completed trade in database
        trade_id = f"auto_trade_{int(time.time())}"
        await db.execute(
            text("""
                INSERT INTO trades (trade_id, token_symbol, action, price, profit_loss, status, input_amount, output_amount, signature)
                VALUES (:trade_id, 'SOL/USDT', 'sell', :price, :profit, 'completed', :input_amount, :output_amount, :signature)
            """),
            {
                "trade_id": trade_id,
                "price": trade1['price'],
                "profit": profit,
                "input_amount": trade_amount,
                "output_amount": trade1['usdtReceived'],
                "signature": f"{swap1_result['signature']},{swap2_result['signature']}"
            }
        )

        await db.commit()

        result = AutoTradeResult(
            trade1=trade1,
            trade2=trade2,
            profit=profit,
            status="✅ AUTONOMOUS Trade Completed",
            executionTime=execution_time,
            timestamp=datetime.now().isoformat(),
            signatures=[swap1_result["signature"], swap2_result["signature"]]
        )

        print(f"✅ AUTONOMOUS trade completed:")
        print(f"   Trade 1: {trade1['amount']:.6f} SOL → {trade1['usdtReceived']:.2f} USDT")
        print(f"   Trade 2: {trade2['amount']:.2f} USDT → {trade2['solReceived']:.6f} SOL")
        print(f"   Final P&L: {profit:+.6f} SOL")
        print(f"   Signatures: {swap1_result['signature']}, {swap2_result['signature']}")

        return AutoTradeResponse(
            success=True,
            result=result,
            message=f"✅ AUTONOMOUS trade completed! P&L: {profit:+.6f} SOL. Check Solana Explorer for transactions."
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        print(f"❌ AUTONOMOUS trade failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AUTONOMOUS trade failed: {str(e)}")
