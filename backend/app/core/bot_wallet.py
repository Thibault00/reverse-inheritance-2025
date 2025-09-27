"""
Bot Wallet Management - Database-First Architecture
ALWAYS fetches from database, no singleton pattern
"""

import base58
import base64
import json
from solders.keypair import Keypair
from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey
from solders.transaction import VersionedTransaction
import asyncpg
from typing import Optional, Dict, Any
import aiohttp


class BotWallet:
    """Database-first bot wallet - ALWAYS fetches from DB, no caching"""

    @staticmethod
    async def get_or_create_bot_wallet() -> Dict[str, Any]:
        """
        Get bot wallet from database or create one if none exists
        Returns: {address: str, private_key: str, keypair: Keypair, tokens: dict}
        """
        conn = await asyncpg.connect('postgresql://dev:devpassword@localhost:5433/tradingbot')

        try:
            # Try to get existing bot wallet
            result = await conn.fetchrow("""
                SELECT wallet_address, private_key, tokens
                FROM connected_wallets
                WHERE wallet_type = $1 AND is_active = true
                LIMIT 1
            """, 'bot')

            if result and result['private_key']:
                # Load existing bot wallet
                private_key_bytes = base58.b58decode(result['private_key'])
                keypair = Keypair.from_bytes(private_key_bytes)

                tokens = json.loads(result['tokens'] or '{}')

                print(f"✅ Loaded bot wallet from DB: {result['wallet_address']}")
                return {
                    "address": result['wallet_address'],
                    "private_key": result['private_key'],
                    "keypair": keypair,
                    "tokens": tokens
                }
            else:
                # Create new bot wallet
                print("🔧 Creating new bot wallet...")
                keypair = Keypair()
                private_key = base58.b58encode(bytes(keypair)).decode()
                address = str(keypair.pubkey())

                initial_tokens = {"SOL": 0.0, "USDT": 0.0, "USDC": 0.0}

                # Save to database
                await conn.execute("""
                    INSERT INTO connected_wallets
                    (wallet_address, wallet_type, balance, wallet_name, private_key, tokens, is_active)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (wallet_address) DO UPDATE SET
                        private_key = $5,
                        tokens = $6,
                        is_active = true,
                        updated_at = CURRENT_TIMESTAMP
                """, address, 'bot', 0.0, 'Trading Bot Wallet', private_key, json.dumps(initial_tokens), True)

                print(f"✅ Created new bot wallet: {address}")
                return {
                    "address": address,
                    "private_key": private_key,
                    "keypair": keypair,
                    "tokens": initial_tokens
                }

        finally:
            await conn.close()

    @staticmethod
    async def get_bot_balance(address: str) -> float:
        """Get SOL balance for bot wallet"""
        try:
            client = AsyncClient("https://api.mainnet-beta.solana.com")
            pubkey = Pubkey.from_string(address)
            balance_info = await client.get_balance(pubkey)
            await client.close()
            return balance_info.value / 1_000_000_000 if balance_info.value else 0.0
        except Exception as e:
            print(f"Error getting bot balance: {e}")
            return 0.0

    @staticmethod
    async def update_bot_tokens(address: str, tokens: Dict[str, float]):
        """Update bot wallet token balances in database"""
        conn = await asyncpg.connect('postgresql://dev:devpassword@localhost:5433/tradingbot')

        try:
            await conn.execute("""
                UPDATE connected_wallets
                SET tokens = $1,
                    balance = $2,
                    last_balance_update = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE wallet_address = $3 AND wallet_type = 'bot'
            """, json.dumps(tokens), tokens.get("SOL", 0.0), address)

            print(f"✅ Updated tokens for {address}: {len(tokens)} tokens")

        finally:
            await conn.close()

    @staticmethod
    async def sign_and_send_transaction(private_key: str, transaction_base64: str) -> Dict[str, Any]:
        """Sign and broadcast a transaction"""
        try:
            # Decode private key and create keypair
            private_key_bytes = base58.b58decode(private_key)
            keypair = Keypair.from_bytes(private_key_bytes)

            # Decode the transaction
            transaction_bytes = base64.b64decode(transaction_base64)
            transaction = VersionedTransaction.from_bytes(transaction_bytes)

            # Sign with bot wallet
            signed_transaction = VersionedTransaction(transaction.message, [keypair])

            # Send to network with fallback RPC endpoints
            rpc_endpoints = [
                "https://api.mainnet-beta.solana.com",
                "https://solana-api.projectserum.com",
                "https://rpc.ankr.com/solana"
            ]

            for rpc_url in rpc_endpoints:
                try:
                    client = AsyncClient(rpc_url)

                    # Send transaction
                    from solana.rpc.types import TxOpts
                    response = await client.send_transaction(
                        signed_transaction,
                        opts=TxOpts(skip_preflight=False, preflight_commitment="confirmed")
                    )

                    await client.close()

                    if response.value:
                        print(f"✅ Transaction sent successfully via {rpc_url}: {response.value}")
                        return {
                            "success": True,
                            "signature": str(response.value),
                            "message": "Transaction sent successfully"
                        }
                    else:
                        print(f"❌ Failed to send transaction via {rpc_url}")
                        continue

                except Exception as rpc_error:
                    print(f"❌ RPC {rpc_url} failed: {rpc_error}")
                    await client.close()
                    continue

            return {
                "success": False,
                "error": "All RPC endpoints failed"
            }

        except Exception as e:
            print(f"Error signing/sending transaction: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @staticmethod
    async def execute_jupiter_swap(address: str, private_key: str, quote_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute Jupiter swap using bot wallet"""
        try:
            print(f"🤖 Bot wallet executing Jupiter swap autonomously...")
            print(f"🤖 Bot wallet address: {address}")

            # Create Jupiter transaction using BOT WALLET as the signer
            async with aiohttp.ClientSession() as session:
                url = "https://quote-api.jup.ag/v6/swap"
                data = {
                    "userPublicKey": address,  # BOT WALLET signs and executes
                    "quoteResponse": quote_data,
                    "wrapAndUnwrapSol": True,
                    "useSharedAccounts": False,  # FIXED: Disable shared accounts to support simple AMMs
                    "feeAccount": None,
                    "computeUnitPriceMicroLamports": "auto",
                    "asLegacyTransaction": False
                }

                print(f"🔄 Creating Jupiter swap transaction...")
                async with session.post(url, json=data) as response:
                    if response.status == 200:
                        swap_data = await response.json()
                        print(f"✅ Jupiter transaction created successfully")

                        # Sign and send the transaction WITH BOT WALLET'S PRIVATE KEY
                        print(f"🔐 Signing transaction with bot wallet private key...")
                        result = await BotWallet.sign_and_send_transaction(
                            private_key,
                            swap_data.get("swapTransaction")
                        )

                        if result["success"]:
                            print(f"✅ Transaction signed and sent: {result['signature']}")
                        else:
                            print(f"❌ Transaction failed: {result['error']}")

                        return {
                            "success": result["success"],
                            "signature": result.get("signature"),
                            "error": result.get("error"),
                            "swapData": swap_data
                        }
                    else:
                        error_text = await response.text()
                        print(f"❌ Jupiter swap creation failed: {response.status} - {error_text}")
                        return {
                            "success": False,
                            "error": f"Jupiter swap creation failed: {response.status} - {error_text}"
                        }

        except Exception as e:
            print(f"❌ Error executing Jupiter swap: {e}")
            return {
                "success": False,
                "error": str(e)
            }