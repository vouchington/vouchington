-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Copyright action intents are durable media-delivery sagas. Legal eligibility is evaluated
-- before an intent is created and again by the worker against the authoritative placement.

CREATE OR REPLACE FUNCTION fn_reject_copyright_action_intent()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright action intents are durable saga records' USING ERRCODE = 'check_violation';
  END IF;
  IF ROW(OLD.copyright_restriction_id, OLD.copyright_notice_deadline_id,
      OLD.expected_placement_revision, OLD.action)
    IS DISTINCT FROM ROW(NEW.copyright_restriction_id, NEW.copyright_notice_deadline_id,
      NEW.expected_placement_revision, NEW.action) THEN
    RAISE EXCEPTION 'copyright action intent identity and revision fence are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state IN ('completed', 'stale') AND NEW.state IS DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'terminal copyright action intent cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state IN ('blocked', 'failed') AND NEW.state IS DISTINCT FROM OLD.state
    AND NOT (NEW.state = 'pending' AND NEW.completed_at IS NULL
      AND NEW.completed_at_reason IS NULL AND NEW.claimed_at IS NULL
      AND NEW.delivery_attempt_count = 0) THEN
    RAISE EXCEPTION 'blocked and failed copyright actions may only be explicitly replayed' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.delivery_attempt_count < OLD.delivery_attempt_count
      AND NOT (OLD.state IN ('blocked', 'failed') AND NEW.state = 'pending'
        AND NEW.delivery_attempt_count = 0))
    OR NEW.delivery_attempt_count > OLD.delivery_attempt_count + 1 THEN
    RAISE EXCEPTION 'copyright action intent attempts must advance one at a time' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.completed_at IS NOT NULL AND OLD.completed_at IS DISTINCT FROM NEW.completed_at
    AND NOT (OLD.state IN ('blocked', 'failed') AND NEW.state = 'pending' AND NEW.completed_at IS NULL) THEN
    RAISE EXCEPTION 'copyright action intent completion is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN copyright_notice_action_intents.state IS 'Durable media-delivery state: pending, worker-claimed, or terminal completed, stale, blocked, or failed.';
COMMENT ON COLUMN copyright_notice_action_intents.delivery_attempt_count IS 'Bounded count of worker claims for this media-delivery saga.';
COMMENT ON COLUMN copyright_notice_action_intents.claimed_at IS 'Latest time a worker claimed the intent before rechecking and applying the placement transition.';
COMMENT ON COLUMN copyright_notice_action_intents.completed_at_reason IS 'Terminal action-delivery outcome, retained with its completion timestamp.';
COMMENT ON COLUMN copyright_notice_action_intents.failure_message IS 'Bounded staff-visible reason for a transient or terminal delivery failure.';
COMMENT ON COLUMN copyright_notice_action_intents.next_attempt_at IS 'Earliest durable retry time after a retryable media-delivery failure.';

