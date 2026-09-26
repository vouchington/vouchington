-- migration-mode: online

-- The copyright reconcile sweeps page by immutable ID. Pending and stale claimed enforcement
-- requests share one keyset index; the old updated_at-ordered pending index has no reader.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_copyright_notice_enforcement_requests__reconcilable
  ON copyright_notice_enforcement_requests (copyright_notice_submission_assessment_id)
  WHERE state IN ('pending', 'claimed');
DROP INDEX CONCURRENTLY IF EXISTS idx_copyright_notice_enforcement_requests__pending;

-- Action intent recovery pages idx_copyright_notice_intents__pending (id WHERE completed_at IS NULL),
-- which also covers stale claims, so the next_attempt_at-ordered pending index has no reader.
DROP INDEX CONCURRENTLY IF EXISTS idx_copyright_notice_action_intents__recoverable;
