-- Copyright action intents are durable media-delivery sagas. Legal eligibility is evaluated
-- before an intent is created and again by the worker against the authoritative placement.

ALTER TABLE copyright_notice_action_intents
  ADD COLUMN state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'claimed', 'completed', 'stale', 'blocked', 'failed')),
  ADD COLUMN delivery_attempt_count integer NOT NULL DEFAULT 0
    CHECK (delivery_attempt_count BETWEEN 0 AND 5),
  ADD COLUMN claimed_at timestamptz,
  ADD COLUMN completed_at_reason text
    CHECK (completed_at_reason IS NULL OR completed_at_reason IN ('completed', 'stale', 'blocked', 'failed')),
  ADD COLUMN failure_message text
    CHECK (failure_message IS NULL OR char_length(failure_message) BETWEEN 1 AND 4096),
  ADD COLUMN next_attempt_at timestamptz;

UPDATE copyright_notice_action_intents
SET state = 'completed', completed_at_reason = 'completed'
WHERE completed_at IS NOT NULL;

ALTER TABLE copyright_notice_action_intents
  ADD CONSTRAINT copyright_action_intents_delivery_state
  CHECK (
    (state = 'pending' AND completed_at IS NULL AND completed_at_reason IS NULL AND claimed_at IS NULL)
    OR (state = 'claimed' AND completed_at IS NULL AND completed_at_reason IS NULL AND claimed_at IS NOT NULL)
    OR (state IN ('completed', 'stale', 'blocked', 'failed')
      AND completed_at IS NOT NULL AND completed_at_reason = state AND next_attempt_at IS NULL)
  ) NOT VALID,
  ADD CONSTRAINT copyright_action_intents_retry_schedule
  CHECK (
    ((state = 'pending' AND (delivery_attempt_count = 0 OR next_attempt_at IS NOT NULL))
      OR state <> 'pending')
    AND (state <> 'claimed' OR next_attempt_at IS NULL)
  ) NOT VALID;

ALTER TABLE copyright_notice_action_intents
  VALIDATE CONSTRAINT copyright_action_intents_delivery_state;

ALTER TABLE copyright_notice_action_intents
  VALIDATE CONSTRAINT copyright_action_intents_retry_schedule;

CREATE INDEX idx_copyright_notice_action_intents__recoverable
  ON copyright_notice_action_intents (next_attempt_at, id) WHERE state = 'pending';

CREATE OR REPLACE FUNCTION fn_guard_copyright_action_intent()
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
CREATE TABLE media_delivery_registry_records (
  delivery_key text PRIMARY KEY CHECK (char_length(delivery_key) BETWEEN 1 AND 512),
  media_kind text NOT NULL CHECK (media_kind IN ('image')),
  route_kind text NOT NULL CHECK (route_kind IN ('placement', 'legacy-image')),
  placement_id uuid REFERENCES media_placements(id) ON DELETE RESTRICT,
  placement_revision integer CHECK (placement_revision IS NULL OR placement_revision >= 0),
  asset_id uuid NOT NULL REFERENCES images(id) ON DELETE RESTRICT,
  desired_state text NOT NULL CHECK (desired_state IN ('allow', 'withheld')),
  generation integer NOT NULL DEFAULT 0 CHECK (generation >= 0),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'claimed', 'completed', 'failed')),
  delivery_attempt_count integer NOT NULL DEFAULT 0 CHECK (delivery_attempt_count BETWEEN 0 AND 5),
  claimed_at timestamptz,
  projected_at timestamptz,
  invalidated_at timestamptz,
  completed_at timestamptz,
  failure_message text CHECK (failure_message IS NULL OR char_length(failure_message) BETWEEN 1 AND 4096),
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (route_kind = 'placement' AND placement_id IS NOT NULL AND placement_revision IS NOT NULL)
    OR (route_kind = 'legacy-image' AND placement_id IS NULL AND placement_revision IS NULL AND media_kind = 'image')
  ),
  CHECK (
    (state = 'pending' AND claimed_at IS NULL AND completed_at IS NULL)
    OR (state = 'claimed' AND claimed_at IS NOT NULL AND completed_at IS NULL)
    OR (state IN ('completed', 'failed') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX idx_media_delivery_registry_records__recoverable
  ON media_delivery_registry_records (next_attempt_at, delivery_key)
  WHERE state = 'pending';

CREATE INDEX idx_media_delivery_registry_records__placement
  ON media_delivery_registry_records (placement_id) WHERE placement_id IS NOT NULL;
CREATE INDEX idx_media_delivery_registry_records__asset
  ON media_delivery_registry_records (asset_id);

COMMENT ON TABLE media_delivery_registry_records IS 'Durable exact delivery-tuple projection to the edge DynamoDB authority. Absence is denied by the edge. New media kinds add their own foreign-key column and check branch in a later migration.';
COMMENT ON COLUMN media_delivery_registry_records.delivery_key IS 'Exact edge identity: image-placement:<placement UUID>:<revision>:<image UUID>, video-placement equivalent, or legacy-image:<image UUID>.';
COMMENT ON COLUMN media_delivery_registry_records.desired_state IS 'Desired legal delivery state; DynamoDB is updated before this row becomes completed.';