-- The registry is an application outbox, not a cache.  The edge function reads DynamoDB on every
-- request, while this table supplies exactly-once desired-state convergence across PostgreSQL and
-- AWS.  A tuple contains the placement revision and asset binding so an allowed placement can
-- never authorize another asset or a stale revision.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE media_delivery_registry_records (
  delivery_key text PRIMARY KEY CHECK (char_length(delivery_key) BETWEEN 1 AND 512),
  placement_id uuid NOT NULL REFERENCES media_placements(id) ON DELETE RESTRICT,
  placement_revision integer NOT NULL CHECK (placement_revision >= 0),
  image_id uuid NOT NULL,
  desired_state media_delivery_desired_states NOT NULL CHECK (desired_state IN ('allow', 'withheld')),
  generation bigint NOT NULL DEFAULT 0 CHECK (generation >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT media_delivery_registry_records_exact_key
    CHECK (delivery_key = concat('image-placement:', placement_id, ':', placement_revision, ':', image_id))
);

CREATE TYPE media_delivery_registry_change_types AS ENUM ('pending', 'claimed', 'completed', 'failed');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE media_delivery_registry_changes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  delivery_key text NOT NULL REFERENCES media_delivery_registry_records(delivery_key) ON DELETE RESTRICT,
  generation bigint NOT NULL CHECK (generation >= 0),
  change_type media_delivery_registry_change_types NOT NULL,
  desired_state media_delivery_desired_states NOT NULL CHECK (desired_state IN ('allow', 'withheld')),
  changed_by_id uuid REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  delivery_attempt_count integer NOT NULL DEFAULT 0 CHECK (delivery_attempt_count BETWEEN 0 AND 5),
  claimed_at timestamptz,
  projected_at timestamptz,
  invalidated_at timestamptz,
  completed_at timestamptz,
  failure_message text CHECK (failure_message IS NULL OR char_length(failure_message) BETWEEN 1 AND 4096),
  next_attempt_at timestamptz,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK ((change_type = 'pending' AND claimed_at IS NULL AND completed_at IS NULL)
    OR (change_type = 'claimed' AND claimed_at IS NOT NULL AND completed_at IS NULL)
    OR (change_type IN ('completed', 'failed') AND completed_at IS NOT NULL))
);
CREATE INDEX idx_media_delivery_registry_changes__latest ON media_delivery_registry_changes(delivery_key, id DESC);
CREATE INDEX idx_media_delivery_registry_changes__actor ON media_delivery_registry_changes(changed_by_id) WHERE changed_by_id IS NOT NULL;
CREATE TRIGGER trigger_media_delivery_registry_changes_immutable BEFORE UPDATE OR DELETE ON media_delivery_registry_changes
FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
CREATE TRIGGER trigger_media_delivery_registry_changes_actor BEFORE INSERT ON media_delivery_registry_changes
FOR EACH ROW EXECUTE FUNCTION fn_ensure_retained_actor_identity('changed_by_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE FUNCTION fn_update_media_delivery_change_authority() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_generation bigint; current_desired_state media_delivery_desired_states;
BEGIN
  SELECT generation, desired_state INTO current_generation, current_desired_state FROM media_delivery_registry_records
    WHERE delivery_key = NEW.delivery_key FOR NO KEY UPDATE;
  IF current_generation IS DISTINCT FROM NEW.generation THEN RETURN NULL; END IF;
  NEW.desired_state := current_desired_state;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_media_delivery_registry_changes_generation BEFORE INSERT ON media_delivery_registry_changes
FOR EACH ROW EXECUTE FUNCTION fn_update_media_delivery_change_authority();

CREATE VIEW media_delivery_registry_current_records AS
SELECT record.delivery_key, record.placement_id, record.placement_revision, record.image_id,
  change.desired_state, record.generation, record.created_at, record.updated_at,
  change.id AS latest_change_id, change.change_type::text AS state,
  change.delivery_attempt_count, change.claimed_at, change.projected_at, change.invalidated_at,
  change.completed_at, change.failure_message, change.next_attempt_at
FROM media_delivery_registry_records record
JOIN LATERAL (SELECT * FROM media_delivery_registry_changes history
  WHERE history.delivery_key = record.delivery_key AND history.generation = record.generation
  ORDER BY history.id DESC LIMIT 1) change ON true;
COMMENT ON TABLE media_delivery_registry_changes IS 'Append-only edge delivery transitions. Current workflow state is the latest transition in the current authority generation.';
COMMENT ON VIEW media_delivery_registry_current_records IS 'Current authority record joined to its latest immutable delivery transition; no workflow state is stored on the authority parent.';
COMMENT ON COLUMN media_delivery_registry_changes.delivery_key IS 'Concrete exact edge-delivery authority whose transition this records.';
COMMENT ON COLUMN media_delivery_registry_changes.generation IS 'Nontransactional authority generation fencing stale acknowledgements.';
COMMENT ON COLUMN media_delivery_registry_changes.desired_state IS 'Exact edge state selected by this authority generation, retained after later changes and republishing.';
COMMENT ON COLUMN media_delivery_registry_changes.change_type IS 'Typed edge-delivery transition.';
COMMENT ON COLUMN media_delivery_registry_changes.changed_by_id IS 'Retained operator identity, or null for system delivery work.';
COMMENT ON COLUMN media_delivery_registry_changes.delivery_attempt_count IS 'Number of claims already made in this authority generation.';
COMMENT ON COLUMN media_delivery_registry_changes.claimed_at IS 'Worker claim represented by this transition.';
COMMENT ON COLUMN media_delivery_registry_changes.projected_at IS 'Successful edge publication time for this transition.';
COMMENT ON COLUMN media_delivery_registry_changes.invalidated_at IS 'Successful edge invalidation time for this transition.';
COMMENT ON COLUMN media_delivery_registry_changes.completed_at IS 'Terminal delivery outcome time for this transition.';
COMMENT ON COLUMN media_delivery_registry_changes.failure_message IS 'Bounded delivery diagnostic.';
COMMENT ON COLUMN media_delivery_registry_changes.next_attempt_at IS 'Earliest retry time for this pending transition.';

ALTER TABLE copyright_notice_lifecycle_changes
  ADD CONSTRAINT copyright_lifecycle_event_media_registry_fk
  FOREIGN KEY (media_delivery_registry_key)
  REFERENCES media_delivery_registry_records(delivery_key) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_notice_lifecycle_changes
  VALIDATE CONSTRAINT copyright_lifecycle_event_media_registry_fk;

ALTER TABLE media_delivery_registry_records
ADD CONSTRAINT fk_media_delivery_registry_records__retained_image_binding
FOREIGN KEY (placement_id, image_id)
REFERENCES retained_image_placement_bindings (placement_id, image_id)
ON DELETE RESTRICT NOT VALID;
ALTER TABLE media_delivery_registry_records
VALIDATE CONSTRAINT fk_media_delivery_registry_records__retained_image_binding;

CREATE SEQUENCE media_delivery_registry_generation_sequence AS bigint;

CREATE OR REPLACE FUNCTION fn_update_media_delivery_registry_generation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT'
    OR NEW.desired_state IS DISTINCT FROM OLD.desired_state
    OR NEW.generation IS DISTINCT FROM OLD.generation THEN
    NEW.generation := nextval('media_delivery_registry_generation_sequence');
  ELSE
    NEW.generation := OLD.generation;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_media_delivery_registry_records_generation
BEFORE INSERT OR UPDATE ON media_delivery_registry_records
FOR EACH ROW EXECUTE FUNCTION fn_update_media_delivery_registry_generation();

COMMENT ON COLUMN media_delivery_registry_records.generation IS
  'Database-assigned, nontransactional monotonic edge authority generation. It advances for a new record, effective desired-state change, or explicit republish, so a rolled-back prepublication cannot be reused.';

CREATE INDEX idx_media_delivery_registry_records__placement
  ON media_delivery_registry_records (placement_id);
CREATE INDEX idx_media_delivery_registry_records__image
  ON media_delivery_registry_records (image_id);

CREATE TRIGGER trigger_media_delivery_registry_records_updated_at
BEFORE UPDATE ON media_delivery_registry_records
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE media_delivery_registry_records IS 'Durable exact image-placement delivery outbox; image and placement parents are retained.';
COMMENT ON COLUMN media_delivery_registry_records.delivery_key IS 'Exact canonical image-placement:<placement UUID>:<revision>:<image UUID> URL identity.';
COMMENT ON COLUMN media_delivery_registry_records.placement_id IS 'Typed placement authority; never inferred from image existence.';
COMMENT ON COLUMN media_delivery_registry_records.placement_revision IS 'Exact placement revision required by a placement route; stale revisions are independently withheld.';
COMMENT ON COLUMN media_delivery_registry_records.image_id IS 'Immutable image bound to the exact public-use placement.';
COMMENT ON COLUMN media_delivery_registry_records.desired_state IS 'Staging cache of the desired edge state, captured atomically in each immutable generation transition; current delivery readers use the latest transition.';

CREATE FUNCTION fn_create_media_delivery_generation_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.generation IS DISTINCT FROM OLD.generation THEN
    INSERT INTO media_delivery_registry_changes(delivery_key, generation, change_type)
      VALUES (NEW.delivery_key, NEW.generation, 'pending');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_media_delivery_registry_records_new_generation AFTER INSERT OR UPDATE ON media_delivery_registry_records
FOR EACH ROW EXECUTE FUNCTION fn_create_media_delivery_generation_change();
