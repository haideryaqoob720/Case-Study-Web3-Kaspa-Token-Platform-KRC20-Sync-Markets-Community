-- Migration: Add failure tracking columns to token_exchanges table

ALTER TABLE token_exchanges
ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS "IDX_token_exchanges_failure_count" ON token_exchanges(failure_count);
CREATE INDEX IF NOT EXISTS "IDX_token_exchanges_is_active_failure" ON token_exchanges(is_active, failure_count) WHERE is_active = true;

