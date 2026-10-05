-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Retained community provenance is captured from the owning post, not accepted from callers.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_update_classifier_run_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.post_id IS NULL THEN
    NEW.community_identity_id := NULL;
  ELSE
    SELECT community_id INTO NEW.community_identity_id FROM posts
    WHERE id = NEW.post_id FOR KEY SHARE;
  END IF;
  RETURN NEW;
END $$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_classifier_runs_scope_stamp
BEFORE INSERT ON classifier_runs
FOR EACH ROW EXECUTE FUNCTION fn_update_classifier_run_scope();

-- A run's identity, attempt budget and terminal outcome only move forward. Its remote C3 batch is
-- reserved with the run before provider execution. Phase stamps are durable proof of completed
-- effects, not mutable progress flags.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_classifier_run()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.classifier_id IS DISTINCT FROM NEW.classifier_id
    OR OLD.post_id IS DISTINCT FROM NEW.post_id
    OR OLD.rss_feed_item_id IS DISTINCT FROM NEW.rss_feed_item_id
    OR OLD.input_sha256 IS DISTINCT FROM NEW.input_sha256
    OR OLD.configuration_json::text IS DISTINCT FROM NEW.configuration_json::text
    OR OLD.configuration_sha256 IS DISTINCT FROM NEW.configuration_sha256
    OR OLD.shared_actor_id IS DISTINCT FROM NEW.shared_actor_id
    OR OLD.community_identity_id IS DISTINCT FROM NEW.community_identity_id
    OR OLD.decision_batch_id IS DISTINCT FROM NEW.decision_batch_id THEN
    RAISE EXCEPTION 'classifier run identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.provider_attempts_started > NEW.provider_attempts_started
    OR OLD.sweep_enqueue_count > NEW.sweep_enqueue_count
    OR (OLD.terminal_failed_at IS NOT NULL AND (
      OLD.terminal_failed_at IS DISTINCT FROM NEW.terminal_failed_at
      OR OLD.terminal_failure_kind IS DISTINCT FROM NEW.terminal_failure_kind
    ))
    OR (OLD.superseded_at IS NOT NULL AND NEW.superseded_at IS NOT NULL
      AND OLD.superseded_at IS DISTINCT FROM NEW.superseded_at) THEN
    RAISE EXCEPTION 'classifier run outcome is immutable' USING ERRCODE = '23514';
  END IF;
  IF (OLD.outcomes_persisted_at IS NOT NULL
      AND OLD.outcomes_persisted_at IS DISTINCT FROM NEW.outcomes_persisted_at)
    OR (OLD.completed_at IS NOT NULL
      AND OLD.completed_at IS DISTINCT FROM NEW.completed_at)
    OR (OLD.superseded_at IS NOT NULL AND (
      OLD.outcomes_persisted_at IS DISTINCT FROM NEW.outcomes_persisted_at
      OR OLD.completed_at IS DISTINCT FROM NEW.completed_at
    )) THEN
    RAISE EXCEPTION 'classifier run phase is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_classifier_runs_guard
BEFORE UPDATE ON classifier_runs
FOR EACH ROW EXECUTE FUNCTION fn_reject_classifier_run();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_classifier_runs_updated_at
BEFORE UPDATE ON classifier_runs
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_classifier_run_requests_updated_at
BEFORE UPDATE ON classifier_run_requests
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- The local detector outcome is written once and never revised.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_post_classifier_local_outcomes_append_only
BEFORE UPDATE ON post_classifier_local_outcomes
FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();

-- The captured candidate set is written once with the run and never revised.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_classifier_run_candidates_append_only
BEFORE UPDATE ON classifier_run_candidates
FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
