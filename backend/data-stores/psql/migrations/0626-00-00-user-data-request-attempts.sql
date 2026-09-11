CREATE TABLE user_data_request_attempts (
  request_id UUID NOT NULL REFERENCES user_data_requests (id) ON DELETE CASCADE,
  processing_attempt_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  upload_lease_expires_at TIMESTAMPTZ,
  PRIMARY KEY (request_id, processing_attempt_id)
);

INSERT INTO user_data_request_attempts (request_id, processing_attempt_id, started_at)
SELECT id, processing_attempt_id, processing_started_at
FROM user_data_requests
WHERE processing_started_at IS NOT NULL
ON CONFLICT (request_id, processing_attempt_id) DO NOTHING;

COMMENT ON TABLE user_data_request_attempts IS
  'Durable ledger of deterministic S3 object keys that an export worker may still upload.';
COMMENT ON COLUMN user_data_request_attempts.processing_attempt_id IS
  'Claimed export attempt token retained across stale recovery so deletion can purge every possible object key.';
COMMENT ON COLUMN user_data_request_attempts.upload_lease_expires_at IS
  'Bounded provider-effect lease; deletion waits through this deadline before acknowledging cleanup.';
