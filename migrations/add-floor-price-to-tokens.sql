-- Migration: Add floor price columns to tokens table
-- Floor price is calculated from Kasplex marketplace listings for tokens without exchange market data
-- Stored in tokens table (denormalized) for fast queries, similar to rank column

-- Step 1: Add floor_price_usd column (USD price)
ALTER TABLE tokens
ADD COLUMN IF NOT EXISTS floor_price_usd DECIMAL(30, 18) NULL;

-- Step 2: Add floor_price_kas column (KAS price)
ALTER TABLE tokens
ADD COLUMN IF NOT EXISTS floor_price_kas DECIMAL(30, 18) NULL;

-- Step 3: Add floor_price_listing_count column (number of listings used for calculation)
ALTER TABLE tokens
ADD COLUMN IF NOT EXISTS floor_price_listing_count INTEGER NULL;

-- Step 4: Add floor_price_updated_at column (timestamp of last calculation)
ALTER TABLE tokens
ADD COLUMN IF NOT EXISTS floor_price_updated_at TIMESTAMP NULL;

-- Step 5: Create index on floor_price_updated_at for efficient queries
CREATE INDEX IF NOT EXISTS "IDX_tokens_floor_price_updated_at" ON tokens(floor_price_updated_at);

-- Step 6: Create index on floor_price_usd for sorting/filtering (optional, for future use)
CREATE INDEX IF NOT EXISTS "IDX_tokens_floor_price_usd" ON tokens(floor_price_usd) WHERE floor_price_usd IS NOT NULL;

