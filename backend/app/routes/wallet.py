"""
Clean Wallet Routes - Database-First Architecture
Only essential endpoints: bot wallet info and trading
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.core.bot_wallet import BotWallet
from app.core.blockchain_fetcher import blockchain_fetcher
from app.core.database import get_db
from app.core.simple_price_tracker import price_tracker
from app.core.simple_strategy import trading_strategy
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import aiohttp
import asyncio
import time
from datetime import datetime

router = APIRouter()

class TradeRequest(BaseModel):
    fromToken: str
    toToken: str
    amount: float

# Token mint addresses
TOKEN_MINTS = {
    "SOL": "So11111111111111111111111111111111111111112",
    "USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
}

# Token decimals
TOKEN_DECIMALS = {
    "SOL": 9,
    "USDT": 6,
    "USDC": 6
}

@router.get("/balance/{wallet_address}")
async def get_user_wallet_balance(wallet_address: str):
    """Get user wallet SOL balance - backend proxy to avoid CORS issues"""
    try:
        print(f"🔄 Fetching balance for user wallet: {wallet_address}")

        # Try multiple RPC endpoints on the backend (no CORS issues)
        rpc_endpoints = [
            "https://rpc.shyft.to",
            "https://api.mainnet-beta.solana.com",
            "https://solana-api.projectserum.com",
            "https://rpc.ankr.com/solana",
        ]

        # Use the reliable balance fetching method
        balance = await BotWallet.get_bot_balance(wallet_address)
        if balance is not None:
            print(f"✅ User balance fetched: {balance} SOL")
            return {
                "success": True,
                "balance": balance,
                "address": wallet_address,
                "source": "backend-proxy"
            }

        # If all fail, return 0
        print(f"❌ All RPC endpoints failed for {wallet_address}")
        return {
            "success": True,
            "balance": 0.0,
            "address": wallet_address,
            "source": "backend-proxy-fallback"
        }

    except Exception as e:
        print(f"❌ Error getting user wallet balance: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get wallet balance: {str(e)}")

@router.get("/bot-wallet-live")
async def get_bot_wallet_live():
    """Get bot wallet with ALL live blockchain tokens and update database"""
    try:
        # 1. Get or create bot wallet from database
        bot_wallet = await BotWallet.get_or_create_bot_wallet()
        print(f"🤖 Using bot wallet: {bot_wallet['address']}")

        # 2. Fetch ALL live tokens from blockchain
        print(f"🔄 Fetching ALL live token balances...")
        tokens = await blockchain_fetcher.fetch_all_tokens(bot_wallet['address'])
        print(f"💰 Found {len(tokens)} tokens on blockchain")

        # 3. Update database with live token data
        await BotWallet.update_bot_tokens(bot_wallet['address'], tokens)

        # 4. Count active tokens (non-zero balances)
        active_tokens = {k: v for k, v in tokens.items() if v > 0}

        print(f"📊 Active tokens ({len(active_tokens)}):")
        for token, balance in active_tokens.items():
            print(f"  {token}: {balance}")

        # 5. Return comprehensive wallet data
        wallet_data = {
            "address": bot_wallet['address'],
            "balanceSOL": tokens.get("SOL", 0.0),
            "balanceUSDT": tokens.get("USDT", 0.0),
            "balanceUSDC": tokens.get("USDC", 0.0),
            "name": "Trading Bot Wallet",
            "type": "bot",
            "tokens": tokens,  # ALL tokens (including zero balances)
            "activeTokens": active_tokens,  # Only non-zero tokens
            "tokenCount": len(active_tokens),
            "lastUpdated": "just now",
            "source": "database-first + live blockchain fetch"
        }

        return {"success": True, "wallet": wallet_data}

    except Exception as e:
        print(f"❌ Error getting live bot wallet: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get live bot wallet: {str(e)}")


@router.get("/trades")
async def get_recent_trades(limit: int = 10, db: AsyncSession = Depends(get_db)):
    """Get recent trades from database"""
    try:
        result = await db.execute(
            text("""
                SELECT trade_id, token_symbol, action, price, profit_loss, status,
                       wallet_address, input_token, output_token, input_amount, output_amount,
                       trade_action, signature, fee_sol, timestamp, created_at
                FROM trades
                ORDER BY created_at DESC
                LIMIT :limit
            """),
            {"limit": limit}
        )

        trades = []
        for row in result.fetchall():
            trades.append({
                "trade_id": row.trade_id,
                "token_symbol": row.token_symbol,
                "action": row.action,
                "price": float(row.price) if row.price else 0,
                "input_token": row.input_token,
                "output_token": row.output_token,
                "input_amount": float(row.input_amount) if row.input_amount else 0,
                "output_amount": float(row.output_amount) if row.output_amount else 0,
                "signature": row.signature,
                "fee_sol": float(row.fee_sol) if row.fee_sol else 0,
                "timestamp": row.timestamp.isoformat() if row.timestamp else None,
                "status": row.status
            })

        return {"success": True, "trades": trades}

    except Exception as e:
        print(f"❌ Error fetching trades: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch trades: {str(e)}")


@router.post("/create-funding-transaction")
async def create_funding_transaction(request: dict):
    """Create funding transaction for frontend signing"""
    try:
        user_address = request.get("userWalletAddress")
        amount = request.get("amount")

        print(f"💰 Creating funding transaction: {amount} SOL from {user_address}")

        # Get bot wallet
        bot_wallet = await BotWallet.get_or_create_bot_wallet()

        # Create transfer instruction using backend (has reliable RPC access)
        from solders.system_program import transfer, TransferParams
        from solders.pubkey import Pubkey
        from solders.transaction import Transaction
        from solders.message import Message
        from solana.rpc.async_api import AsyncClient
        import base64

        # Convert SOL to lamports
        lamports = int(amount * 1_000_000_000)

        # Create transfer instruction
        transfer_instruction = transfer(
            TransferParams(
                from_pubkey=Pubkey.from_string(user_address),
                to_pubkey=Pubkey.from_string(bot_wallet['address']),
                lamports=lamports
            )
        )

        # Get recent blockhash using backend RPC
        client = AsyncClient("https://api.mainnet-beta.solana.com")
        recent_blockhash_resp = await client.get_latest_blockhash()
        recent_blockhash = recent_blockhash_resp.value.blockhash
        await client.close()

        # Create message and transaction
        message = Message.new_with_blockhash(
            [transfer_instruction],
            Pubkey.from_string(user_address),
            recent_blockhash
        )

        transaction = Transaction.new_unsigned(message)

        # Serialize transaction for frontend signing
        transaction_bytes = bytes(transaction)
        transaction_base64 = base64.b64encode(transaction_bytes).decode()

        return {
            "success": True,
            "transaction": transaction_base64,
            "botWalletAddress": bot_wallet['address'],
            "amount": amount
        }

    except Exception as e:
        print(f"❌ Error creating funding transaction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create funding transaction: {str(e)}")


@router.post("/withdraw-from-bot")
async def withdraw_from_bot(request: dict):
    """Transfer SOL from bot wallet back to user wallet"""
    try:
        user_address = request.get("userWalletAddress")
        amount = request.get("amount")

        print(f"💸 Creating withdrawal: {amount} SOL from bot to {user_address}")

        # Get bot wallet
        bot_wallet = await BotWallet.get_or_create_bot_wallet()

        # Check bot wallet has sufficient balance
        bot_balance = await BotWallet.get_bot_balance(bot_wallet['address'])
        if bot_balance < amount:
            raise HTTPException(status_code=400, detail=f"Insufficient bot wallet balance. Available: {bot_balance} SOL")

        # Create transfer instruction (bot → user)
        from solders.system_program import transfer, TransferParams
        from solders.pubkey import Pubkey
        from solders.transaction import Transaction
        from solders.message import Message
        from solana.rpc.async_api import AsyncClient
        import base64

        # Convert SOL to lamports
        lamports = int(amount * 1_000_000_000)

        # Create transfer instruction (FROM bot TO user)
        transfer_instruction = transfer(
            TransferParams(
                from_pubkey=Pubkey.from_string(bot_wallet['address']),
                to_pubkey=Pubkey.from_string(user_address),
                lamports=lamports
            )
        )

        # Get recent blockhash using backend RPC
        client = AsyncClient("https://api.mainnet-beta.solana.com")
        recent_blockhash_resp = await client.get_latest_blockhash()
        recent_blockhash = recent_blockhash_resp.value.blockhash
        await client.close()

        # Create message and transaction (bot wallet as fee payer)
        message = Message.new_with_blockhash(
            [transfer_instruction],
            Pubkey.from_string(bot_wallet['address']),  # Bot wallet pays fees
            recent_blockhash
        )

        transaction = Transaction.new_unsigned(message)

        # Sign and send with bot wallet private key (backend has the key)
        from solders.keypair import Keypair
        from solders.transaction import VersionedTransaction
        import base58

        private_key_bytes = base58.b58decode(bot_wallet['private_key'])
        bot_keypair = Keypair.from_bytes(private_key_bytes)

        # Sign transaction with bot wallet
        signed_transaction = VersionedTransaction(message, [bot_keypair])

        # Send transaction
        client = AsyncClient("https://api.mainnet-beta.solana.com")
        response = await client.send_transaction(signed_transaction)
        await client.close()

        if response.value:
            signature = str(response.value)
            print(f"✅ Withdrawal successful: {signature}")

            return {
                "success": True,
                "signature": signature,
                "message": f"Withdrew {amount} SOL from bot wallet",
                "amount": amount
            }
        else:
            raise Exception("Transaction failed to send")

    except Exception as e:
        print(f"❌ Error creating withdrawal: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to withdraw from bot: {str(e)}")


@router.post("/start-price-tracking")
async def start_price_tracking():
    """Start automated price tracking"""
    try:
        if not price_tracker.running:
            # Start price tracking in background
            asyncio.create_task(price_tracker.start_tracking())
            return {"success": True, "message": "Price tracking started"}
        else:
            return {"success": True, "message": "Price tracking already running"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start price tracking: {str(e)}")


@router.post("/stop-price-tracking")
async def stop_price_tracking():
    """Stop automated price tracking"""
    try:
        price_tracker.stop_tracking()
        return {"success": True, "message": "Price tracking stopped"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop price tracking: {str(e)}")


@router.get("/price-data")
async def get_recent_price_data(limit: int = 10, db: AsyncSession = Depends(get_db)):
    """Get recent price data"""
    try:
        result = await db.execute(
            text("""
                SELECT token_pair, price, source, timestamp
                FROM price_data
                ORDER BY timestamp DESC
                LIMIT :limit
            """),
            {"limit": limit}
        )

        prices = []
        for row in result.fetchall():
            prices.append({
                "token_pair": row.token_pair,
                "price": float(row.price),
                "source": row.source,
                "timestamp": row.timestamp.isoformat()
            })

        return {"success": True, "prices": prices}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get price data: {str(e)}")


@router.get("/price-tracking-status")
async def get_price_tracking_status():
    """Get price tracking status"""
    try:
        return {
            "success": True,
            "is_running": price_tracker.running,
            "message": "Price tracking is running" if price_tracker.running else "Price tracking is stopped"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get tracking status: {str(e)}")


@router.post("/start-automated-trading")
async def start_automated_trading():
    """Start automated trading strategy"""
    try:
        if not trading_strategy.running:
            asyncio.create_task(trading_strategy.start_strategy())
            return {"success": True, "message": "Automated trading started"}
        else:
            return {"success": True, "message": "Automated trading already running"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start trading: {str(e)}")


@router.post("/stop-automated-trading")
async def stop_automated_trading():
    """Stop automated trading strategy"""
    try:
        trading_strategy.stop_strategy()
        return {"success": True, "message": "Automated trading stopped"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop trading: {str(e)}")


@router.get("/trading-status")
async def get_trading_status():
    """Get automated trading status"""
    try:
        return {
            "success": True,
            "price_tracking": price_tracker.running,
            "automated_trading": trading_strategy.running,
            "strategy": trading_strategy.strategy_name
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get trading status: {str(e)}")


@router.post("/trade")
async def trade(request: TradeRequest, db: AsyncSession = Depends(get_db)):
    """Execute any token to any token trade"""
    try:
        print(f"💱 Trade request: {request.amount} {request.fromToken} -> {request.toToken}")

        # 1. Get bot wallet from database
        bot_wallet = await BotWallet.get_or_create_bot_wallet()
        print(f"🤖 Using bot wallet: {bot_wallet['address']}")

        # 2. Validate tokens
        if request.fromToken not in TOKEN_MINTS:
            raise HTTPException(status_code=400, detail=f"Unsupported token: {request.fromToken}")
        if request.toToken not in TOKEN_MINTS:
            raise HTTPException(status_code=400, detail=f"Unsupported token: {request.toToken}")

        # 3. Get current tokens from database (more reliable than live fetch)
        tokens = bot_wallet.get('tokens', {})
        from_balance = tokens.get(request.fromToken, 0.0)

        if request.amount > from_balance:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient {request.fromToken} balance. Available: {from_balance}, Requested: {request.amount}"
            )

        # 4. Convert amount to raw units for Jupiter
        from_decimals = TOKEN_DECIMALS[request.fromToken]
        raw_amount = int(request.amount * (10 ** from_decimals))

        # 5. Get Jupiter quote
        async with aiohttp.ClientSession() as session:
            quote_url = "https://quote-api.jup.ag/v6/quote"
            params = {
                "inputMint": TOKEN_MINTS[request.fromToken],
                "outputMint": TOKEN_MINTS[request.toToken],
                "amount": raw_amount,
                "slippageBps": 50  # 0.5% slippage
            }

            async with session.get(quote_url, params=params) as response:
                if response.status == 200:
                    quote_data = await response.json()

                    # Calculate output amount
                    to_decimals = TOKEN_DECIMALS[request.toToken]
                    output_amount = float(quote_data["outAmount"]) / (10 ** to_decimals)

                    print(f"💱 Quote: {request.amount} {request.fromToken} -> {output_amount} {request.toToken}")

                    # 6. Execute the swap
                    swap_result = await BotWallet.execute_jupiter_swap(
                        bot_wallet['address'],
                        bot_wallet['private_key'],
                        quote_data
                    )

                    if swap_result["success"]:
                        print(f"✅ Trade completed: {swap_result['signature']}")

                        # 7. Save complete trade to database
                        trade_id = f"trade_{int(time.time())}"
                        await db.execute(
                            text("""
                                INSERT INTO trades (
                                    trade_id, token_symbol, action, price, profit_loss, status,
                                    wallet_address, input_token, output_token, input_amount, output_amount,
                                    trade_action, signature, fee_sol
                                )
                                VALUES (
                                    :trade_id, :symbol, 'swap', :price, 0, 'completed',
                                    :wallet_address, :input_token, :output_token, :input_amount, :output_amount,
                                    'manual_swap', :signature, 0.000105
                                )
                            """),
                            {
                                "trade_id": trade_id,
                                "symbol": f"{request.fromToken}/{request.toToken}",
                                "price": output_amount / request.amount if request.amount > 0 else 0,
                                "wallet_address": bot_wallet['address'],
                                "input_token": request.fromToken,
                                "output_token": request.toToken,
                                "input_amount": request.amount,
                                "output_amount": output_amount,
                                "signature": swap_result["signature"]
                            }
                        )
                        await db.commit()
                        print(f"💾 Trade saved to database: {trade_id}")

                        # 8. Update tokens in database after successful trade
                        updated_tokens = await blockchain_fetcher.fetch_all_tokens(bot_wallet['address'])
                        await BotWallet.update_bot_tokens(bot_wallet['address'], updated_tokens)

                        return {
                            "success": True,
                            "message": "Trade completed successfully",
                            "signature": swap_result["signature"],
                            "inputAmount": request.amount,
                            "outputAmount": output_amount,
                            "inputToken": request.fromToken,
                            "outputToken": request.toToken
                        }
                    else:
                        raise HTTPException(status_code=500, detail=swap_result["error"])
                else:
                    error_text = await response.text()
                    raise HTTPException(status_code=400, detail=f"Jupiter quote failed: {error_text}")

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Trade error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Trade failed: {str(e)}")
