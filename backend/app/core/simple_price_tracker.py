"""
Simple Price Tracker - Step 1
Just tracks SOL/USDT price every 30 seconds
"""

import asyncio
import aiohttp
import asyncpg
import os
from datetime import datetime

class SimplePriceTracker:
    """Simple SOL/USDT price tracker"""

    def __init__(self):
        self.running = False
        self.db_url = os.getenv('DATABASE_URL', 'postgresql://dev:devpassword@localhost:5433/tradingbot')

    async def get_sol_usdt_price(self) -> float:
        """Get current SOL/USDT price from Jupiter"""
        try:
            async with aiohttp.ClientSession() as session:
                url = "https://quote-api.jup.ag/v6/quote"
                params = {
                    "inputMint": "So11111111111111111111111111111111111111112",  # SOL
                    "outputMint": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  # USDT
                    "amount": "1000000000",  # 1 SOL in lamports
                    "slippageBps": "50"
                }

                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        # Calculate price: USDT received for 1 SOL
                        usdt_amount = float(data["outAmount"]) / 1_000_000  # Convert from USDT decimals
                        print(f"💰 SOL/USDT price: ${usdt_amount:.4f}")
                        return usdt_amount
                    else:
                        print(f"❌ Jupiter API failed: {response.status}")
                        return 0.0
        except Exception as e:
            print(f"❌ Error fetching price: {e}")
            return 0.0

    async def save_price(self, price: float):
        """Save price to database and trigger strategy"""
        conn = await asyncpg.connect(self.db_url)
        try:
            await conn.execute("""
                INSERT INTO price_data (token_pair, price, source)
                VALUES ($1, $2, $3)
            """, "SOL/USDT", price, "jupiter")

            print(f"💾 Price saved: SOL/USDT = ${price:.4f}")

            # Trigger strategy check on new price
            await self.trigger_strategy_check(price)

        except Exception as e:
            print(f"❌ Error saving price: {e}")
        finally:
            await conn.close()

    async def trigger_strategy_check(self, price: float):
        """Trigger strategy to check for trading opportunities"""
        try:
            from app.core.simple_strategy import trading_strategy
            if trading_strategy.running:
                print(f"🤖 Triggering strategy check for price ${price:.4f}")
                # Don't await - run in background to avoid blocking price tracking
                asyncio.create_task(trading_strategy.strategy_cycle())
        except Exception as e:
            print(f"❌ Error triggering strategy: {e}")

    async def price_tracking_cycle(self):
        """Single price tracking cycle"""
        print("🔄 Fetching SOL/USDT price...")
        price = await self.get_sol_usdt_price()

        if price > 0:
            await self.save_price(price)
        else:
            print("❌ Failed to get valid price")

    async def start_tracking(self):
        """Start price tracking every 30 seconds"""
        self.running = True
        print("🚀 Starting SOL/USDT price tracking (30s intervals)...")

        while self.running:
            try:
                await self.price_tracking_cycle()
                await asyncio.sleep(30)  # 30 seconds
            except Exception as e:
                print(f"❌ Price tracking error: {e}")
                await asyncio.sleep(10)  # Retry in 10s on error

    def stop_tracking(self):
        """Stop price tracking"""
        self.running = False
        print("🛑 Price tracking stopped")

# Global instance
price_tracker = SimplePriceTracker()
