-- ============================================================================
-- Migration 014: Cal.com booking lifecycle support on calls
--
-- 1. cal_booking_uid: the Cal.com booking's stable uid, stored on the scheduled
--    call. Enables idempotent BOOKING_CREATED handling (dedupe duplicate webhook
--    deliveries) and matching BOOKING_RESCHEDULED / BOOKING_CANCELLED events back
--    to the exact call row.
-- 2. 'cancelled' call status: so a cancelled Cal.com booking can cancel the
--    pending scheduled call (vs. leaving it to dial).
-- ============================================================================

ALTER TABLE calls ADD COLUMN IF NOT EXISTS cal_booking_uid TEXT;

-- One call per Cal.com booking (partial: ignores the many rows with no uid).
CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_cal_booking_uid
  ON calls (cal_booking_uid) WHERE cal_booking_uid IS NOT NULL;

-- Add the 'cancelled' status (no-op if it already exists). Safe outside a txn
-- because it is only used at runtime, never within this migration.
ALTER TYPE call_status ADD VALUE IF NOT EXISTS 'cancelled';
