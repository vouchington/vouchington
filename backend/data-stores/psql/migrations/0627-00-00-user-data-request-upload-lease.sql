CREATE FUNCTION fn_record_user_data_request_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.processing_started_at IS NOT NULL THEN
    INSERT INTO user_data_request_attempts (
      request_id,
      processing_attempt_id,
      started_at,
      upload_lease_expires_at
    ) VALUES (
      NEW.id,
      NEW.processing_attempt_id,
      NEW.processing_started_at,
      NULL
    )
    ON CONFLICT (request_id, processing_attempt_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_data_requests_record_attempt
AFTER INSERT OR UPDATE OF processing_started_at, processing_attempt_id ON user_data_requests
FOR EACH ROW EXECUTE FUNCTION fn_record_user_data_request_attempt();
