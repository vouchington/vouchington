-- Community scope is captured from the owning post, not accepted from callers.
CREATE OR REPLACE FUNCTION fn_stamp_post_classifier_application_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT community_id INTO NEW.community_id FROM posts WHERE id = NEW.post_id FOR KEY SHARE;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER post_classifier_applications_scope_stamp
BEFORE INSERT ON post_classifier_applications
FOR EACH ROW EXECUTE FUNCTION fn_stamp_post_classifier_application_scope();

-- A receipt may only acquire a committed batch or local detector result once.
-- Phase stamps are durable proof of completed effects, not mutable progress flags.
CREATE OR REPLACE FUNCTION fn_protect_post_classifier_application()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.post_id IS DISTINCT FROM NEW.post_id
    OR OLD.id IS DISTINCT FROM NEW.id
    OR OLD.input_sha256 IS DISTINCT FROM NEW.input_sha256
    OR OLD.configuration_json IS DISTINCT FROM NEW.configuration_json
    OR OLD.configuration_sha256 IS DISTINCT FROM NEW.configuration_sha256
    OR OLD.shared_actor_id IS DISTINCT FROM NEW.shared_actor_id
    OR OLD.community_id IS DISTINCT FROM NEW.community_id
    OR OLD.reserved_batch_id IS DISTINCT FROM NEW.reserved_batch_id THEN
    RAISE EXCEPTION 'post classifier application identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF (OLD.committed_batch_id IS NOT NULL
      AND OLD.committed_batch_id IS DISTINCT FROM NEW.committed_batch_id)
    OR ((OLD.local_flagged IS NOT NULL OR OLD.outcomes_persisted_at IS NOT NULL) AND (
      ROW(OLD.local_flagged, OLD.local_reason, OLD.local_confidence_score,
        OLD.local_confidence_threshold, OLD.local_classification, OLD.local_detector,
        OLD.local_detector_model_version)
      IS DISTINCT FROM
      ROW(NEW.local_flagged, NEW.local_reason, NEW.local_confidence_score,
        NEW.local_confidence_threshold, NEW.local_classification, NEW.local_detector,
        NEW.local_detector_model_version)
    ))
    OR OLD.provider_attempts_started > NEW.provider_attempts_started
    OR (OLD.terminal_remote_failed_at IS NOT NULL AND (
      OLD.terminal_remote_failed_at IS DISTINCT FROM NEW.terminal_remote_failed_at
      OR OLD.terminal_remote_failure_kind IS DISTINCT FROM NEW.terminal_remote_failure_kind
    )) THEN
    RAISE EXCEPTION 'post classifier application outcome is immutable' USING ERRCODE = '23514';
  END IF;
  IF (OLD.outcomes_persisted_at IS NOT NULL
      AND OLD.outcomes_persisted_at IS DISTINCT FROM NEW.outcomes_persisted_at)
    OR (OLD.votes_applied_at IS NOT NULL
      AND OLD.votes_applied_at IS DISTINCT FROM NEW.votes_applied_at)
    OR (OLD.tags_applied_at IS NOT NULL
      AND OLD.tags_applied_at IS DISTINCT FROM NEW.tags_applied_at)
    OR (OLD.completed_at IS NOT NULL
      AND OLD.completed_at IS DISTINCT FROM NEW.completed_at) THEN
    RAISE EXCEPTION 'post classifier application phase is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER post_classifier_applications_guard
BEFORE UPDATE ON post_classifier_applications
FOR EACH ROW EXECUTE FUNCTION fn_protect_post_classifier_application();

CREATE OR REPLACE TRIGGER post_classifier_applications_updated_at
BEFORE UPDATE ON post_classifier_applications
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
