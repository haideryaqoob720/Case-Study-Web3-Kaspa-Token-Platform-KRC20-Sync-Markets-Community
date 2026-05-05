-- Migration: Remove BOME token (not a Kaspa KRC20 token on exchanges)
-- This removes BOME from token_exchanges, market data, and tokens table

-- Step 1: Delete market data for BOME
DELETE FROM exchange_market_data_24h
WHERE token_identifier = 'BOME';

DELETE FROM exchange_market_data_7d
WHERE token_identifier = 'BOME';

-- Step 2: Delete token-exchange pairs for BOME
DELETE FROM token_exchanges
WHERE token_identifier = 'BOME';

-- Step 3: Delete token info for BOME first (due to foreign key constraint)
DELETE FROM token_info
WHERE identifier = 'BOME';

-- Step 4: Delete BOME token from tokens table
DELETE FROM tokens
WHERE identifier = 'BOME';

