-- migration-mode: online

-- The copyright delivery reconcile sweeps page each channel's pending and stale claimed intents by
-- immutable ID; the old next_attempt_at-ordered pending index has no reader.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_copyright_delivery_intents__recoverable
  ON copyright_notice_delivery_intents (channel, id)
  WHERE state IN ('pending', 'claimed');
DROP INDEX CONCURRENTLY IF EXISTS idx_copyright_delivery_intents__pending;

-- Email intake response recovery pages pending and stale claimed responses by immutable ID.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_copyright_email_intake_responses__recoverable
  ON copyright_notice_email_intake_responses (id)
  WHERE state IN ('pending', 'claimed');
DROP INDEX CONCURRENTLY IF EXISTS idx_copyright_email_intake_responses__pending;
