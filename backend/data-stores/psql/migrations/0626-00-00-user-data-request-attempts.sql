CREATE TABLE user_data_request_attempts (
  request_id UUID NOT NULL REFERENCES user_data_requests (id) ON DELETE CASCADE,
  processing_attempt_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  upload_lease_expires_at TIMESTAMPTZ,
  PRIMARY KEY (request_id, processing_attempt_id)
) PARTITION BY RANGE (request_id);

CREATE TABLE user_data_request_attempts__default
PARTITION OF user_data_request_attempts DEFAULT;

COMMENT ON TABLE user_data_request_attempts IS
  'Durable ledger of deterministic S3 object keys that an export worker may still upload.';
COMMENT ON COLUMN user_data_request_attempts.processing_attempt_id IS
  'Claimed export attempt token retained across stale recovery so deletion can purge every possible object key.';
COMMENT ON COLUMN user_data_request_attempts.request_id IS
  'Owning account-data export request; part of the composite attempt identity.';
COMMENT ON COLUMN user_data_request_attempts.started_at IS
  'Timestamp copied from the export claim that first made this deterministic object key possible.';
COMMENT ON COLUMN user_data_request_attempts.upload_lease_expires_at IS
  'Bounded provider-effect lease; deletion waits through this deadline before acknowledging cleanup.';

CREATE TRIGGER trigger_user_data_request_attempts_updated_at
BEFORE UPDATE ON user_data_request_attempts
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TYPE user_data_request_attempt_cleanup_names AS ENUM ('expired_attempts');
CREATE TABLE user_data_request_attempt_retention_cursors (
  cleanup_name user_data_request_attempt_cleanup_names PRIMARY KEY,
  cursor_request_id UUID,
  cursor_processing_attempt_id UUID,
  cursor_upper_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_user_data_request_attempt_retention_cursors__position CHECK (
    (cursor_request_id IS NULL) = (cursor_processing_attempt_id IS NULL)
  )
);
CREATE TRIGGER trigger_user_data_request_attempt_retention_cursors_updated_at
BEFORE UPDATE ON user_data_request_attempt_retention_cursors
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TYPE user_data_request_attempt_cleanup_names IS 'Finite export attempt cleanup family.';
COMMENT ON TABLE user_data_request_attempt_retention_cursors IS 'Durable composite UUIDv7 scan position for old export attempt keys.';
COMMENT ON COLUMN user_data_request_attempt_retention_cursors.cleanup_name IS 'Fixed cleanup family owning this position.';
COMMENT ON COLUMN user_data_request_attempt_retention_cursors.cursor_request_id IS 'Last request UUIDv7 scanned in this pass.';
COMMENT ON COLUMN user_data_request_attempt_retention_cursors.cursor_processing_attempt_id IS 'Last attempt token scanned for the current request.';
COMMENT ON COLUMN user_data_request_attempt_retention_cursors.cursor_upper_id IS 'Exclusive fixed request UUIDv7 end of this pass.';
COMMENT ON COLUMN user_data_request_attempt_retention_cursors.updated_at IS 'Last committed scan checkpoint.';
