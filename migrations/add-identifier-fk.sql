-- Migration: Add identifier column to tokens table and set up foreign key relationship
-- 1. Add identifier column to tokens table (unique, derived from ticker or name)
-- 2. Populate identifier for existing records (use ticker as identifier)
-- 3. Add foreign key constraint from token_info.identifier to tokens.identifier

-- Step 1: Add identifier column to tokens table
ALTER TABLE tokens
ADD COLUMN IF NOT EXISTS identifier VARCHAR(50);

-- Step 2: Populate identifier for existing records (use ticker as identifier for now)
UPDATE tokens
SET identifier = ticker
WHERE identifier IS NULL;

-- Step 3: Make identifier unique and not null
ALTER TABLE tokens
ALTER COLUMN identifier SET NOT NULL;

ALTER TABLE tokens
ADD CONSTRAINT "UQ_tokens_identifier" UNIQUE (identifier);

-- Step 4: Create index on identifier for faster lookups
CREATE INDEX IF NOT EXISTS "IDX_tokens_identifier" ON tokens(identifier);

-- Step 5: Update token_info.identifier to match tokens.identifier (for existing data)
UPDATE token_info ti
SET identifier = t.identifier
FROM tokens t
WHERE ti.ticker = t.ticker
  AND ti.identifier IS DISTINCT FROM t.identifier;

-- Step 6: Add foreign key constraint from token_info.identifier to tokens.identifier
ALTER TABLE token_info
ADD CONSTRAINT "FK_token_info_identifier" 
FOREIGN KEY (identifier) 
REFERENCES tokens(identifier) 
ON DELETE CASCADE 
ON UPDATE CASCADE;

-- Step 7: Create index on token_info.identifier for FK performance
CREATE INDEX IF NOT EXISTS "IDX_token_info_identifier_fk" ON token_info(identifier);

