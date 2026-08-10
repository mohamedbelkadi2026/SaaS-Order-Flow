-- Add settings JSONB column to stores table (used for per-store feature flags
-- like allowAttachTracking). Nullable, no default — NULL is treated as {}.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS settings jsonb;
