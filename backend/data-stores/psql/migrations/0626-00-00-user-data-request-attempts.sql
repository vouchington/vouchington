CREATE TABLE user_data_request_attempts (
  request_id UUID NOT NULL REFERENCES user_data_requests (id) ON DELETE CASCADE,
  processing_attempt_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  upload_lease_expires_at TIMESTAMPTZ,
  PRIMARY KEY (request_id, processing_attempt_id)
);

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
