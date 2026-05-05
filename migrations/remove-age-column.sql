-- Migration: Remove age column from tokens table
-- Age is not used in the application

ALTER TABLE tokens
DROP COLUMN IF EXISTS age;

