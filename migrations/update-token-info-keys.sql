-- Migration: Update token_info table structure and JSON keys
-- 1. Rename tick column to ticker
-- 2. Add name column (separate column for name from Kasplex API)
-- 3. Add identifier column (FK to tokens.identifier)
-- 4. Migrate response_json keys to new names

-- Step 1: Rename tick column to ticker
ALTER TABLE token_info
RENAME COLUMN tick TO ticker;

-- Drop old index/constraint on tick
DROP INDEX IF EXISTS "IDX_ff1088e939c63d55bf81646df3";
ALTER TABLE token_info DROP CONSTRAINT IF EXISTS "UQ_ff1088e939c63d55bf81646df38";

-- Recreate unique constraint on ticker
ALTER TABLE token_info
ADD CONSTRAINT "UQ_token_info_ticker" UNIQUE (ticker);

-- Recreate index on ticker
CREATE INDEX IF NOT EXISTS "IDX_token_info_ticker" ON token_info(ticker);

-- Step 2: Add name column (nullable, separate from JSON)
ALTER TABLE token_info
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Step 2b: Add identifier column (for FK to tokens.identifier, use ticker as default)
ALTER TABLE token_info
ADD COLUMN IF NOT EXISTS identifier VARCHAR(50);

-- Set default identifier to ticker for existing records
UPDATE token_info
SET identifier = ticker
WHERE identifier IS NULL;

-- Step 3: Migrate existing response_json data to new key names
-- This uses a simpler approach: rebuild the JSON object with new keys
UPDATE token_info
SET response_json = jsonb_build_object(
  'message', COALESCE(response_json->>'message', 'successful'),
  'result', jsonb_build_array(
    jsonb_build_object(
      'ticker', COALESCE(response_json->'result'->0->>'tick', response_json->'result'->0->>'ticker', ticker),
      'MaximumSupply', COALESCE(response_json->'result'->0->>'max', response_json->'result'->0->>'MaximumSupply'),
      'MintLimit', COALESCE(response_json->'result'->0->>'lim', response_json->'result'->0->>'MintLimit'),
      'preAllocated', COALESCE(response_json->'result'->0->>'pre', response_json->'result'->0->>'preAllocated'),
      'to', response_json->'result'->0->>'to',
      'decimal', COALESCE(response_json->'result'->0->>'dec', response_json->'result'->0->>'decimal'),
      'Deploymentmode', COALESCE(response_json->'result'->0->>'mod', response_json->'result'->0->>'Deploymentmode'),
      'minted', response_json->'result'->0->>'minted',
      'burned', response_json->'result'->0->>'burned',
      'ContractAddress', COALESCE(response_json->'result'->0->>'ca', response_json->'result'->0->>'ContractAddress'),
      'opScoreAdd', response_json->'result'->0->>'opScoreAdd',
      'opScoreMod', response_json->'result'->0->>'opScoreMod',
      'state', response_json->'result'->0->>'state',
      'hashRev', response_json->'result'->0->>'hashRev',
      'mtsAdd', response_json->'result'->0->>'mtsAdd',
      'holderTotal', response_json->'result'->0->>'holderTotal',
      'transferTotal', response_json->'result'->0->>'transferTotal',
      'mintTotal', response_json->'result'->0->>'mintTotal',
      'holder', response_json->'result'->0->'holder'
    )
  )
)
WHERE response_json IS NOT NULL
  AND response_json->'result' IS NOT NULL
  AND jsonb_array_length(response_json->'result') > 0;

-- Step 4: Extract name from JSON to separate column (if exists in JSON)
UPDATE token_info
SET name = (response_json->'result'->0->>'name')
WHERE response_json->'result'->0->>'name' IS NOT NULL
  AND name IS NULL;

-- Step 5: Create indexes
CREATE INDEX IF NOT EXISTS "IDX_token_info_name" ON token_info(name);
CREATE INDEX IF NOT EXISTS "IDX_token_info_identifier" ON token_info(identifier);
