"""
Blockchain Token Fetcher
Fetches ALL tokens for any wallet address from Solana blockchain
"""

import aiohttp
import json
from typing import Dict, List, Any


class BlockchainTokenFetcher:
    """Fetches live token balances from Solana blockchain"""

    def __init__(self):
        self.rpc_url = "https://api.mainnet-beta.solana.com"

    async def fetch_all_tokens(self, wallet_address: str) -> Dict[str, Any]:
        """
        Fetch ALL tokens for a wallet address including SOL and all SPL tokens

        Returns:
        {
            "SOL": 0.123,
            "USDT": 45.67,
            "USDC": 0.0,
            "tokenMint1": 100.0,
            "tokenMint2": 0.5,
            ...
        }
        """
        tokens = {}

        async with aiohttp.ClientSession() as session:
            # 1. Get SOL balance
            sol_balance = await self._get_sol_balance(session, wallet_address)
            tokens["SOL"] = sol_balance

            # 2. Get all SPL token balances
            spl_tokens = await self._get_all_spl_tokens(session, wallet_address)
            tokens.update(spl_tokens)

        return tokens

    async def _get_sol_balance(self, session: aiohttp.ClientSession, wallet_address: str) -> float:
        """Get SOL balance for wallet"""
        try:
            payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getBalance",
                "params": [wallet_address]
            }

            async with session.post(self.rpc_url, json=payload) as response:
                if response.status == 200:
                    data = await response.json()
                    if "result" in data and "value" in data["result"]:
                        lamports = data["result"]["value"]
                        return lamports / 1_000_000_000  # Convert to SOL

        except Exception as e:
            print(f"Error fetching SOL balance for {wallet_address}: {e}")

        return 0.0

    async def _get_all_spl_tokens(self, session: aiohttp.ClientSession, wallet_address: str) -> Dict[str, float]:
        """Get ALL SPL token balances for wallet"""
        tokens = {}

        try:
            # Known important token mints
            known_tokens = {
                "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
                "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
                "So11111111111111111111111111111111111111112": "WSOL"
            }

            payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getTokenAccountsByOwner",
                "params": [
                    wallet_address,
                    {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
                    {"encoding": "jsonParsed"}
                ]
            }

            async with session.post(self.rpc_url, json=payload) as response:
                if response.status == 200:
                    data = await response.json()

                    if "result" in data and "value" in data["result"]:
                        token_accounts = data["result"]["value"]

                        for account in token_accounts:
                            try:
                                parsed_info = account["account"]["data"]["parsed"]["info"]
                                token_amount = parsed_info["tokenAmount"]
                                mint = parsed_info["mint"]

                                ui_amount = token_amount.get("uiAmount", 0) or 0

                                # Use known token name or mint address
                                token_name = known_tokens.get(mint, mint)
                                tokens[token_name] = float(ui_amount)

                            except Exception as e:
                                print(f"Error parsing token account: {e}")
                                continue

        except Exception as e:
            print(f"Error fetching SPL tokens for {wallet_address}: {e}")

        return tokens

    async def get_token_metadata(self, mint_address: str) -> Dict[str, Any]:
        """Get token metadata (name, symbol, etc.) for a mint address"""
        # This would integrate with token metadata APIs
        # For now, return basic info
        return {
            "mint": mint_address,
            "name": "Unknown Token",
            "symbol": mint_address[:8] + "...",
            "decimals": 6
        }


# Global instance
blockchain_fetcher = BlockchainTokenFetcher()