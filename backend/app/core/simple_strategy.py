"""
Simple Trading Strategy v1
- Buy when price is below 5-minute average
- Sell when we have 0.5% profit or 2% loss
"""

import asyncio
import asyncpg
import os
import statistics
from datetime import datetime, timedelta
from app.core.bot_wallet import BotWallet

class SimpleStrategy:
    """Simple mean reversion + profit taking strategy"""

    def __init__(self):
        self.running = False
        self.db_url = os.getenv('DATABASE_URL', 'postgresql://dev:devpassword@localhost:5433/tradingbot')
        self.strategy_name = "Conservative"

    async def get_average_price(self, token_pair: str, minutes: int = 5) -> float:
        """Get average price over last X minutes"""
        conn = await asyncpg.connect(self.db_url)
        try:
            result = await conn.fetch("""
                SELECT price FROM price_data
                WHERE token_pair = $1
                AND timestamp >= CURRENT_TIMESTAMP - INTERVAL '%s minutes'
                ORDER BY timestamp DESC
            """ % minutes, token_pair)

            if len(result) >= 3:  # Need at least 3 data points
                prices = [float(row['price']) for row in result]
                avg = statistics.mean(prices)
                print(f"📊 {minutes}m average: ${avg:.4f} ({len(prices)} points)")
                return avg
            else:
                print(f"⚠️ Not enough data for {minutes}m average (need 3+, have {len(result)})")
                return 0.0
        finally:
            await conn.close()

    async def get_open_position(self, token_pair: str) -> dict:
        """Check if we have an open position"""
        conn = await asyncpg.connect(self.db_url)
        try:
            result = await conn.fetchrow("""
                SELECT * FROM positions
                WHERE token_pair = $1 AND is_open = true
                ORDER BY opened_at DESC LIMIT 1
            """, token_pair)

            if result:
                return dict(result)
            return None
        finally:
            await conn.close()

    async def create_position(self, token_pair: str, entry_price: float, amount: float):
        """Create new position when we buy"""
        conn = await asyncpg.connect(self.db_url)
        try:
            target_profit = entry_price * 1.005  # 0.5% profit target
            stop_loss = entry_price * 0.98       # 2% stop loss

            await conn.execute("""
                INSERT INTO positions (
                    token_pair, position_type, entry_price, amount,
                    target_profit_price, stop_loss_price, strategy_name
                ) VALUES ($1, 'long', $2, $3, $4, $5, $6)
            """, token_pair, entry_price, amount, target_profit, stop_loss, self.strategy_name)

            print(f"📈 Opened position: {amount:.4f} SOL at ${entry_price:.4f}")
            print(f"🎯 Target: ${target_profit:.4f} (+0.5%) | Stop: ${stop_loss:.4f} (-2%)")

        finally:
            await conn.close()

    async def close_position(self, position_id: str, close_reason: str):
        """Close position when we sell"""
        conn = await asyncpg.connect(self.db_url)
        try:
            await conn.execute("""
                UPDATE positions
                SET is_open = false, closed_at = CURRENT_TIMESTAMP, close_reason = $1
                WHERE id = $2
            """, close_reason, position_id)

            print(f"📉 Closed position: {close_reason}")
        finally:
            await conn.close()

    async def should_buy(self, current_price: float) -> bool:
        """Check if we should buy SOL"""
        # Don't buy if we already have a position
        position = await self.get_open_position("SOL/USDT")
        if position:
            print(f"⏸️ Already have open position, skipping buy signal")
            return False

        # Get 5-minute average
        avg_price = await self.get_average_price("SOL/USDT", 5)
        if avg_price == 0:
            return False

        # Buy if current price is 0.5% below average
        threshold = avg_price * 0.995  # 0.5% below average

        if current_price < threshold:
            deviation = ((current_price - avg_price) / avg_price) * 100
            print(f"🟢 BUY SIGNAL: Price ${current_price:.4f} is {abs(deviation):.2f}% below 5m avg ${avg_price:.4f}")
            return True

        return False

    async def should_sell(self, current_price: float) -> tuple[bool, str]:
        """Check if we should sell SOL"""
        position = await self.get_open_position("SOL/USDT")
        if not position:
            return False, ""

        entry_price = float(position['entry_price'])
        target_price = float(position['target_profit_price'])
        stop_price = float(position['stop_loss_price'])

        # Check for profit target
        if current_price >= target_price:
            profit_percent = ((current_price - entry_price) / entry_price) * 100
            print(f"🟢 SELL SIGNAL (PROFIT): ${current_price:.4f} hit target ${target_price:.4f} (+{profit_percent:.2f}%)")
            return True, "take_profit"

        # Check for stop loss
        if current_price <= stop_price:
            loss_percent = ((current_price - entry_price) / entry_price) * 100
            print(f"🔴 SELL SIGNAL (STOP): ${current_price:.4f} hit stop ${stop_price:.4f} ({loss_percent:.2f}%)")
            return True, "stop_loss"

        return False, ""

    async def execute_buy(self, current_price: float):
        """Execute buy trade"""
        try:
            # Get bot wallet balance
            bot_wallet = await BotWallet.get_or_create_bot_wallet()
            bot_balance = await BotWallet.get_bot_balance(bot_wallet['address'])

            # Use 5% of bot wallet (Conservative strategy)
            trade_amount = bot_balance * 0.05

            if trade_amount < 0.001:  # Minimum trade
                print(f"⚠️ Trade amount too small: {trade_amount:.6f} SOL")
                return

            print(f"💰 Executing BUY: {trade_amount:.4f} SOL worth at ${current_price:.4f}")

            # Execute trade via existing trade endpoint
            import aiohttp
            async with aiohttp.ClientSession() as session:
                data = {
                    "fromToken": "SOL",
                    "toToken": "USDT",
                    "amount": trade_amount
                }

                async with session.post("http://localhost:8000/api/wallet/trade", json=data) as response:
                    if response.status == 200:
                        result = await response.json()
                        print(f"✅ Buy executed: {result.get('signature', 'No signature')}")

                        # Create position record
                        await self.create_position("SOL/USDT", current_price, trade_amount)
                    else:
                        error = await response.text()
                        print(f"❌ Buy failed: {error}")

        except Exception as e:
            print(f"❌ Error executing buy: {e}")

    async def execute_sell(self, current_price: float, reason: str):
        """Execute sell trade"""
        try:
            position = await self.get_open_position("SOL/USDT")
            if not position:
                return

            # Get USDT balance from bot wallet
            bot_wallet = await BotWallet.get_or_create_bot_wallet()
            tokens = bot_wallet.get('tokens', {})
            usdt_balance = tokens.get('USDT', 0.0)

            if usdt_balance < 1.0:  # Minimum USDT to trade
                print(f"⚠️ USDT balance too low: {usdt_balance:.2f}")
                return

            # Sell 90% of USDT back to SOL
            trade_amount = usdt_balance * 0.9

            print(f"💰 Executing SELL: {trade_amount:.2f} USDT back to SOL at ${current_price:.4f}")

            # Execute trade via existing trade endpoint
            import aiohttp
            async with aiohttp.ClientSession() as session:
                data = {
                    "fromToken": "USDT",
                    "toToken": "SOL",
                    "amount": trade_amount
                }

                async with session.post("http://localhost:8000/api/wallet/trade", json=data) as response:
                    if response.status == 200:
                        result = await response.json()
                        print(f"✅ Sell executed: {result.get('signature', 'No signature')}")

                        # Close position
                        await self.close_position(position['id'], reason)
                    else:
                        error = await response.text()
                        print(f"❌ Sell failed: {error}")

        except Exception as e:
            print(f"❌ Error executing sell: {e}")

    async def strategy_cycle(self):
        """Single strategy execution cycle"""
        try:
            # Get latest price
            conn = await asyncpg.connect(self.db_url)
            result = await conn.fetchrow("""
                SELECT price FROM price_data
                WHERE token_pair = 'SOL/USDT'
                ORDER BY timestamp DESC LIMIT 1
            """)
            await conn.close()

            if not result:
                print("⚠️ No price data available")
                return

            current_price = float(result['price'])
            print(f"💱 Current SOL/USDT: ${current_price:.4f}")

            # Check if we should sell first (if we have position)
            should_sell, sell_reason = await self.should_sell(current_price)
            if should_sell:
                await self.execute_sell(current_price, sell_reason)
                return

            # Check if we should buy
            if await self.should_buy(current_price):
                await self.execute_buy(current_price)

        except Exception as e:
            print(f"❌ Strategy cycle error: {e}")

    async def start_strategy(self):
        """Start automated trading strategy"""
        self.running = True
        print("🤖 Starting automated trading strategy...")

        while self.running:
            try:
                await self.strategy_cycle()
                await asyncio.sleep(60)  # Check every minute
            except Exception as e:
                print(f"❌ Strategy error: {e}")
                await asyncio.sleep(30)  # Retry in 30s on error

    def stop_strategy(self):
        """Stop automated trading"""
        self.running = False
        print("🛑 Automated trading stopped")

# Global instance
trading_strategy = SimpleStrategy()
