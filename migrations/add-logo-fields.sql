-- Migration: Add logo_url and logo_status columns to tokens table
-- This migration adds support for Cloudinary-based token logos

-- Add logo_url column (nullable TEXT)
ALTER TABLE tokens
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add logo_status column (nullable VARCHAR)
ALTER TABLE tokens
ADD COLUMN IF NOT EXISTS logo_status VARCHAR(20);

-- Add index on logo_status for potential filtering
CREATE INDEX IF NOT EXISTS idx_tokens_logo_status ON tokens(logo_status);

-- Note: logo_status values: 'pending', 'approved', 'rejected', etc.

