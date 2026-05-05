-- Purpose: Database migration to create token_holder_snapshots table
-- What: Stores daily snapshots of token holder data including total holders,
--      top holders list (JSONB), and calculated percentages (top 10%, 20%, 50%)
--      for historical tracking and chart generation

CREATE TABLE IF NOT EXISTS token_holder_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR(50) NOT NULL,
  snapshot_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  holder_total INTEGER NOT NULL CHECK (holder_total >= 0),
  transfer_total BIGINT CHECK (transfer_total >= 0),
  mint_total INTEGER CHECK (mint_total >= 0),
  top_holders JSONB NOT NULL,
  top_10_percentage DECIMAL(5,2) CHECK (top_10_percentage >= 0 AND top_10_percentage <= 100),
  top_20_percentage DECIMAL(5,2) CHECK (top_20_percentage >= 0 AND top_20_percentage <= 100),
  top_50_percentage DECIMAL(5,2) CHECK (top_50_percentage >= 0 AND top_50_percentage <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_ticker_date 
ON token_holder_snapshots(ticker, (snapshot_timestamp::date));

ALTER TABLE token_holder_snapshots
ADD CONSTRAINT fk_token_holder_snapshots_ticker
FOREIGN KEY (ticker) REFERENCES tokens(ticker) ON DELETE CASCADE;

CREATE INDEX idx_snapshots_ticker_timestamp 
ON token_holder_snapshots(ticker, snapshot_timestamp DESC);

CREATE INDEX idx_snapshots_timestamp 
ON token_holder_snapshots(snapshot_timestamp DESC);

CREATE INDEX idx_snapshots_recent 
ON token_holder_snapshots(ticker, snapshot_timestamp DESC)
WHERE snapshot_timestamp >= NOW() - INTERVAL '90 days';

