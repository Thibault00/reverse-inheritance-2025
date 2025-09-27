"""
Database connection and session management
PostgreSQL with async SQLAlchemy
"""

import asyncpg
import os
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

# Database URL from environment - use existing trading-bot-db on port 5433
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://dev:devpassword@localhost:5433/tradingbot")

# Convert to async URL
ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

# Create async engine
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=True,  # Log SQL queries in development
    future=True,
    pool_pre_ping=True,
    pool_recycle=3600,  # Recycle connections every hour
)

# Create session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Base class for models
class Base(DeclarativeBase):
    pass

# Database dependency
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

# Initialize database
async def init_db():
    """Initialize database connection and check health"""
    try:
        async with engine.begin() as conn:
            # Test connection
            result = await conn.execute(text("SELECT 1"))
            print("✅ Database connection successful")

            # Check if tables exist
            tables_result = await conn.execute(
                text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
            )
            tables = [row[0] for row in tables_result.fetchall()]
            print(f"📊 Found {len(tables)} tables: {tables}")

    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        raise

# Close database
async def close_db():
    """Close database connections"""
    await engine.dispose()
    print("🔌 Database connections closed")