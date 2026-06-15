-- Migration 003: Call Improvements for Inbound Handling
-- Track missed outbound calls for inbound callback detection

ALTER TABLE calls ADD COLUMN IF NOT EXISTS missed_call_detected_at TIMESTAMPTZ;

-- Index for normalized phone lookup (strip non-digits, last 10 chars)
CREATE INDEX IF NOT EXISTS idx_candidates_phone_normalized
  ON candidates (regexp_replace(phone, '[^0-9]', '', 'g'));
