"""
Price Tracking and Signal Generation System
Fetches prices every 30s and generates trading signals
"""

import asyncio
import aiohttp
import asyncpg
import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import statistics

class PriceTracker:
    """Tracks SOL/USDT prices and generates trading signals"""

    def __init__(self):
        self.running = False
        self.db_url = os.getenv('DATABASE_URL', 'postgresql://dev:devpassword@localhost:5433/tradingbot')

    async def get_jupiter_price(self, input_mint: str, output_mint: str, amount: int = 1_000_000_000) -> Optional[float]:
        """Get current price from Jupiter API"""
        try:
            async with aiohttp.ClientSession() as session:
                url = "https://quote-api.jup.ag/v6/quote"
                params = {
                    "inputMint": input_mint,
                    "outputMint": output_mint,
                    "amount": str(amount),
                    "slippageBps": 50
                }

                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        # Calculate price: output_amount / input_amount
                        input_amount = float(data["inAmount"]) / 1_000_000_000  # SOL
                        output_amount = float(data["outAmount"]) / 1_000_000    # USDT
                        price = output_amount / input_amount
                        return price
                    else:
                        print(f"❌ Jupiter price fetch failed: {response.status}")
                        return None
        except Exception as e:
            print(f"❌ Error fetching Jupiter price: {e}")
            return None

    async def save_price_data(self, token_pair: str, price: float):
        """Save price data to database"""
        conn = await asyncpg.connect(self.db_url)
        try:
            await conn.execute("""
                INSERT INTO price_data (token_pair, price, source, timestamp)
                VALUES ($1, $2, 'jupiter', CURRENT_TIMESTAMP)
            """, token_pair, price)

            print(f"💾 Saved price: {token_pair} = ${price:.4f}")
        finally:
            await conn.close()

    async def get_recent_prices(self, token_pair: str, minutes: int = 1) -> List[float]:
        """Get recent prices for analysis"""
        conn = await asyncpg.connect(self.db_url)
        try:
            result = await conn.fetch("""
                SELECT price FROM price_data
                WHERE token_pair = $1
                AND timestamp >= CURRENT_TIMESTAMP - INTERVAL '%s minutes'
                ORDER BY timestamp DESC
            """ % minutes, token_pair)

            return [float(row['price']) for row in result]
        finally:
            await conn.close()

    async def calculate_moving_average(self, token_pair: str, minutes: int = 1) -> Optional[float]:
        """Calculate moving average for the specified timeframe"""
        prices = await self.get_recent_prices(token_pair, minutes)
        if len(prices) >= 2:
            avg = statistics.mean(prices)
            print(f"📊 {minutes}m average for {token_pair}: ${avg:.4f} ({len(prices)} data points)")
            return avg
        return None

    async def generate_mean_reversion_signal(self, token_pair: str, current_price: float) -> Optional[Dict]:
        """Generate trading signal based on mean reversion strategy"""
        try:
            # Get 1-minute moving average
            avg_price = await self.calculate_moving_average(token_pair, 1)
            if not avg_price:
                return None

            # Calculate deviation from average
            deviation_percent = ((current_price - avg_price) / avg_price) * 100

            # Strategy parameters (from database config)
            buy_threshold = -0.5  # Buy if price is 0.5% below average
            sell_threshold = 0.5  # Sell if price is 0.5% above average

            signal = None
            if deviation_percent <= buy_threshold:
                signal = {
                    "type": "buy",
                    "strength": min(abs(deviation_percent) * 20, 100),  # Higher deviation = stronger signal
                    "reasoning": f"Price ${current_price:.4f} is {abs(deviation_percent):.2f}% below 1m average ${avg_price:.4f}",
                    "metadata": {
                        "current_price": current_price,
                        "average_price": avg_price,
                        "deviation_percent": deviation_percent,
                        "threshold_used": buy_threshold
                    }
                }
            elif deviation_percent >= sell_threshold:
                signal = {
                    "type": "sell",
                    "strength": min(deviation_percent * 20, 100),
                    "reasoning": f"Price ${current_price:.4f} is {deviation_percent:.2f}% above 1m average ${avg_price:.4f}",
                    "metadata": {
                        "current_price": current_price,
                        "average_price": avg_price,
                        "deviation_percent": deviation_percent,
                        "threshold_used": sell_threshold
                    }
                }

            if signal:
                print(f"🎯 Signal generated: {signal['type'].upper()} {token_pair} - {signal['reasoning']}")

            return signal

        except Exception as e:
            print(f"❌ Error generating signal: {e}")
            return None

    async def save_trading_signal(self, token_pair: str, signal: Dict):
        """Save trading signal to database"""
        conn = await asyncpg.connect(self.db_url)
        try:
            await conn.execute("""
                INSERT INTO trading_signals (
                    token_pair, signal_type, signal_strength, price_at_signal,
                    strategy_name, reasoning, metadata, expires_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP + INTERVAL '5 minutes')
            """,
                token_pair,
                signal['type'],
                signal['strength'],
                signal['metadata']['current_price'],
                'mean_reversion_v1',
                signal['reasoning'],
                json.dumps(signal['metadata'])
            )

            print(f"💾 Saved {signal['type']} signal for {token_pair}")
        finally:
            await conn.close()

    async def track_price_cycle(self):
        """Single price tracking cycle"""
        try:
            # SOL/USDT price tracking
            sol_mint = "So11111111111111111111111111111111111111112"
            usdt_mint = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"

            # Get current SOL/USDT price
            current_price = await self.get_jupiter_price(sol_mint, usdt_mint)
            if not current_price:
                print("❌ Failed to get SOL/USDT price")
                return

            print(f"💰 Current SOL/USDT price: ${current_price:.4f}")

            # Save price data
            await self.save_price_data("SOL/USDT", current_price)

            # Generate trading signal
            signal = await self.generate_mean_reversion_signal("SOL/USDT", current_price)
            if signal:
                await self.save_trading_signal("SOL/USDT", signal)

        except Exception as e:
            print(f"❌ Error in price tracking cycle: {e}")

    async def start_price_tracking(self):
        """Start continuous price tracking every 30 seconds"""
        self.running = True
        print("🚀 Starting price tracking (30s intervals)...")

        while self.running:
            try:
                await self.track_price_cycle()
                await asyncio.sleep(30)  # 30 second intervals
            except Exception as e:
                print(f"❌ Price tracking error: {e}")
                await asyncio.sleep(10)  # Shorter retry on error

    def stop_price_tracking(self):
        """Stop price tracking"""
        self.running = False
        print("🛑 Price tracking stopped")

# Global price tracker instance
price_tracker = PriceTracker()
