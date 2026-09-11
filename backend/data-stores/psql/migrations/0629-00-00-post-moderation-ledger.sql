DO $$ BEGIN
  CREATE TYPE post_moderation_sources AS ENUM ('openai_omni', 'spam_detection', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE post_moderation_disposition_types AS ENUM ('pass', 'review', 'reject', 'incomplete');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS post_moderation_versions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  post_id UUID NOT NULL REFERENCES posts ON DELETE CASCADE,
  content_sha256 BYTEA NOT NULL CHECK (OCTET_LENGTH(content_sha256) = 32),
  policy_revision TEXT NOT NULL CHECK (char_length(policy_revision) BETWEEN 1 AND 100),
  deadline_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '30 minutes',
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  UNIQUE (post_id, content_sha256, policy_revision)
);

CREATE INDEX IF NOT EXISTS idx_post_moderation_versions__post_id__id
ON post_moderation_versions (post_id, id DESC);

CREATE TABLE IF NOT EXISTS post_moderation_work_items (
  version_id UUID NOT NULL REFERENCES post_moderation_versions ON DELETE CASCADE,
  source post_moderation_sources NOT NULL,
  generation BIGINT NOT NULL DEFAULT 1 CHECK (generation > 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  leased_at TIMESTAMPTZ,
  lease_token UUID UNIQUE,
  lease_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (version_id, source),
  CHECK ((lease_token IS NULL) = (leased_at IS NULL)),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK (completed_at IS NULL OR lease_token IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_post_moderation_work_items__due
ON post_moderation_work_items (available_at, version_id, source)
WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS post_moderation_attempts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  version_id UUID NOT NULL,
  source post_moderation_sources NOT NULL,
  attempt_number SMALLINT NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  lease_token UUID NOT NULL,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_code TEXT CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  UNIQUE (version_id, source, attempt_number),
  UNIQUE (version_id, source, lease_token),
  UNIQUE (id, version_id, source),
  FOREIGN KEY (version_id, source) REFERENCES post_moderation_work_items ON DELETE CASCADE,
  CHECK (num_nonnulls(completed_at, failed_at) <= 1),
  CHECK (failed_at IS NOT NULL OR error_code IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_post_moderation_attempts__version_source_id
ON post_moderation_attempts (version_id, source, id DESC);

CREATE TABLE IF NOT EXISTS post_moderation_dispositions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  version_id UUID NOT NULL REFERENCES post_moderation_versions ON DELETE CASCADE,
  source post_moderation_sources NOT NULL,
  attempt_id UUID,
  disposition post_moderation_disposition_types NOT NULL,
  reason_code TEXT NOT NULL CHECK (char_length(reason_code) BETWEEN 1 AND 100),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id UUID,
  decided_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (jsonb_typeof(evidence) = 'object'),
  CHECK (octet_length(evidence::text) <= 16384),
  CHECK ((source = 'staff') = (actor_user_id IS NOT NULL)),
  CHECK (source <> 'staff' OR attempt_id IS NULL),
  CHECK (disposition <> 'reject' OR source = 'staff'
    OR (source = 'openai_omni' AND reason_code = 'sexual_minors')),
  UNIQUE (attempt_id),
  FOREIGN KEY (attempt_id, version_id, source)
    REFERENCES post_moderation_attempts (id, version_id, source) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_post_moderation_dispositions__version_source_id
ON post_moderation_dispositions (version_id, source, id DESC);

COMMENT ON TABLE post_moderation_versions IS 'Immutable moderation generations keyed by canonical post content and policy revision.';
COMMENT ON TABLE post_moderation_work_items IS 'Durable current work projection with generation and lease-token fencing for bounded moderation attempts.';
COMMENT ON TABLE post_moderation_attempts IS 'Durable provider-attempt ledger. Each current-version source receives at most three attempts.';
COMMENT ON TABLE post_moderation_dispositions IS 'Append-only typed moderation outcomes with bounded internal evidence.';
COMMENT ON COLUMN post_moderation_versions.post_id IS 'Post whose canonical content version this moderation generation evaluates.';
COMMENT ON COLUMN post_moderation_versions.content_sha256 IS 'SHA-256 digest of the exact post content evaluated by this version.';
COMMENT ON COLUMN post_moderation_versions.policy_revision IS 'Stable moderation-policy revision applied to this content version.';
COMMENT ON COLUMN post_moderation_versions.deadline_at IS 'Hard recovery deadline; unresolved work becomes staff review rather than publication or rejection.';
COMMENT ON COLUMN post_moderation_work_items.version_id IS 'Moderation version whose current source work this row coordinates.';
COMMENT ON COLUMN post_moderation_work_items.source IS 'Automated or staff moderation source with one current work item per version.';
COMMENT ON COLUMN post_moderation_work_items.generation IS 'Monotonic work generation fencing retries and stale worker writes.';
COMMENT ON COLUMN post_moderation_work_items.available_at IS 'Earliest time a worker may claim this source work item.';
COMMENT ON COLUMN post_moderation_work_items.leased_at IS 'Clock time at which the current worker lease began.';
COMMENT ON COLUMN post_moderation_work_items.lease_token IS 'Unique fencing token required to complete or fail the current worker lease.';
COMMENT ON COLUMN post_moderation_work_items.lease_expires_at IS 'Clock time after which another worker may reclaim the current lease.';
COMMENT ON COLUMN post_moderation_work_items.completed_at IS 'Clock time at which this source work reached a terminal disposition.';
COMMENT ON COLUMN post_moderation_attempts.version_id IS 'Moderation version evaluated by this provider attempt.';
COMMENT ON COLUMN post_moderation_attempts.source IS 'Automated moderation source that owns this attempt.';
COMMENT ON COLUMN post_moderation_attempts.attempt_number IS 'One-based bounded retry sequence for this version and source.';
COMMENT ON COLUMN post_moderation_attempts.lease_token IS 'Fencing token matching the work lease that created this attempt.';
COMMENT ON COLUMN post_moderation_attempts.completed_at IS 'Clock time at which this attempt completed successfully.';
COMMENT ON COLUMN post_moderation_attempts.failed_at IS 'Clock time at which this attempt failed and scheduled a retry or exhausted.';
COMMENT ON COLUMN post_moderation_attempts.error_code IS 'Stable provider-neutral failure reason for a failed attempt.';
COMMENT ON COLUMN post_moderation_dispositions.version_id IS 'Moderation version receiving this append-only outcome.';
COMMENT ON COLUMN post_moderation_dispositions.source IS 'Automated or staff source that made this disposition.';
COMMENT ON COLUMN post_moderation_dispositions.attempt_id IS 'Provider attempt that produced this automated outcome; absent for staff decisions.';
COMMENT ON COLUMN post_moderation_dispositions.disposition IS 'Normalized moderation result: pass, review, reject, or incomplete.';
COMMENT ON COLUMN post_moderation_dispositions.reason_code IS 'Stable provider-neutral policy or availability reason code.';
COMMENT ON COLUMN post_moderation_dispositions.evidence IS 'Bounded private evidence for moderation staff; never part of public post contracts.';
COMMENT ON COLUMN post_moderation_dispositions.actor_user_id IS 'Immutable staff-actor audit snapshot that intentionally survives user deletion.';
COMMENT ON COLUMN post_moderation_dispositions.decided_at IS 'UUIDv7-derived clock time at which this immutable disposition was created.';
