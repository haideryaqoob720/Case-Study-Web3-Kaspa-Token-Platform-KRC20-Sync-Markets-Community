-- Migration: Add indexes for filter performance (minting, supply, premint filters)
-- These indexes optimize WHERE clauses and ORDER BY operations for filter queries

-- Index on maxSupply for supply sorting and minting percentage calculations
CREATE INDEX IF NOT EXISTS "IDX_tokens_max_supply" 
ON tokens(maxSupply) 
WHERE maxSupply IS NOT NULL AND maxSupply != '';

-- Index on minted for supply sorting and minting percentage calculations
CREATE INDEX IF NOT EXISTS "IDX_tokens_minted" 
ON tokens(minted) 
WHERE minted IS NOT NULL AND minted != '';

-- Index on preAllocated for premint filtering
CREATE INDEX IF NOT EXISTS "IDX_tokens_preallocated" 
ON tokens(preAllocated) 
WHERE preAllocated IS NOT NULL AND preAllocated != '';

-- Note: mtsAdd already has an index (IDX_tokens_mtsAdd) for age sorting

