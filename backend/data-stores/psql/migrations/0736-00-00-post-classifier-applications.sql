-- Post-only fixed-classifier application identity and monotone effect receipt.
-- C3 batches retain remote results; C4 retains votes. The reserved batch ID is
-- allocated before a provider call, while the concrete FK is set only on commit.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_classifier_decision_batches__id_post'
  ) THEN
    ALTER TABLE classifier_decision_batches
      ADD CONSTRAINT uq_classifier_decision_batches__id_post UNIQUE (id, post_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS post_classifier_applications (
  post_id UUID NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT uuidv7(),
  input_sha256 BYTEA NOT NULL CHECK (OCTET_LENGTH(input_sha256) = 32),
  configuration_json TEXT NOT NULL CHECK (configuration_json IS JSON OBJECT),
  configuration_sha256 BYTEA NOT NULL CHECK (
    OCTET_LENGTH(configuration_sha256) = 32
    AND configuration_sha256 = digest(configuration_json, 'sha256')
  ),
  shared_actor_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  community_id UUID,
  reserved_batch_id UUID,
  committed_batch_id UUID,
  provider_attempts_started INTEGER NOT NULL DEFAULT 0 CHECK (provider_attempts_started >= 0),
  terminal_remote_failure_kind TEXT CHECK (
    terminal_remote_failure_kind IN (
      'provider-error', 'invalid-result', 'context-rejected', 'attempts-exhausted'
    )
  ),
  terminal_remote_failed_at TIMESTAMPTZ,
  local_flagged BOOLEAN,
  local_reason TEXT,
  local_confidence_score DOUBLE PRECISION,
  local_confidence_threshold DOUBLE PRECISION,
  local_classification TEXT CHECK (local_classification IN ('ai', 'human')),
  local_detector TEXT,
  local_detector_model_version TEXT,
  lease_token UUID,
  leased_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  outcomes_persisted_at TIMESTAMPTZ,
  votes_applied_at TIMESTAMPTZ,
  tags_applied_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_post_classifier_applications PRIMARY KEY (post_id, id),
  CONSTRAINT uq_post_classifier_applications__input_config
    UNIQUE (post_id, input_sha256, configuration_sha256),
  CONSTRAINT uq_post_classifier_applications__reserved_batch
    UNIQUE (post_id, reserved_batch_id),
  CONSTRAINT chk_post_classifier_applications__batch_identity
    CHECK (committed_batch_id IS NULL OR
      (reserved_batch_id IS NOT NULL AND committed_batch_id = reserved_batch_id)),
  CONSTRAINT chk_post_classifier_applications__remote_failure
    CHECK (
      (terminal_remote_failure_kind IS NULL) = (terminal_remote_failed_at IS NULL)
      AND (terminal_remote_failed_at IS NULL OR (
        reserved_batch_id IS NOT NULL
        AND committed_batch_id IS NULL
        AND outcomes_persisted_at IS NULL
      ))
    ),
  CONSTRAINT chk_post_classifier_applications__local_outcome
    CHECK (
      num_nonnulls(local_flagged, local_reason, local_confidence_score,
        local_confidence_threshold, local_classification, local_detector,
        local_detector_model_version) IN (0, 7)
      AND (local_confidence_score IS NULL OR local_confidence_score BETWEEN 0 AND 1)
      AND (local_confidence_threshold IS NULL OR local_confidence_threshold BETWEEN 0 AND 1)
    ),
  CONSTRAINT chk_post_classifier_applications__lease
    CHECK (
      (lease_token IS NULL) = (leased_at IS NULL)
      AND (lease_token IS NULL) = (lease_expires_at IS NULL)
      AND (leased_at IS NULL OR lease_expires_at > leased_at)
      AND (completed_at IS NULL OR lease_token IS NULL)
    ),
  CONSTRAINT chk_post_classifier_applications__phases
    CHECK (
      (votes_applied_at IS NULL OR
        (outcomes_persisted_at IS NOT NULL AND outcomes_persisted_at <= votes_applied_at))
      AND (tags_applied_at IS NULL OR
        (votes_applied_at IS NOT NULL AND votes_applied_at <= tags_applied_at))
      AND (completed_at IS NULL OR
        (tags_applied_at IS NOT NULL AND tags_applied_at <= completed_at))
      AND (outcomes_persisted_at IS NULL OR
        (reserved_batch_id IS NULL OR committed_batch_id IS NOT NULL))
      AND (outcomes_persisted_at IS NULL OR
        (reserved_batch_id IS NOT NULL OR local_flagged IS NOT NULL))
    )
) PARTITION BY RANGE (post_id);

-- The batch table is defined by C2/C3, so add and validate its concrete same-post FK here.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_post_classifier_applications__batch_post'
  ) THEN
    ALTER TABLE post_classifier_applications
      ADD CONSTRAINT fk_post_classifier_applications__batch_post
      FOREIGN KEY (committed_batch_id, post_id)
      REFERENCES classifier_decision_batches (id, post_id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE post_classifier_applications
  VALIDATE CONSTRAINT fk_post_classifier_applications__batch_post;

CREATE INDEX IF NOT EXISTS idx_post_classifier_applications__shared_actor
  ON post_classifier_applications (shared_actor_id);
CREATE INDEX IF NOT EXISTS idx_post_classifier_applications__committed_batch
  ON post_classifier_applications (committed_batch_id, post_id)
  WHERE committed_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_post_classifier_applications__lease
  ON post_classifier_applications (lease_expires_at, post_id, id)
  WHERE lease_token IS NOT NULL AND completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_post_classifier_applications__incomplete
  ON post_classifier_applications (post_id, id)
  WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS post_classifier_applications__default
  PARTITION OF post_classifier_applications DEFAULT;

COMMENT ON TABLE post_classifier_applications IS
  'One post/content/configuration fixed-classifier application; C3 and C4 retain remote results and votes.';
COMMENT ON COLUMN post_classifier_applications.configuration_json IS
  'Exact canonical ordered execution configuration payload, retained for historical audit.';
COMMENT ON COLUMN post_classifier_applications.community_id IS
  'Immutable original post community provenance, without a community FK so history survives community deletion.';
COMMENT ON COLUMN post_classifier_applications.reserved_batch_id IS
  'Stable remote batch UUID reserved before provider execution; NULL for local-only work.';
COMMENT ON COLUMN post_classifier_applications.committed_batch_id IS
  'Concrete same-post C3 batch reference once the complete remote result commits.';
COMMENT ON COLUMN post_classifier_applications.provider_attempts_started IS
  'Physical provider calls started under lease; effect-only retries and committed-result replay do not increment it.';
