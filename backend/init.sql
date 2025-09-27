-- 🏗️ Complete Database Schema for Solana Trading Bot
-- Generated from current working database structure
-- This file recreates the EXACT database we have now

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 📊 Table: bot_status
CREATE TABLE bot_status (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    is_running BOOLEAN DEFAULT false,
    last_update TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_trades INTEGER DEFAULT 0,
    active_positions INTEGER DEFAULT 0,
    backend_connected BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

-- 📊 Table: connected_wallets
CREATE TABLE connected_wallets (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(255) NOT NULL,
    wallet_type VARCHAR(20) DEFAULT 'user',
    balance DECIMAL(20, 8) DEFAULT 0,
    last_balance_update TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    wallet_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    trading_enabled BOOLEAN DEFAULT false,
    trading_balance DECIMAL(20, 8) DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE (wallet_address)
);

-- 📊 Table: profit_data
CREATE TABLE profit_data (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    timeframe VARCHAR(20) NOT NULL,
    total_profit DECIMAL(20, 8) DEFAULT 0,
    total_loss DECIMAL(20, 8) DEFAULT 0,
    net_profit DECIMAL(20, 8) DEFAULT 0,
    win_rate DECIMAL(5, 2) DEFAULT 0,
    total_trades INTEGER DEFAULT 0,
    date_recorded DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

-- 📊 Table: strategies
CREATE TABLE strategies (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    risk_level VARCHAR(20) DEFAULT 'medium',
    max_position_size DECIMAL(10, 2) DEFAULT 10.0,
    stop_loss_percent DECIMAL(5, 2) DEFAULT 5.0,
    take_profit_percent DECIMAL(5, 2) DEFAULT 15.0,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

-- 📊 Table: trades (MAIN TRADING TABLE)
CREATE TABLE trades (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    trade_id VARCHAR(255) NOT NULL,
    token_symbol VARCHAR(50) NOT NULL,
    action VARCHAR(10) NOT NULL,
    amount BIGINT NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    profit_loss DECIMAL(20, 8) DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    wallet_address VARCHAR(255),
    input_token VARCHAR(50),
    output_token VARCHAR(50),
    input_amount DECIMAL(20, 9),
    output_amount DECIMAL(20, 9),
    trade_action VARCHAR(100),
    signature VARCHAR(255),
    PRIMARY KEY (id)
);


-- 🔒 Add constraints (CRITICAL FOR DATA INTEGRITY)
ALTER TABLE trades ADD CONSTRAINT trades_action_check CHECK (action IN ('buy', 'sell'));
ALTER TABLE trades ADD CONSTRAINT trades_status_check CHECK (status IN ('pending', 'completed', 'failed'));

-- 🎯 Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_connected_wallets_address ON connected_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_connected_wallets_type ON connected_wallets(wallet_type);
CREATE INDEX IF NOT EXISTS idx_trades_wallet_address ON trades(wallet_address);
CREATE INDEX IF NOT EXISTS idx_trades_signature ON trades(signature);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
-- Removed trading_authorizations index (table removed)
-- Removed wallet_balances index (table removed)

