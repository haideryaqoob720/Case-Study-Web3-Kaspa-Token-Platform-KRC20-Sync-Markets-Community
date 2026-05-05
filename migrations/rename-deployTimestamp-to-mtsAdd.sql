-- Migration: Rename deployTimestamp column to mtsAdd in tokens table
-- This makes database column name match API response field name

-- Step 1: Drop the existing index on deployTimestamp
DROP INDEX IF EXISTS "IDX_a1c1a2938a9ae0c7c447ef9785";

-- Step 2: Rename the column
ALTER TABLE tokens
RENAME COLUMN "deployTimestamp" TO "mtsAdd";

-- Step 3: Recreate the index with new column name
CREATE INDEX IF NOT EXISTS "IDX_tokens_mtsAdd" ON tokens("mtsAdd");

