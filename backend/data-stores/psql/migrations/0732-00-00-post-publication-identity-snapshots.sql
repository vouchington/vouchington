-- Bounded, relational publication identities.  These rows deliberately outlive dirty work: a
-- receipt can point at an accepted snapshot after the dirty-work acknowledgement has removed it.
CREATE TABLE IF NOT EXISTS post_publication_identity_protocol (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  protocol_version TEXT NOT NULL DEFAULT 'legacy' CHECK (protocol_version IN ('legacy', 'typed-v1'))
);

INSERT INTO post_publication_identity_protocol (singleton) VALUES (TRUE) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS post_publication_identity_cleanup_progress (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  cursor_snapshot_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO post_publication_identity_cleanup_progress (singleton) VALUES (TRUE) ON CONFLICT DO NOTHING;
COMMENT ON TABLE post_publication_identity_cleanup_progress IS 'Bounded cyclic snapshot-header sweep, independent from the shared protocol writer lock.';
COMMENT ON COLUMN post_publication_identity_cleanup_progress.singleton IS 'Checked singleton key serializes only cleanup sweeps.';
COMMENT ON COLUMN post_publication_identity_cleanup_progress.cursor_snapshot_id IS 'Last examined header; no FK because reclaimed headers are deleted.';
COMMENT ON COLUMN post_publication_identity_cleanup_progress.updated_at IS 'Last committed sweep progress.';

CREATE TABLE IF NOT EXISTS post_publication_identity_snapshots (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  dirty_work_id UUID NOT NULL,
  generation BIGINT NOT NULL CHECK (generation > 0),
  post_id UUID NOT NULL,
  eligibility_fingerprint TEXT NOT NULL,
  is_public BOOLEAN NOT NULL,
  source_cursor_kind TEXT,
  source_cursor_value TEXT,
  receipt_cursor_kind TEXT,
  receipt_cursor_value TEXT,
  receipt_retained_at TIMESTAMPTZ,
  receipt_source_version TEXT,
  completed_at TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK ((source_cursor_kind IS NULL) = (source_cursor_value IS NULL)),
  CHECK ((receipt_cursor_kind IS NULL) = (receipt_cursor_value IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_post_publication_identity_snapshots__attempt_post
  ON post_publication_identity_snapshots (dirty_work_id, generation, post_id, id);
CREATE INDEX IF NOT EXISTS idx_post_publication_identity_snapshots__post_completed
  ON post_publication_identity_snapshots (post_id, completed_at, id);

CREATE TABLE IF NOT EXISTS post_publication_identity_snapshot_keys (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  snapshot_id UUID NOT NULL REFERENCES post_publication_identity_snapshots (id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('topic', 'author', 'author_username', 'community', 'community_slug', 'post_slug', 'rss_feed', 'sitemap_target')),
  uuid_value UUID,
  text_value TEXT,
  post_type post_types,
  day DATE,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  UNIQUE NULLS NOT DISTINCT (snapshot_id, kind, uuid_value, text_value, post_type, day),
  CHECK (
    (kind IN ('topic', 'author', 'community', 'rss_feed') AND uuid_value IS NOT NULL
      AND text_value IS NULL AND post_type IS NULL AND day IS NULL)
    OR (kind IN ('author_username', 'community_slug', 'post_slug') AND uuid_value IS NULL
      AND text_value IS NOT NULL AND post_type IS NULL AND day IS NULL)
    OR (kind = 'sitemap_target' AND uuid_value IS NULL AND text_value IS NULL
      AND post_type IS NOT NULL AND day IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_post_publication_identity_snapshot_keys__snapshot_id_id
  ON post_publication_identity_snapshot_keys (snapshot_id, id);

ALTER TABLE post_publication_projection_receipts
  ADD COLUMN applied_snapshot_id UUID;

CREATE INDEX IF NOT EXISTS idx_post_publication_projection_receipts__applied_snapshot_id
  ON post_publication_projection_receipts (applied_snapshot_id) WHERE applied_snapshot_id IS NOT NULL;

ALTER TABLE post_publication_projection_receipts
  ADD CONSTRAINT fk_post_publication_projection_receipts__snapshot
  FOREIGN KEY (applied_snapshot_id) REFERENCES post_publication_identity_snapshots(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE post_publication_projection_receipts VALIDATE CONSTRAINT fk_post_publication_projection_receipts__snapshot;

CREATE OR REPLACE TRIGGER trigger_post_publication_identity_protocol_updated_at
BEFORE UPDATE ON post_publication_identity_protocol FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE OR REPLACE TRIGGER trigger_post_publication_identity_snapshots_updated_at
BEFORE UPDATE ON post_publication_identity_snapshots FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE FUNCTION fn_require_post_publication_typed_protocol()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE protocol post_publication_identity_protocol%ROWTYPE;
BEGIN
  SELECT * INTO protocol FROM post_publication_identity_protocol WHERE singleton FOR SHARE;
  IF TG_TABLE_NAME = 'post_publication_dirty_work' THEN
    IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.generation > OLD.generation THEN RETURN NEW; END IF;
    END IF;
  END IF;
  IF protocol.protocol_version = 'typed-v1'
    AND current_setting('voucha.post_publication_protocol', TRUE) IS DISTINCT FROM 'typed-v1' THEN
    RAISE EXCEPTION 'post-publication typed protocol requires an expanded worker transaction';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE TRIGGER trigger_post_publication_dirty_work_protocol
BEFORE INSERT OR UPDATE OR DELETE ON post_publication_dirty_work
FOR EACH ROW EXECUTE FUNCTION fn_require_post_publication_typed_protocol();
CREATE OR REPLACE TRIGGER trigger_post_publication_projection_receipts_protocol
BEFORE INSERT OR UPDATE OR DELETE ON post_publication_projection_receipts
FOR EACH ROW EXECUTE FUNCTION fn_require_post_publication_typed_protocol();
CREATE OR REPLACE TRIGGER trigger_post_publication_audit_checkpoints_protocol
BEFORE INSERT OR UPDATE OR DELETE ON post_publication_reconciliation_audit_checkpoints
FOR EACH ROW EXECUTE FUNCTION fn_require_post_publication_typed_protocol();

CREATE OR REPLACE FUNCTION fn_guard_post_publication_protocol_deactivation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.protocol_version = 'legacy' AND OLD.protocol_version = 'typed-v1' THEN
    RAISE EXCEPTION 'typed publication protocol activation is irreversible';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER trigger_post_publication_protocol_deactivation
BEFORE UPDATE ON post_publication_identity_protocol
FOR EACH ROW EXECUTE FUNCTION fn_guard_post_publication_protocol_deactivation();

COMMENT ON TABLE post_publication_identity_protocol IS 'Operator-controlled rollout barrier. typed-v1 blocks legacy worker and audit mutations.';
COMMENT ON COLUMN post_publication_identity_protocol.singleton IS 'Checked true key limits this rollout barrier to one row.';
COMMENT ON COLUMN post_publication_identity_protocol.activated_at IS 'Time of irreversible typed protocol activation.';
COMMENT ON COLUMN post_publication_identity_protocol.protocol_version IS 'Legacy compatibility or activated typed-v1 writer contract.';
COMMENT ON COLUMN post_publication_identity_snapshots.dirty_work_id IS 'Work identifier retained after acknowledgement; not a cascading relation.';
COMMENT ON COLUMN post_publication_identity_snapshots.generation IS 'Captured work generation fencing this attempt.';
COMMENT ON COLUMN post_publication_identity_snapshots.post_id IS 'Candidate identifier retained after deletion.';
COMMENT ON COLUMN post_publication_identity_snapshots.eligibility_fingerprint IS 'Scalar candidate and root eligibility version.';
COMMENT ON COLUMN post_publication_identity_snapshots.is_public IS 'Eligibility captured for this attempt.';
COMMENT ON COLUMN post_publication_identity_snapshots.source_cursor_kind IS 'Native source branch advanced by the last atomically staged physical row page.';
COMMENT ON COLUMN post_publication_identity_snapshots.source_cursor_value IS 'Last native branch row key, independent from emitted or deduplicated identities.';
COMMENT ON COLUMN post_publication_identity_snapshots.receipt_cursor_kind IS 'Typed snapshot keys or compatibility JSON array branch for prior receipt retention.';
COMMENT ON COLUMN post_publication_identity_snapshots.receipt_cursor_value IS 'Last typed key ID or compatibility array ordinal retained atomically.';
COMMENT ON COLUMN post_publication_identity_snapshots.receipt_retained_at IS 'EOF of prior receipt retention before current source staging.';
COMMENT ON COLUMN post_publication_identity_snapshots.receipt_source_version IS 'Accepted prior receipt version checked on every stage.';
COMMENT ON COLUMN post_publication_identity_snapshots.completed_at IS 'Exact source comparison and scalar validation completion time.';
COMMENT ON COLUMN post_publication_identity_snapshots.abandoned_at IS 'Source drift or supersession invalidated this attempt.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.snapshot_id IS 'Owning snapshot; restrict deletion until bounded key reclamation.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.kind IS 'Discriminant selecting the exact typed identity representation.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.uuid_value IS 'UUID identity for topics, authors, communities or feeds.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.text_value IS 'Username or slug identity.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.post_type IS 'Post type of a sitemap tuple.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.day IS 'UTC publication day of a sitemap tuple.';
COMMENT ON TABLE post_publication_identity_snapshots IS 'Immutable-at-acceptance bounded identity materialization attempts; intentionally independent from dirty work.';
COMMENT ON TABLE post_publication_identity_snapshot_keys IS 'Typed exact projection identities for a publication snapshot; delete explicitly in bounded pages before removing a snapshot.';
COMMENT ON COLUMN post_publication_projection_receipts.applied_snapshot_id IS 'Complete typed snapshot accepted after projection effects; old JSON remains only for expand/contract readers.';
