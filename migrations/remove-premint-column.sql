-- Migration: Remove premint column from tokens table
-- premint is redundant - we can check preAllocated !== '0' to determine if token has premint

ALTER TABLE tokens
DROP COLUMN IF EXISTS premint;

