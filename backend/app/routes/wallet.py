"""
Clean Wallet Routes - Database-First Architecture
Only essential endpoints: bot wallet info and trading
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.bot_wallet import BotWallet
from app.core.blockchain_fetcher import blockchain_fetcher
import aiohttp

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


@router.post("/trade")
async def trade(request: TradeRequest):
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

                        # 7. Update tokens in database after successful trade
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