-- Migration: Add ContractAddress column to tokens table
-- ContractAddress comes from Kasplex token list API (ca field)
-- If ca is null in token list API, ContractAddress should be null
-- This migration populates existing data from token_info as a one-time migration
-- Going forward, ContractAddress will be populated from token list API sync

-- Add ContractAddress column to tokens table
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "ContractAddress" VARCHAR(255);

-- One-time migration: Update existing tokens with ContractAddress from token_info
-- (as a fallback for existing data, but going forward it comes from token list API)
UPDATE tokens t
SET "ContractAddress" = COALESCE(
  (ti.response_json #>> '{result,0,ContractAddress}'),
  (ti.response_json #>> '{result,0,ca}')
)
FROM token_info ti
WHERE t.ticker = ti.ticker
  AND (
    ti.response_json #>> '{result,0,ContractAddress}' IS NOT NULL
    OR ti.response_json #>> '{result,0,ca}' IS NOT NULL
  );

-- Create index on ContractAddress for faster lookups (optional, but useful for filtering)
CREATE INDEX IF NOT EXISTS "IDX_tokens_ContractAddress" ON tokens("ContractAddress") WHERE "ContractAddress" IS NOT NULL;

