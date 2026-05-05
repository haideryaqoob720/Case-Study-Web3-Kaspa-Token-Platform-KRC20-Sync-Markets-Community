-- Migration: Update tokens table structure
-- 1. Rename tick column to ticker
-- 2. Add name column (separate column for name from Kasplex API)

-- Step 1: Rename tick column to ticker
ALTER TABLE tokens
RENAME COLUMN tick TO ticker;

-- Drop old index/constraint on tick
DROP INDEX IF EXISTS "IDX_5b25bb69af52313753d5268cbf";
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS "UQ_5b25bb69af52313753d5268cbf3";
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS "UQ_tokens_tick";

-- Recreate unique constraint on ticker
ALTER TABLE tokens
ADD CONSTRAINT "UQ_tokens_ticker" UNIQUE (ticker);

-- Recreate index on ticker
CREATE INDEX IF NOT EXISTS "IDX_tokens_ticker" ON tokens(ticker);

-- Step 2: Add name column (nullable, separate from JSON)
ALTER TABLE tokens
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Step 3: Create index on name column for faster lookups
CREATE INDEX IF NOT EXISTS "IDX_tokens_name" ON tokens(name);

