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
  retention_successor_at TIMESTAMPTZ,
  retention_due_at TIMESTAMPTZ,
  retention_hash_blocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT uq_post_modera_versio__post_id__content_sha256__policy_revision UNIQUE (post_id, content_sha256, policy_revision)
);

CREATE INDEX IF NOT EXISTS idx_post_moderation_versions__post_id__id
ON post_moderation_versions (post_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_post_moderation_versions__retention_due
ON post_moderation_versions (retention_due_at, id) WHERE retention_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_post_moderation_versions__retention_hash_post
ON post_moderation_versions (post_id, id) WHERE retention_hash_blocked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_post_moderation_versions__retention_hash_policy
ON post_moderation_versions (id) WHERE retention_hash_blocked_at IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
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
  retention_due_at TIMESTAMPTZ,
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
    REFERENCES post_moderation_attempts (id, version_id, source) ON DELETE CASCADE
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

CREATE INDEX IF NOT EXISTS idx_post_moderation_dispositions__retention_due
ON post_moderation_dispositions (retention_due_at, id)
WHERE retention_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_post_moderation_dispositions__retention_version_page
ON post_moderation_dispositions (version_id, id)
WHERE disposition = 'pass' AND source <> 'staff' AND evidence <> '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_post_moderation_dispositions__retention_blocked
ON post_moderation_dispositions (version_id, id)
WHERE disposition = 'pass' AND source <> 'staff' AND evidence <> '{}'::jsonb
  AND retention_due_at IS NULL;

DO $$ BEGIN
  CREATE TYPE post_moderation_retention_kinds AS ENUM ('superseded_versions', 'pass_evidence');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS post_moderation_retention_cursors (
  kind post_moderation_retention_kinds PRIMARY KEY,
  cursor_record_id UUID,
  cursor_due_at TIMESTAMPTZ,
  cursor_lower_bound_record_id UUID,
  sweep_upper_bound_record_id UUID,
  observed_policy_revision TEXT,
  cursor_policy_version_record_id UUID,
  policy_sweep_completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS post_moderation_retention_post_work_items (
  post_id UUID PRIMARY KEY REFERENCES posts (id) ON DELETE CASCADE,
  cursor_version_record_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  cursor_processing_version_record_id UUID,
  cursor_disposition_record_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trigger_post_moderation_retention_post_work_items_updated_at
  BEFORE UPDATE ON post_moderation_retention_post_work_items
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE INDEX IF NOT EXISTS idx_post_moderation_retention_post_work_items__changed
ON post_moderation_retention_post_work_items (changed_at, post_id);

CREATE OR REPLACE FUNCTION fn_create_post_moderation_retention_post_work_item(p_post_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO post_moderation_retention_post_work_items (post_id) VALUES (p_post_id)
  ON CONFLICT (post_id) DO UPDATE
  SET cursor_version_record_id = '00000000-0000-0000-0000-000000000000',
      cursor_processing_version_record_id = NULL,
      cursor_disposition_record_id = '00000000-0000-0000-0000-000000000000',
      changed_at = CURRENT_TIMESTAMP;
END $$;

CREATE OR REPLACE FUNCTION fn_update_post_moderation_version_retention()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  predecessor_id UUID;
  successor_id UUID;
  successor_at TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT id INTO predecessor_id FROM post_moderation_versions
    WHERE post_id = NEW.post_id AND id < NEW.id ORDER BY id DESC LIMIT 1;
    SELECT id INTO successor_id FROM post_moderation_versions
    WHERE post_id = NEW.post_id AND id > NEW.id ORDER BY id LIMIT 1;
    IF successor_id IS NOT NULL THEN
      successor_at := uuid_extract_timestamp(successor_id);
      UPDATE post_moderation_versions
      SET retention_successor_at = successor_at, retention_due_at = successor_at
      WHERE id = NEW.id;
    END IF;
    IF predecessor_id IS NOT NULL THEN
      UPDATE post_moderation_versions
      SET retention_due_at = CASE
            WHEN retention_successor_at IS NOT NULL AND retention_due_at IS NULL THEN NULL
            ELSE uuid_extract_timestamp(NEW.id) END,
          retention_successor_at = uuid_extract_timestamp(NEW.id)
      WHERE id = predecessor_id;
    END IF;
  ELSE
    SELECT id INTO predecessor_id FROM post_moderation_versions
    WHERE post_id = OLD.post_id AND id < OLD.id ORDER BY id DESC LIMIT 1;
    SELECT id INTO successor_id FROM post_moderation_versions
    WHERE post_id = OLD.post_id AND id > OLD.id ORDER BY id LIMIT 1;
    IF predecessor_id IS NOT NULL THEN
      successor_at := CASE WHEN successor_id IS NULL THEN NULL
        ELSE uuid_extract_timestamp(successor_id) END;
      UPDATE post_moderation_versions version
      SET retention_due_at = CASE
            WHEN successor_at IS NULL THEN NULL
            WHEN version.retention_successor_at IS NOT NULL AND version.retention_due_at IS NULL
              THEN NULL
            ELSE successor_at END,
          retention_successor_at = successor_at,
          retention_hash_blocked_at = CASE
            WHEN successor_at IS NULL AND NOT EXISTS (
              SELECT 1 FROM post_moderation_dispositions disposition
              WHERE disposition.version_id = version.id
                AND disposition.disposition = 'pass' AND disposition.source <> 'staff'
                AND disposition.evidence <> '{}'::jsonb
                AND disposition.retention_due_at IS NULL LIMIT 1
            ) THEN NULL ELSE version.retention_hash_blocked_at END
      WHERE version.id = predecessor_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trigger_post_moderation_versions_retention
  AFTER INSERT OR DELETE ON post_moderation_versions
  FOR EACH ROW EXECUTE FUNCTION fn_update_post_moderation_version_retention();

CREATE OR REPLACE FUNCTION fn_create_post_moderation_disposition_retention_due()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.disposition = 'pass' AND NEW.source <> 'staff'
     AND NEW.evidence <> '{}'::jsonb THEN
    NEW.retention_due_at := uuid_extract_timestamp(NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trigger_post_moderation_dispositions_retention_due
  BEFORE INSERT ON post_moderation_dispositions
  FOR EACH ROW EXECUTE FUNCTION fn_create_post_moderation_disposition_retention_due();

CREATE OR REPLACE FUNCTION fn_create_post_moderation_retention_post_hash_work_item()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM post_moderation_versions
    WHERE post_id = NEW.id AND retention_hash_blocked_at IS NOT NULL LIMIT 1
  ) THEN
    PERFORM fn_create_post_moderation_retention_post_work_item(NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trigger_posts_post_moderation_retention_hash
  AFTER UPDATE OF llm_moderation_content_sha256 ON posts
  FOR EACH ROW WHEN (
    OLD.llm_moderation_content_sha256 IS DISTINCT FROM NEW.llm_moderation_content_sha256
  ) EXECUTE FUNCTION fn_create_post_moderation_retention_post_hash_work_item();

CREATE TRIGGER trigger_post_moderation_retention_cursors_updated_at
  BEFORE UPDATE ON post_moderation_retention_cursors
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE post_moderation_retention_cursors IS 'Durable UUIDv7 positions for bounded post moderation ledger retention.';
COMMENT ON COLUMN post_moderation_retention_cursors.kind IS 'Ledger stream whose progress this row records.';
COMMENT ON COLUMN post_moderation_retention_cursors.cursor_record_id IS 'Last examined UUIDv7 id; NULL starts a new pass and can revisit rows skipped during an earlier pass.';
COMMENT ON COLUMN post_moderation_retention_cursors.cursor_due_at IS 'Due-time component of the active indexed candidate keyset.';
COMMENT ON COLUMN post_moderation_retention_cursors.cursor_lower_bound_record_id IS 'Frozen lower bound of the active pass; a broader requested scope restarts rather than skipping its earlier rows.';
COMMENT ON COLUMN post_moderation_retention_cursors.sweep_upper_bound_record_id IS 'Frozen exclusive UUIDv7 upper bound for a pass; NULL between passes.';
COMMENT ON COLUMN post_moderation_retention_cursors.observed_policy_revision IS 'Code policy revision whose one-time dormant-version recheck is complete or in progress.';
COMMENT ON COLUMN post_moderation_retention_cursors.cursor_policy_version_record_id IS 'Last dormant version examined for the active policy-revision recheck.';
COMMENT ON COLUMN post_moderation_retention_cursors.policy_sweep_completed_at IS 'Completion time of the observed policy revision recheck.';
COMMENT ON COLUMN post_moderation_retention_cursors.updated_at IS 'Time of the last committed progress update.';
COMMENT ON TABLE post_moderation_retention_post_work_items IS 'Per-post bounded hash-change reconsideration of dormant moderation ledger rows.';
COMMENT ON COLUMN post_moderation_retention_post_work_items.post_id IS 'Post whose current digest changed or whose newly dormant row needs a recheck.';
COMMENT ON COLUMN post_moderation_retention_post_work_items.cursor_version_record_id IS 'Last fully examined blocked version for this post; a work position, not an entity reference.';
COMMENT ON COLUMN post_moderation_retention_post_work_items.cursor_processing_version_record_id IS 'Version whose disposition subpage is in progress; a deletion-stable work position, not a relationship.';
COMMENT ON COLUMN post_moderation_retention_post_work_items.cursor_disposition_record_id IS 'Last pass disposition examined within the next blocked version; a work position, not an entity reference.';
COMMENT ON COLUMN post_moderation_retention_post_work_items.changed_at IS 'Time the latest signal restarted this post work.';
COMMENT ON COLUMN post_moderation_retention_post_work_items.updated_at IS 'Time this work item last changed.';

COMMENT ON TABLE post_moderation_versions IS 'Immutable moderation generations keyed by canonical post content and policy revision.';
COMMENT ON TABLE post_moderation_attempts IS 'One open automated attempt per version and source. GlideMQ owns retries, leases, and provider backoff.';
COMMENT ON TABLE post_moderation_dispositions IS 'Typed moderation outcomes whose pass evidence is cleared after retention; decision columns remain immutable.';
COMMENT ON COLUMN post_moderation_versions.post_id IS 'Post whose canonical content version this moderation generation evaluates.';
COMMENT ON COLUMN post_moderation_versions.content_sha256 IS 'SHA-256 digest of the exact post content evaluated by this version.';
COMMENT ON COLUMN post_moderation_versions.policy_revision IS 'Stable moderation-policy revision applied to this content version.';
COMMENT ON COLUMN post_moderation_versions.deadline_at IS 'Hard recovery deadline; unresolved work becomes staff review rather than publication or rejection.';
COMMENT ON COLUMN post_moderation_versions.retention_successor_at IS 'UUIDv7 time of the earliest same-post successor; deletion still checks that successor under lock.';
COMMENT ON COLUMN post_moderation_versions.retention_due_at IS 'Indexed successor-time candidate marker, absent while the version is dormant.';
COMMENT ON COLUMN post_moderation_versions.retention_hash_blocked_at IS 'A dormant version or pass disposition needs reconsideration after the post digest or policy changes.';
COMMENT ON COLUMN post_moderation_attempts.version_id IS 'Moderation version evaluated by this provider attempt.';
COMMENT ON COLUMN post_moderation_attempts.source IS 'Automated moderation source that owns this attempt.';
COMMENT ON COLUMN post_moderation_attempts.attempt_number IS 'Always 1. A repeated provider call reuses this row; it does not insert another attempt.';
COMMENT ON COLUMN post_moderation_attempts.completed_at IS 'Clock time at which this attempt recorded a disposition.';
COMMENT ON COLUMN post_moderation_dispositions.version_id IS 'Moderation version receiving this append-only outcome.';
COMMENT ON COLUMN post_moderation_dispositions.source IS 'Automated or staff source that made this disposition.';
COMMENT ON COLUMN post_moderation_dispositions.attempt_id IS 'Provider attempt that produced this automated outcome; absent for staff decisions.';
COMMENT ON COLUMN post_moderation_dispositions.disposition IS 'Normalized moderation result: pass, review, reject, or incomplete.';
COMMENT ON COLUMN post_moderation_dispositions.reason_code IS 'Stable provider-neutral policy or availability reason code.';
COMMENT ON COLUMN post_moderation_dispositions.evidence IS 'Bounded private staff evidence; aged current automated passes are cleared without changing their outcome.';
COMMENT ON COLUMN post_moderation_dispositions.retention_due_at IS 'Indexed pass-evidence candidate marker, absent when evidence is cleared or the version is dormant.';
COMMENT ON COLUMN post_moderation_dispositions.actor_user_id IS 'Immutable staff actor; references the retained user identity, which survives user deletion but never authorizes.';
COMMENT ON COLUMN post_moderation_dispositions.decided_at IS 'UUIDv7-derived clock time at which this immutable disposition was created.';
