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
  CONSTRAINT uq_post_modera_versio__post_id__content_sha256__policy_revision UNIQUE (post_id, content_sha256, policy_revision)
);

CREATE INDEX IF NOT EXISTS idx_post_moderation_versions__post_id__id
ON post_moderation_versions (post_id, id DESC);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging).
-- One attempt row is inserted with the version. GlideMQ owns retries and leases.
CREATE TABLE IF NOT EXISTS post_moderation_attempts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  version_id UUID NOT NULL REFERENCES post_moderation_versions ON DELETE CASCADE,
  source post_moderation_sources NOT NULL,
  attempt_number SMALLINT NOT NULL CHECK (attempt_number = 1),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  UNIQUE (version_id, source),
  UNIQUE (id, version_id, source),
  CHECK (source <> 'staff')
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
  actor_user_id UUID REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
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
CREATE INDEX IF NOT EXISTS idx_post_moderation_dispositions__terminal_version_source
ON post_moderation_dispositions (version_id, source)
WHERE disposition <> 'incomplete';
COMMENT ON INDEX idx_post_moderation_dispositions__terminal_version_source IS
  'Bounds current-version work admission when older incomplete outcomes remain in the disposition ledger.';
CREATE INDEX IF NOT EXISTS idx_post_moderation_dispositions__actor_user_id
ON post_moderation_dispositions (actor_user_id)
WHERE actor_user_id IS NOT NULL;

COMMENT ON TABLE post_moderation_versions IS 'Immutable moderation generations keyed by canonical post content and policy revision.';
COMMENT ON TABLE post_moderation_attempts IS 'One open automated attempt per version and source. GlideMQ owns retries, leases, and provider backoff.';
COMMENT ON TABLE post_moderation_dispositions IS 'Append-only typed moderation outcomes with bounded internal evidence.';
COMMENT ON COLUMN post_moderation_versions.post_id IS 'Post whose canonical content version this moderation generation evaluates.';
COMMENT ON COLUMN post_moderation_versions.content_sha256 IS 'SHA-256 digest of the exact post content evaluated by this version.';
COMMENT ON COLUMN post_moderation_versions.policy_revision IS 'Stable moderation-policy revision applied to this content version.';
COMMENT ON COLUMN post_moderation_versions.deadline_at IS 'Hard recovery deadline; unresolved work becomes staff review rather than publication or rejection.';
COMMENT ON COLUMN post_moderation_attempts.version_id IS 'Moderation version evaluated by this provider attempt.';
COMMENT ON COLUMN post_moderation_attempts.source IS 'Automated moderation source that owns this attempt.';
COMMENT ON COLUMN post_moderation_attempts.attempt_number IS 'Always 1. A repeated provider call reuses this row; it does not insert another attempt.';
COMMENT ON COLUMN post_moderation_attempts.completed_at IS 'Clock time at which this attempt recorded a disposition.';
COMMENT ON COLUMN post_moderation_dispositions.version_id IS 'Moderation version receiving this append-only outcome.';
COMMENT ON COLUMN post_moderation_dispositions.source IS 'Automated or staff source that made this disposition.';
COMMENT ON COLUMN post_moderation_dispositions.attempt_id IS 'Provider attempt that produced this automated outcome; absent for staff decisions.';
COMMENT ON COLUMN post_moderation_dispositions.disposition IS 'Normalized moderation result: pass, review, reject, or incomplete.';
COMMENT ON COLUMN post_moderation_dispositions.reason_code IS 'Stable provider-neutral policy or availability reason code.';
COMMENT ON COLUMN post_moderation_dispositions.evidence IS 'Bounded private evidence for moderation staff; never part of public post contracts.';
COMMENT ON COLUMN post_moderation_dispositions.actor_user_id IS 'Immutable staff actor; references the retained user identity, which survives user deletion but never authorizes.';
COMMENT ON COLUMN post_moderation_dispositions.decided_at IS 'UUIDv7-derived clock time at which this immutable disposition was created.';
