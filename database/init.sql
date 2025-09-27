-- Trading Bot Database Schema
-- Latest PostgreSQL 16 with modern features

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Bot status table
CREATE TABLE bot_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    is_running BOOLEAN DEFAULT false,
    last_update TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_trades INTEGER DEFAULT 0,
    active_positions INTEGER DEFAULT 0,
    backend_connected BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trades table
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_id VARCHAR(255) UNIQUE NOT NULL,
    token_symbol VARCHAR(50) NOT NULL,
    action VARCHAR(10) NOT NULL CHECK (action IN ('buy', 'sell', 'swap')),
    price DECIMAL(20, 8) NOT NULL,
    profit_loss DECIMAL(20, 8) DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    wallet_address VARCHAR(255),
    input_token VARCHAR(10),
    output_token VARCHAR(10),
    input_amount DECIMAL(20, 8),
    output_amount DECIMAL(20, 8),
    trade_action VARCHAR(50),
    signature VARCHAR(255),
    fee_sol DECIMAL(20, 9) DEFAULT 0
);

-- Profit data table
CREATE TABLE profit_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timeframe VARCHAR(20) NOT NULL,
    total_profit DECIMAL(20, 8) DEFAULT 0,
    total_loss DECIMAL(20, 8) DEFAULT 0,
    net_profit DECIMAL(20, 8) DEFAULT 0,
    win_rate DECIMAL(5, 2) DEFAULT 0,
    total_trades INTEGER DEFAULT 0,
    date_recorded DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(timeframe, date_recorded)
);

-- Trading strategies table
CREATE TABLE strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    risk_level VARCHAR(20) DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
    max_position_size DECIMAL(10, 2) DEFAULT 10.0,
    stop_loss_percent DECIMAL(5, 2) DEFAULT 5.0,
    take_profit_percent DECIMAL(5, 2) DEFAULT 15.0,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Connected wallets table
CREATE TABLE connected_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(255) UNIQUE NOT NULL,
    wallet_type VARCHAR(20) DEFAULT 'user' CHECK (wallet_type IN ('user', 'bot')),
    balance DECIMAL(20, 8) DEFAULT 0,
    last_balance_update TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    wallet_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    private_key TEXT,
    tokens JSONB DEFAULT '{}'::jsonb,
    trading_enabled BOOLEAN DEFAULT false,
    trading_balance DECIMAL(20, 8) DEFAULT 0
);

-- Simple price tracking for v1
CREATE TABLE price_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_pair VARCHAR(20) NOT NULL,  -- 'SOL/USDT'
    price DECIMAL(20, 8) NOT NULL,
    source VARCHAR(50) DEFAULT 'jupiter',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Simple positions tracking for v1
CREATE TABLE positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_pair VARCHAR(20) NOT NULL,
    position_type VARCHAR(10) NOT NULL,  -- 'long' (bought SOL)
    entry_price DECIMAL(20, 8) NOT NULL,
    amount DECIMAL(20, 8) NOT NULL,
    target_profit_price DECIMAL(20, 8),  -- sell when price reaches this
    stop_loss_price DECIMAL(20, 8),     -- sell if price drops to this
    strategy_name VARCHAR(100) NOT NULL,
    is_open BOOLEAN DEFAULT true,
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE,
    close_reason VARCHAR(50)  -- 'take_profit', 'stop_loss', 'manual'
);

-- Removed wallet_balances table (not needed)

-- Insert default bot status
INSERT INTO bot_status (is_running, total_trades, active_positions, backend_connected)
VALUES (false, 0, 0, true);

-- Insert default strategies
INSERT INTO strategies (name, risk_level, max_position_size, stop_loss_percent, take_profit_percent, is_active) VALUES
('Conservative', 'low', 5.0, 3.0, 10.0, true),
('Balanced', 'medium', 10.0, 5.0, 15.0, false),
('Aggressive', 'high', 25.0, 8.0, 25.0, false);

-- Removed complex strategy configs for v1

-- Insert bot wallet
INSERT INTO connected_wallets (wallet_address, wallet_type, wallet_name, is_active) VALUES
('DGPrryYStTsmKkMhkJrTzapbCYKvN3srHJvSHqZCWYP6', 'bot', 'Trading Bot Wallet', true);

-- Create indexes for better performance
-- Performance indexes for trades
CREATE INDEX idx_trades_timestamp ON trades(timestamp);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_token_symbol ON trades(token_symbol);
CREATE INDEX idx_trades_signature ON trades(signature);

-- Performance indexes for profit data
CREATE INDEX idx_profit_data_timeframe_date ON profit_data(timeframe, date_recorded);

-- Performance indexes for wallets
CREATE INDEX idx_connected_wallets_address ON connected_wallets(wallet_address);
CREATE INDEX idx_connected_wallets_type ON connected_wallets(wallet_type);

-- Simple index for price tracking
CREATE INDEX idx_price_data_pair_timestamp ON price_data(token_pair, timestamp DESC);

-- Update timestamps trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add update triggers
CREATE TRIGGER update_bot_status_updated_at BEFORE UPDATE ON bot_status FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profit_data_updated_at BEFORE UPDATE ON profit_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE ON strategies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
