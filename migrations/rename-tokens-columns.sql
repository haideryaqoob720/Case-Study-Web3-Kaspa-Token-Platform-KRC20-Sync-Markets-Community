-- Migration: Rename tokens table columns to match API response field names
-- This makes database column names consistent with API response

-- Step 1: Rename columns (check if they exist first)
DO $$
BEGIN
  -- Rename burnedSupply to burned
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'burnedSupply') THEN
    ALTER TABLE tokens RENAME COLUMN "burnedSupply" TO burned;
  END IF;

  -- Rename mintedSupply to minted
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'mintedSupply') THEN
    ALTER TABLE tokens RENAME COLUMN "mintedSupply" TO minted;
  END IF;

  -- Rename lim to MintLimit
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'lim') THEN
    ALTER TABLE tokens RENAME COLUMN lim TO "MintLimit";
  END IF;

  -- Rename premintAmount to preAllocated
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'premintAmount') THEN
    ALTER TABLE tokens RENAME COLUMN "premintAmount" TO "preAllocated";
  END IF;

  -- Rename deployAddress to to
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'deployAddress') THEN
    ALTER TABLE tokens RENAME COLUMN "deployAddress" TO "to";
  END IF;

  -- Rename decimals to decimal (if not already renamed)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'decimals') THEN
    ALTER TABLE tokens RENAME COLUMN decimals TO decimal;
  END IF;

  -- Rename mode to Deploymentmode
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'mode') THEN
    ALTER TABLE tokens RENAME COLUMN mode TO "Deploymentmode";
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'deploymentmode') THEN
    -- Handle case where it might be lowercase
    ALTER TABLE tokens RENAME COLUMN deploymentmode TO "Deploymentmode";
  END IF;
END $$;
