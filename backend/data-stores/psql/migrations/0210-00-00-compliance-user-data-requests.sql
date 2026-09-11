-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- Merged from: 0120-00-00-user-data-requests.sql

-- ==========================================================================
-- 0120-00-00-user-data-requests.sql
-- ============================================================================

-- Seed "deleted" tombstone user
-- This user is used to attribute posts when the original creator deletes their account.
-- The username is effectively reserved by its presence in the database.
-- ID is UUIDv7 at Unix epoch 0 (all timestamp bits zero) so uuid_extract_timestamp() returns
-- 1970-01-01 rather than NULL, allowing vote-weight recalculation to skip it gracefully.
INSERT INTO users (id, username, markdown, vote_weight, vote_weight_admin_set_at)
VALUES ('00000000-0000-7000-8000-000000000000', 'deleted', '', 0, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  markdown = EXCLUDED.markdown,
  vote_weight = EXCLUDED.vote_weight,
  vote_weight_admin_set_at = COALESCE(users.vote_weight_admin_set_at, CURRENT_TIMESTAMP);

-- Track data export requests. Lifecycle is encoded as timestamp columns; status is derived in
-- application code (see backend/services/account-data-requests/derive-status.mts).
CREATE TABLE IF NOT EXISTS user_data_requests (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID REFERENCES users ON DELETE SET NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processing_attempt_id UUID NOT NULL DEFAULT uuidv7(),
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processing_attempts INT NOT NULL DEFAULT 0,
  CHECK (processing_attempts >= 0),
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  last_error_message TEXT,
  CHECK (last_error_message IS NULL OR char_length(last_error_message) <= 2000),
  s3_key TEXT,
  CHECK (s3_key IS NULL OR char_length(s3_key) <= 1024),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_user_data_requests__lifecycle CHECK (
    (processing_started_at IS NOT NULL OR completed_at IS NULL)
    AND (completed_at IS NULL OR failed_at IS NULL)
  )
);

CREATE OR REPLACE TRIGGER trigger_user_data_requests_updated_at
BEFORE UPDATE ON user_data_requests
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE TRIGGER trigger_user_data_requests_guard_terminal_lifecycle
BEFORE UPDATE ON user_data_requests
FOR EACH ROW
EXECUTE FUNCTION fn_guard_terminal_lifecycle('completed_at', 'failed_at');

-- Lookup by user to find latest request
CREATE INDEX IF NOT EXISTS idx_user_data_requests__user_id
ON user_data_requests (user_id, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_data_requests__processing_attempt_id
ON user_data_requests (processing_attempt_id);

-- Enforce at most one active (pending or processing) request per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_data_requests__active_per_user
ON user_data_requests (user_id) WHERE completed_at IS NULL AND failed_at IS NULL;

COMMENT ON TABLE user_data_requests IS 'Tracks user data export requests with lifecycle from queued through download or expiration. Status is derived from timestamp columns.';
COMMENT ON COLUMN user_data_requests.user_id IS 'The user who requested the data export.';
COMMENT ON COLUMN user_data_requests.queued_at IS 'When the request was queued; always set on insert.';
COMMENT ON COLUMN user_data_requests.processing_attempt_id IS 'Durable token fencing one export generation attempt from stale workers.';
COMMENT ON COLUMN user_data_requests.dispatched_at IS 'When the current processing attempt was most recently enqueued.';
COMMENT ON COLUMN user_data_requests.processing_attempts IS 'Number of worker attempts that acquired the current or prior processing token.';
COMMENT ON COLUMN user_data_requests.processing_started_at IS 'When the worker began generating the export.';
COMMENT ON COLUMN user_data_requests.completed_at IS 'When the worker uploaded the export to S3.';
COMMENT ON COLUMN user_data_requests.failed_at IS 'When the worker terminated unsuccessfully.';
COMMENT ON COLUMN user_data_requests.last_error_message IS 'Most recent bounded processing error retained for audit and recovery.';
COMMENT ON COLUMN user_data_requests.s3_key IS 'S3 path to the generated ZIP file while the export is downloadable; cleared when reclaimed.';
COMMENT ON COLUMN user_data_requests.expires_at IS 'When the download link expires; the cleanup sweep reclaims the ZIP from S3 after this time.';

-- Audit log for account deletions. No FK on user_id/requested_by_id so records survive
-- after users are hard deleted (intentional for compliance audit trail).
CREATE TABLE IF NOT EXISTS user_deletion_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL,
  requested_by_id UUID,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);

CREATE INDEX IF NOT EXISTS idx_user_deletion_audit_logs__user_id
ON user_deletion_audit_logs (user_id);

COMMENT ON TABLE user_deletion_audit_logs IS 'Compliance audit trail for account deletions; no FK so records survive after user hard-delete.';
COMMENT ON COLUMN user_deletion_audit_logs.user_id IS 'The user whose account was deleted (no FK, intentional for audit persistence).';
COMMENT ON COLUMN user_deletion_audit_logs.requested_by_id IS 'The user who initiated the deletion (no FK, intentional for audit persistence).';
