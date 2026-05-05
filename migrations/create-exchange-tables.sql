-- Migration: Create exchange market data tables
-- This migration creates tables for storing exchange market data (24h ticker + 7d K-line)
-- All foreign keys use identifier from tokens table (matches existing pattern)

-- Step 1: Create exchanges table (master exchange data)
CREATE TABLE IF NOT EXISTS exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  logo_url VARCHAR(255),
  api_base_url VARCHAR(255) NOT NULL,
  default_base_currency VARCHAR(50) DEFAULT 'USDT',
  is_active BOOLEAN DEFAULT true,
  rate_limit_delay_ms INTEGER DEFAULT 200,
  config JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "IDX_exchanges_code" ON exchanges(code);
CREATE INDEX IF NOT EXISTS "IDX_exchanges_name" ON exchanges(name);

-- Step 2: Create token_exchanges table (token-exchange mapping)
CREATE TABLE IF NOT EXISTS token_exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_identifier VARCHAR(50) NOT NULL,
  exchange_id UUID NOT NULL,
  exchange_symbol VARCHAR(50) NOT NULL,
  base_currency VARCHAR(10) DEFAULT 'USDT',
  is_active BOOLEAN DEFAULT true,
  verified_at TIMESTAMP,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FK_token_exchanges_token_identifier" 
    FOREIGN KEY (token_identifier) 
    REFERENCES tokens(identifier) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
  CONSTRAINT "FK_token_exchanges_exchange_id" 
    FOREIGN KEY (exchange_id) 
    REFERENCES exchanges(id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE,
  CONSTRAINT "UQ_token_exchanges_token_exchange" 
    UNIQUE (token_identifier, exchange_id)
);

CREATE INDEX IF NOT EXISTS "IDX_token_exchanges_token_identifier" ON token_exchanges(token_identifier);
CREATE INDEX IF NOT EXISTS "IDX_token_exchanges_exchange_id" ON token_exchanges(exchange_id);
CREATE INDEX IF NOT EXISTS "IDX_token_exchanges_is_active" ON token_exchanges(is_active);

-- Step 3: Create exchange_market_data_24h table (24h ticker data)
CREATE TABLE IF NOT EXISTS exchange_market_data_24h (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_identifier VARCHAR(50) NOT NULL,
  exchange_id UUID NOT NULL,
  price DECIMAL(30, 18) NOT NULL,
  volume_24h DECIMAL(30, 18) NOT NULL,
  change_24h DECIMAL(10, 4) NOT NULL,
  high_24h DECIMAL(30, 18) NOT NULL,
  low_24h DECIMAL(30, 18) NOT NULL,
  open_24h DECIMAL(30, 18) NOT NULL,
  close_24h DECIMAL(30, 18) NOT NULL,
  last_updated TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FK_exchange_market_data_24h_token_identifier" 
    FOREIGN KEY (token_identifier) 
    REFERENCES tokens(identifier) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
  CONSTRAINT "FK_exchange_market_data_24h_exchange_id" 
    FOREIGN KEY (exchange_id) 
    REFERENCES exchanges(id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE,
  CONSTRAINT "UQ_exchange_market_data_24h_token_exchange" 
    UNIQUE (token_identifier, exchange_id)
);

CREATE INDEX IF NOT EXISTS "IDX_exchange_market_data_24h_token_identifier" ON exchange_market_data_24h(token_identifier);
CREATE INDEX IF NOT EXISTS "IDX_exchange_market_data_24h_exchange_id" ON exchange_market_data_24h(exchange_id);
CREATE INDEX IF NOT EXISTS "IDX_exchange_market_data_24h_last_updated" ON exchange_market_data_24h(last_updated);

-- Step 4: Create exchange_market_data_7d table (7d K-line data)
CREATE TABLE IF NOT EXISTS exchange_market_data_7d (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_identifier VARCHAR(50) NOT NULL,
  exchange_id UUID NOT NULL,
  date DATE NOT NULL,
  open DECIMAL(30, 18) NOT NULL,
  high DECIMAL(30, 18) NOT NULL,
  low DECIMAL(30, 18) NOT NULL,
  close DECIMAL(30, 18) NOT NULL,
  volume DECIMAL(30, 18) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FK_exchange_market_data_7d_token_identifier" 
    FOREIGN KEY (token_identifier) 
    REFERENCES tokens(identifier) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
  CONSTRAINT "FK_exchange_market_data_7d_exchange_id" 
    FOREIGN KEY (exchange_id) 
    REFERENCES exchanges(id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE,
  CONSTRAINT "UQ_exchange_market_data_7d_token_exchange_date" 
    UNIQUE (token_identifier, exchange_id, date)
);

CREATE INDEX IF NOT EXISTS "IDX_exchange_market_data_7d_token_identifier" ON exchange_market_data_7d(token_identifier);
CREATE INDEX IF NOT EXISTS "IDX_exchange_market_data_7d_exchange_id" ON exchange_market_data_7d(exchange_id);
CREATE INDEX IF NOT EXISTS "IDX_exchange_market_data_7d_date" ON exchange_market_data_7d(date);

-- Step 5: Create exchange_sync_log table (audit/monitoring)
CREATE TABLE IF NOT EXISTS exchange_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID NOT NULL,
  sync_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'running',
  total_pairs INTEGER DEFAULT 0,
  processed_pairs INTEGER DEFAULT 0,
  failed_pairs INTEGER DEFAULT 0,
  error_message TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FK_exchange_sync_log_exchange_id" 
    FOREIGN KEY (exchange_id) 
    REFERENCES exchanges(id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_exchange_sync_log_exchange_id" ON exchange_sync_log(exchange_id);
CREATE INDEX IF NOT EXISTS "IDX_exchange_sync_log_sync_type" ON exchange_sync_log(sync_type);
CREATE INDEX IF NOT EXISTS "IDX_exchange_sync_log_status" ON exchange_sync_log(status);
CREATE INDEX IF NOT EXISTS "IDX_exchange_sync_log_created_at" ON exchange_sync_log(created_at);


