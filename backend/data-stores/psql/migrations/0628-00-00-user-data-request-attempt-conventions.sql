ALTER TABLE user_data_request_attempts
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

COMMENT ON COLUMN user_data_request_attempts.request_id IS
  'Owning account-data export request; part of the composite attempt identity.';
COMMENT ON COLUMN user_data_request_attempts.started_at IS
  'Timestamp copied from the export claim that first made this deterministic object key possible.';

CREATE TRIGGER trigger_user_data_request_attempts_updated_at
BEFORE UPDATE ON user_data_request_attempts
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
