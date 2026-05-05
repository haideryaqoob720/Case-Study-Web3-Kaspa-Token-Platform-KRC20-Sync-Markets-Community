-- Migration: Update identifier values to use ticker || name (no fallback)
-- This ensures identifier is properly set for foreign key relationship

-- Update identifier to use name if available, otherwise use ticker
UPDATE tokens
SET identifier = COALESCE(NULLIF(name, ''), ticker)
WHERE identifier IS NULL 
   OR identifier != COALESCE(NULLIF(name, ''), ticker);

-- Ensure all tokens have identifier (should not be null due to NOT NULL constraint)
-- This is a safety check
UPDATE tokens
SET identifier = ticker
WHERE identifier IS NULL;

