-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS post_admission_reservations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL,
  intent_sha256 TEXT NOT NULL,
  route post_admission_routes NOT NULL,
  scope post_admission_scope_categories NOT NULL,
  source contribution_policy_sources,
  post_type post_types,
  policy_revision TEXT,
  state post_admission_reservation_states GENERATED ALWAYS AS (CASE WHEN committed_at IS NOT NULL THEN 'committed'::post_admission_reservation_states ELSE 'in_progress'::post_admission_reservation_states END) STORED NOT NULL,
  response JSONB,
  replay_metadata JSONB,
  committed_post_id UUID REFERENCES retained_post_identities (id) ON DELETE RESTRICT,
  committed_status post_admission_committed_statuses,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  committed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  CONSTRAINT post_admission_reservations_actor_key_unique UNIQUE (actor_user_id, idempotency_key),
  CONSTRAINT post_admission_reservations_intent_sha256_check CHECK (
    char_length(intent_sha256) = 64 AND intent_sha256 = LOWER(intent_sha256)
  ),
  CONSTRAINT post_admission_reservations_metadata_bounds_check CHECK (
    char_length(route::text) BETWEEN 1 AND 128
    AND char_length(scope::text) BETWEEN 1 AND 256
    AND char_length(source::text) BETWEEN 1 AND 64
    AND char_length(post_type::text) BETWEEN 1 AND 64
    AND char_length(policy_revision) BETWEEN 1 AND 128
    AND (response IS NULL OR octet_length(response::text) <= 2097152)
    AND (replay_metadata IS NULL OR (
      jsonb_typeof(replay_metadata) = 'object' AND octet_length(replay_metadata::text) <= 8192
    ))
  ),
  CONSTRAINT post_admission_reservations_policy_audit_check CHECK (
    (source IS NULL) = (post_type IS NULL) AND (source IS NULL) = (policy_revision IS NULL)
  ),
  CONSTRAINT post_admission_reservations_state_payload_check CHECK (
    (state = 'committed' AND response IS NOT NULL AND replay_metadata IS NOT NULL
      AND (committed_post_id IS NULL) = (post_type IS NULL) AND committed_status IS NOT NULL
      AND expires_at IS NOT NULL AND expires_at = retention_expires_at)
    OR (state = 'in_progress' AND response IS NULL AND replay_metadata IS NULL
      AND committed_post_id IS NULL AND committed_status IS NULL AND expires_at IS NULL)
  )
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trg_post_admission_reservations__updated_at
BEFORE UPDATE ON post_admission_reservations
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_post_admission_reservations__retention
ON post_admission_reservations (retention_expires_at, id);

COMMENT ON TABLE post_admission_reservations IS 'Durable actor-bound idempotency and admission ledger for every keyed create (authored posts and the delegated community, report, dispute, appeal and application creates); committed replays remain available for a rolling 48-hour client window plus bounded clock-skew safety. The actor and key space is shared by every route.';
COMMENT ON COLUMN post_admission_reservations.actor_user_id IS 'Authenticated actor that owns the idempotency key and its replay record.';
COMMENT ON COLUMN post_admission_reservations.idempotency_key IS 'Client-supplied UUID reused only to replay the same actor request.';
COMMENT ON COLUMN post_admission_reservations.intent_sha256 IS 'SHA-256 of the canonical request intent. Different intent with the same actor and idempotency key is rejected.';
COMMENT ON COLUMN post_admission_reservations.route IS 'Mutation route recorded for audit and replay metadata; the route is part of the canonical intent, so a key reused on another route is rejected.';
COMMENT ON COLUMN post_admission_reservations.scope IS 'Finite contribution scope category; the exact route-specific scope remains in replay_metadata.';
COMMENT ON COLUMN post_admission_reservations.source IS 'Contribution-policy source charged when this request commits. Null for creates that are not charged against a contribution quota.';
COMMENT ON COLUMN post_admission_reservations.post_type IS 'Authored post type recorded for contribution-policy audit. Null exactly when the admitted create makes no post.';
COMMENT ON COLUMN post_admission_reservations.policy_revision IS 'Contribution-policy revision evaluated for this request. Null exactly when source is null.';
COMMENT ON COLUMN post_admission_reservations.state IS 'Generated final lifecycle from committed_at; retry outcomes live in immutable attempt results.';
COMMENT ON COLUMN post_admission_reservations.response IS 'Serialized successful response retained for exact idempotent replay.';
COMMENT ON COLUMN post_admission_reservations.replay_metadata IS 'Bounded route and scope metadata paired with the replay response.';
COMMENT ON COLUMN post_admission_reservations.committed_post_id IS 'Retained identity of the created post, kept in the replay record after the live post may be deleted. A retained identity never authorizes the deleted post. Null exactly when the admitted create makes no post; the replay response carries any other created id.';
COMMENT ON COLUMN post_admission_reservations.committed_status IS 'Successful response status retained with the exact replay payload.';
COMMENT ON COLUMN post_admission_reservations.committed_at IS 'Clock timestamp at which the protected mutation committed.';
COMMENT ON COLUMN post_admission_reservations.expires_at IS 'Replay expiration for committed admission records.';
COMMENT ON COLUMN post_admission_reservations.retention_expires_at IS 'Indexed deletion boundary for committed replays and abandoned nonterminal reservations.';

