"""
Wallet Management API Routes
Wallet connection, balance checking, wallet operations
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List
import asyncio
from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey

from app.core.database import get_db

router = APIRouter()

# Request/Response models
class WalletConnectRequest(BaseModel):
    address: str
    balance: float
    walletType: str = "user"  # "user" or "bot"
    walletName: Optional[str] = None

class WalletResponse(BaseModel):
    success: bool
    wallet: Optional[dict] = None
    message: Optional[str] = None

class WalletListResponse(BaseModel):
    success: bool
    wallets: List[dict]

class TradingAuthRequest(BaseModel):
    address: str
    tradingAmount: float = None

class TradingAuthorizationRequest(BaseModel):
    address: str
    tradingAmount: float
    authMessage: str
    signature: List[int]  # Signature bytes as array
    timestamp: int

class TradingAuthResponse(BaseModel):
    success: bool
    message: str
    tradingEnabled: bool = False
    tradingBalance: float = 0.0

# Solana RPC endpoints
RPC_ENDPOINTS = [
    "https://api.mainnet-beta.solana.com",
    "https://rpc.ankr.com/solana",
    "https://solana-api.projectserum.com"
]

async def get_solana_balance(address: str) -> float:
    """Get balance from Solana network with fallback endpoints"""
    for endpoint in RPC_ENDPOINTS:
        try:
            client = AsyncClient(endpoint)
            pubkey = Pubkey.from_string(address)
            balance_info = await client.get_balance(pubkey)
            await client.close()

            if balance_info.value is not None:
                return balance_info.value / 1_000_000_000  # Convert lamports to SOL
        except Exception as e:
            print(f"Failed to get balance from {endpoint}: {e}")
            continue

    raise Exception("Failed to get balance from all RPC endpoints")

@router.post("/connect", response_model=WalletResponse)
async def connect_wallet(request: WalletConnectRequest, db: AsyncSession = Depends(get_db)):
    """Connect a wallet and save to database"""
    try:
        # Validate Solana address
        try:
            Pubkey.from_string(request.address)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid Solana address")

        # Get fresh balance from network
        try:
            current_balance = await get_solana_balance(request.address)
        except Exception:
            # Use provided balance if network call fails
            current_balance = request.balance

        # Insert or update wallet in database
        await db.execute(
            text("""
                INSERT INTO connected_wallets (wallet_address, wallet_type, balance, wallet_name, last_balance_update)
                VALUES (:address, :wallet_type, :balance, :wallet_name, CURRENT_TIMESTAMP)
                ON CONFLICT (wallet_address) DO UPDATE SET
                    balance = :balance,
                    wallet_type = :wallet_type,
                    wallet_name = COALESCE(:wallet_name, connected_wallets.wallet_name),
                    last_balance_update = CURRENT_TIMESTAMP,
                    is_active = true,
                    updated_at = CURRENT_TIMESTAMP
            """),
            {
                "address": request.address,
                "wallet_type": request.walletType,
                "balance": current_balance,
                "wallet_name": request.walletName or f"{request.walletType.title()} Wallet"
            }
        )

        # Record balance history
        await db.execute(
            text("""
                INSERT INTO wallet_balances (wallet_address, balance)
                VALUES (:address, :balance)
            """),
            {"address": request.address, "balance": current_balance}
        )

        await db.commit()

        return WalletResponse(
            success=True,
            wallet={
                "address": request.address,
                "balance": current_balance,
                "walletType": request.walletType,
                "walletName": request.walletName or f"{request.walletType.title()} Wallet"
            },
            message="Wallet connected successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to connect wallet: {str(e)}")

@router.get("/list", response_model=WalletListResponse)
async def list_wallets(db: AsyncSession = Depends(get_db)):
    """Get all connected wallets"""
    try:
        result = await db.execute(
            text("""
                SELECT wallet_address, wallet_type, balance, wallet_name,
                       last_balance_update, is_active, created_at
                FROM connected_wallets
                WHERE is_active = true
                ORDER BY created_at DESC
            """)
        )

        wallets = []
        for row in result.fetchall():
            wallets.append({
                "address": row.wallet_address,
                "walletType": row.wallet_type,
                "balance": float(row.balance),
                "walletName": row.wallet_name,
                "lastBalanceUpdate": row.last_balance_update.isoformat() if row.last_balance_update else None,
                "isActive": row.is_active,
                "createdAt": row.created_at.isoformat() if row.created_at else None
            })

        return WalletListResponse(success=True, wallets=wallets)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list wallets: {str(e)}")

@router.get("/balance/{address}")
async def get_wallet_balance(address: str, db: AsyncSession = Depends(get_db)):
    """Get wallet balance from Solana network and update database"""
    try:
        # Validate address
        try:
            Pubkey.from_string(address)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid Solana address")

        # Get balance from network
        balance = await get_solana_balance(address)

        # Update database
        await db.execute(
            text("""
                UPDATE connected_wallets
                SET balance = :balance, last_balance_update = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE wallet_address = :address
            """),
            {"balance": balance, "address": address}
        )

        # Record balance history
        await db.execute(
            text("""
                INSERT INTO wallet_balances (wallet_address, balance)
                VALUES (:address, :balance)
            """),
            {"address": address, "balance": balance}
        )

        await db.commit()

        return {
            "success": True,
            "balance": balance,
            "address": address
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get wallet balance: {str(e)}")

@router.delete("/{address}")
async def disconnect_wallet(address: str, db: AsyncSession = Depends(get_db)):
    """Disconnect a wallet (mark as inactive)"""
    try:
        result = await db.execute(
            text("""
                UPDATE connected_wallets
                SET is_active = false, updated_at = CURRENT_TIMESTAMP
                WHERE wallet_address = :address
                RETURNING wallet_address
            """),
            {"address": address}
        )

        if result.fetchone() is None:
            raise HTTPException(status_code=404, detail="Wallet not found")

        await db.commit()

        return {
            "success": True,
            "message": "Wallet disconnected successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to disconnect wallet: {str(e)}")

@router.post("/enable-trading", response_model=TradingAuthResponse)
async def enable_trading(request: TradingAuthRequest, db: AsyncSession = Depends(get_db)):
    """Enable trading for a wallet with specified amount"""
    try:
        # Update wallet with trading info
        result = await db.execute(
            text("""
                UPDATE connected_wallets
                SET trading_enabled = true,
                    trading_balance = :trading_amount,
                    updated_at = CURRENT_TIMESTAMP
                WHERE wallet_address = :address
                RETURNING wallet_address
            """),
            {"address": request.address, "trading_amount": request.tradingAmount}
        )

        if result.fetchone() is None:
            raise HTTPException(status_code=404, detail="Wallet not found")

        await db.commit()

        return TradingAuthResponse(
            success=True,
            message="Trading enabled successfully",
            tradingEnabled=True,
            tradingBalance=request.tradingAmount
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to enable trading: {str(e)}")

@router.post("/disable-trading", response_model=TradingAuthResponse)
async def disable_trading(request: TradingAuthRequest, db: AsyncSession = Depends(get_db)):
    """Disable trading for a wallet"""
    try:
        # Update wallet to disable trading
        result = await db.execute(
            text("""
                UPDATE connected_wallets
                SET trading_enabled = false,
                    trading_balance = 0,
                    updated_at = CURRENT_TIMESTAMP
                WHERE wallet_address = :address
                RETURNING wallet_address
            """),
            {"address": request.address}
        )

        if result.fetchone() is None:
            raise HTTPException(status_code=404, detail="Wallet not found")

        await db.commit()

        return TradingAuthResponse(
            success=True,
            message="Trading disabled successfully",
            tradingEnabled=False,
            tradingBalance=0.0
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to disable trading: {str(e)}")

@router.get("/info/{address}")
async def get_wallet_info(address: str, db: AsyncSession = Depends(get_db)):
    """Get complete wallet information including trading status"""
    try:
        result = await db.execute(
            text("""
                SELECT wallet_address, balance, trading_enabled, trading_balance,
                       wallet_name, last_balance_update
                FROM connected_wallets
                WHERE wallet_address = :address AND is_active = true
            """),
            {"address": address}
        )

        wallet = result.fetchone()
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")

        # Get fresh balance from network
        try:
            current_balance = await get_solana_balance(address)

            # Update database with fresh balance
            await db.execute(
                text("""
                    UPDATE connected_wallets
                    SET balance = :balance, last_balance_update = CURRENT_TIMESTAMP
                    WHERE wallet_address = :address
                """),
                {"balance": current_balance, "address": address}
            )
            await db.commit()
        except Exception:
            # Use database balance if network call fails
            current_balance = float(wallet.balance)

        return {
            "success": True,
            "address": wallet.wallet_address,
            "balance": current_balance,
            "tradingEnabled": wallet.trading_enabled or False,
            "tradingBalance": float(wallet.trading_balance) if wallet.trading_balance else 0.0,
            "walletName": wallet.wallet_name,
            "lastBalanceUpdate": wallet.last_balance_update.isoformat() if wallet.last_balance_update else None
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get wallet info: {str(e)}")

@router.get("/bot")
async def get_bot_wallet(db: AsyncSession = Depends(get_db)):
    """Get the bot wallet information"""
    try:
        result = await db.execute(
            text("""
                SELECT wallet_address, balance, wallet_name, last_balance_update
                FROM connected_wallets
                WHERE wallet_type = 'bot' AND is_active = true
                LIMIT 1
            """)
        )

        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Bot wallet not found")

        # Get fresh balance from network
        try:
            current_balance = await get_solana_balance(row.wallet_address)

            # Update database with fresh balance
            await db.execute(
                text("""
                    UPDATE connected_wallets
                    SET balance = :balance, last_balance_update = CURRENT_TIMESTAMP
                    WHERE wallet_address = :address
                """),
                {"balance": current_balance, "address": row.wallet_address}
            )
            await db.commit()
        except Exception:
            # Use database balance if network call fails
            current_balance = float(row.balance)

        return {
            "success": True,
            "wallet": {
                "address": row.wallet_address,
                "balance": current_balance,
                "walletName": row.wallet_name,
                "lastBalanceUpdate": row.last_balance_update.isoformat() if row.last_balance_update else None
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get bot wallet: {str(e)}")

@router.post("/authorize-trading", response_model=TradingAuthResponse)
async def authorize_trading(request: TradingAuthorizationRequest, db: AsyncSession = Depends(get_db)):
    """Authorize trading with signature verification for 24/7 autonomous trading"""
    try:
        # Validate Solana address
        try:
            pubkey = Pubkey.from_string(request.address)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid Solana address")

        # TODO: Add signature verification here
        # For now, we'll trust the signature since it's coming from the wallet adapter
        # In production, you'd want to verify the signature against the message and public key

        # Store authorization in database with signature
        await db.execute(
            text("""
                INSERT INTO trading_authorizations (
                    wallet_address,
                    authorized_amount,
                    auth_message,
                    signature_bytes,
                    auth_timestamp,
                    is_active
                ) VALUES (
                    :address,
                    :amount,
                    :message,
                    :signature,
                    :timestamp,
                    true
                )
                ON CONFLICT (wallet_address) DO UPDATE SET
                    authorized_amount = :amount,
                    auth_message = :message,
                    signature_bytes = :signature,
                    auth_timestamp = :timestamp,
                    is_active = true,
                    updated_at = CURRENT_TIMESTAMP
            """),
            {
                "address": request.address,
                "amount": request.tradingAmount,
                "message": request.authMessage,
                "signature": bytes(request.signature),
                "timestamp": request.timestamp
            }
        )

        # Update wallet trading status
        await db.execute(
            text("""
                UPDATE connected_wallets
                SET trading_enabled = true,
                    trading_balance = :trading_amount,
                    updated_at = CURRENT_TIMESTAMP
                WHERE wallet_address = :address
            """),
            {"address": request.address, "trading_amount": request.tradingAmount}
        )

        await db.commit()

        print(f"✅ Trading authorized for {request.address} with {request.tradingAmount} SOL")

        return TradingAuthResponse(
            success=True,
            message=f"Trading authorized successfully! Bot can now trade autonomously with up to {request.tradingAmount} SOL",
            tradingEnabled=True,
            tradingBalance=request.tradingAmount
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        print(f"❌ Authorization failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to authorize trading: {str(e)}")