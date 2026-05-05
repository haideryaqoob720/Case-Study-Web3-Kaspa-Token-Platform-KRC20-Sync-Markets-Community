-- Migration: Add rank column to tokens table for market cap-based ranking

ALTER TABLE tokens
ADD COLUMN IF NOT EXISTS rank INTEGER;

CREATE INDEX IF NOT EXISTS "IDX_tokens_rank" ON tokens(rank) WHERE rank IS NOT NULL;