-- Current indexes for fresh schema bootstrap. The predicate is implied by every
-- `committed_post_id = $1` lookup, so the retained-identity FK and cleanup checks can use it.
CREATE INDEX IF NOT EXISTS idx_post_admission_reservations__committed_post_retention
  ON post_admission_reservations (committed_post_id, retention_expires_at)
  WHERE committed_post_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS post_admission_attempts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  reservation_id UUID NOT NULL REFERENCES post_admission_reservations(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  lease_token UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  UNIQUE (reservation_id, attempt_number),
  UNIQUE (reservation_id, lease_token)
);
COMMENT ON TABLE post_admission_attempts IS 'Immutable claim history: one numbered row per acquired admission execution, retained with its replay reservation.';
COMMENT ON COLUMN post_admission_attempts.reservation_id IS 'Actor-bound replay reservation owning this execution attempt.';
COMMENT ON COLUMN post_admission_attempts.attempt_number IS 'Monotonic ordinal allocated while the reservation is locked.';
COMMENT ON COLUMN post_admission_attempts.lease_token IS 'Exact fencing token of this execution attempt.';
COMMENT ON COLUMN post_admission_attempts.started_at IS 'When the claim was acquired; retained across retries.';
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_post_admission_attempts_immutable BEFORE UPDATE OR DELETE ON post_admission_attempts
FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS post_admission_attempt_results (
  post_admission_attempt_id UUID PRIMARY KEY REFERENCES post_admission_attempts(id) ON DELETE CASCADE,
  committed_at TIMESTAMPTZ, failed_at TIMESTAMPTZ, abandoned_at TIMESTAMPTZ,
  failure JSONB,
  CHECK (num_nonnulls(committed_at, failed_at, abandoned_at) = 1),
  CHECK ((failed_at IS NULL) = (failure IS NULL))
);
COMMENT ON TABLE post_admission_attempt_results IS 'Immutable final fact for an admission attempt; a successor never rewrites earlier failures. Parent retention cascades deletion.';
COMMENT ON COLUMN post_admission_attempt_results.post_admission_attempt_id IS 'Execution attempt finalized by this fact.';
COMMENT ON COLUMN post_admission_attempt_results.committed_at IS 'When mutation, quota consumption and replay response committed together.';
COMMENT ON COLUMN post_admission_attempt_results.failed_at IS 'When the owned execution failed transiently.';
COMMENT ON COLUMN post_admission_attempt_results.abandoned_at IS 'When an expired execution was superseded by a new claim.';
COMMENT ON COLUMN post_admission_attempt_results.failure IS 'Serialized transient diagnostic belonging only to this attempt.';
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_post_admission_attempt_results_immutable BEFORE UPDATE OR DELETE ON post_admission_attempt_results
FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
