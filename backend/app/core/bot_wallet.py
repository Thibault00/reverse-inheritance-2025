"""
Bot Wallet Management
Handles automated trading wallet with private key management
"""

import os
import base58
import base64
from solders.keypair import Keypair
from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey
from solders.transaction import VersionedTransaction
from solders.system_program import transfer, TransferParams
from solders.transaction import Transaction
from solders.message import MessageV0
import asyncio
import aiohttp
from typing import Optional

class BotWallet:
    def __init__(self):
        self.private_key = os.getenv("BOT_WALLET_PRIVATE_KEY")
        if not self.private_key:
            # Generate new bot wallet if none exists
            self.keypair = Keypair()
            print(f"🤖 Generated new bot wallet: {str(self.keypair.pubkey())}")
            print(f"🔑 Private key (SAVE THIS): {base58.b58encode(bytes(self.keypair)).decode()}")
        else:
            # Load existing bot wallet
            private_key_bytes = base58.b58decode(self.private_key)
            self.keypair = Keypair.from_bytes(private_key_bytes)
            print(f"🤖 Loaded bot wallet: {str(self.keypair.pubkey())}")

    @property
    def public_key(self) -> str:
        return str(self.keypair.pubkey())

    async def get_balance(self) -> float:
        """Get bot wallet balance"""
        client = AsyncClient("https://api.mainnet-beta.solana.com")
        try:
            balance_info = await client.get_balance(self.keypair.pubkey())
            await client.close()
            return balance_info.value / 1_000_000_000 if balance_info.value else 0.0
        except Exception as e:
            print(f"Error getting bot wallet balance: {e}")
            return 0.0

    async def sign_and_send_transaction(self, transaction_base64: str) -> dict:
        """Sign and broadcast a transaction using bot wallet"""
        try:
            # Decode the transaction
            transaction_bytes = base64.b64decode(transaction_base64)
            transaction = VersionedTransaction.from_bytes(transaction_bytes)

            # Sign with bot wallet
            transaction.sign([self.keypair])

            # Send to network
            client = AsyncClient("https://api.mainnet-beta.solana.com")

            # Send transaction
            response = await client.send_transaction(
                transaction,
                opts={"skip_preflight": False, "preflight_commitment": "confirmed"}
            )

            await client.close()

            if response.value:
                return {
                    "success": True,
                    "signature": str(response.value),
                    "message": "Transaction sent successfully"
                }
            else:
                return {
                    "success": False,
                    "error": "Failed to send transaction"
                }

        except Exception as e:
            print(f"Error signing/sending transaction: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def execute_jupiter_swap(self, quote_data: dict) -> dict:
        """Execute Jupiter swap using bot wallet"""
        try:
            # Create Jupiter transaction
            async with aiohttp.ClientSession() as session:
                url = "https://quote-api.jup.ag/v6/swap"
                data = {
                    "userPublicKey": self.public_key,
                    "quoteResponse": quote_data,
                    "wrapAndUnwrapSol": True,
                    "useSharedAccounts": True,
                    "feeAccount": None,
                    "computeUnitPriceMicroLamports": "auto",
                    "asLegacyTransaction": False
                }

                async with session.post(url, json=data) as response:
                    if response.status == 200:
                        swap_data = await response.json()

                        # Sign and send the transaction
                        result = await self.sign_and_send_transaction(
                            swap_data.get("swapTransaction")
                        )

                        return {
                            "success": result["success"],
                            "signature": result.get("signature"),
                            "error": result.get("error"),
                            "swapData": swap_data
                        }
                    else:
                        return {
                            "success": False,
                            "error": f"Jupiter swap creation failed: {response.status}"
                        }

        except Exception as e:
            print(f"Error executing Jupiter swap: {e}")
            return {
                "success": False,
                "error": str(e)
            }

# Global bot wallet instance
bot_wallet = BotWallet()