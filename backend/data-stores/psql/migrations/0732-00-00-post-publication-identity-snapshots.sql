CREATE TABLE IF NOT EXISTS post_publication_identity_cleanup_progress (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  cursor_snapshot_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO post_publication_identity_cleanup_progress (singleton) VALUES (TRUE) ON CONFLICT DO NOTHING;
COMMENT ON TABLE post_publication_identity_cleanup_progress IS 'Bounded cyclic snapshot-header sweep, independent from publication writers.';
COMMENT ON COLUMN post_publication_identity_cleanup_progress.singleton IS 'Checked singleton key serializes only cleanup sweeps.';
COMMENT ON COLUMN post_publication_identity_cleanup_progress.cursor_snapshot_id IS 'Last examined header; no FK because reclaimed headers are deleted.';
COMMENT ON COLUMN post_publication_identity_cleanup_progress.updated_at IS 'Last committed sweep progress.';

CREATE TABLE IF NOT EXISTS post_publication_identity_snapshots (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  dirty_work_id UUID REFERENCES post_publication_dirty_work (id) ON DELETE SET NULL,
  generation BIGINT NOT NULL CHECK (generation > 0),
  post_identity_id UUID NOT NULL,
  eligibility_fingerprint TEXT NOT NULL,
  is_public BOOLEAN NOT NULL,
  source_cursor_kind TEXT,
  source_cursor_value TEXT,
  completed_at TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  receipt_cursor_kind TEXT,
  receipt_cursor_value TEXT,
  receipt_retained_at TIMESTAMPTZ,
  receipt_source_version TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((source_cursor_kind IS NULL) = (source_cursor_value IS NULL)),
  CHECK ((receipt_cursor_kind IS NULL) = (receipt_cursor_value IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_post_publication_identity_snapshots__attempt_post
  ON post_publication_identity_snapshots (dirty_work_id, generation, post_identity_id, id);
CREATE INDEX IF NOT EXISTS idx_post_publication_identity_snapshots__post_completed
  ON post_publication_identity_snapshots (post_identity_id, completed_at, id);

CREATE TABLE IF NOT EXISTS post_publication_identity_snapshot_keys (
  id UUID NOT NULL DEFAULT uuidv7(),
  snapshot_id UUID NOT NULL REFERENCES post_publication_identity_snapshots (id) ON DELETE RESTRICT,
  topic_key UUID,
  author_key UUID,
  author_username TEXT,
  community_key UUID,
  community_slug TEXT,
  post_slug TEXT,
  rss_feed_key UUID,
  post_type post_types,
  day DATE,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  PRIMARY KEY (snapshot_id, id) INCLUDE (topic_key, author_key, author_username, community_key, community_slug, post_slug, rss_feed_key, post_type, day),
  UNIQUE NULLS NOT DISTINCT (snapshot_id, topic_key, author_key, author_username, community_key, community_slug, post_slug, rss_feed_key, post_type, day),
  CHECK (num_nonnulls(topic_key, author_key, author_username, community_key, community_slug, post_slug, rss_feed_key, post_type) = 1),
  CHECK ((post_type IS NULL) = (day IS NULL))
);

ALTER TABLE post_publication_projection_receipts
  -- squawk-ignore adding-required-field -- Pre-launch receipts require a real snapshot; incompatible disposable databases must be recreated explicitly, not backfilled.
  ADD COLUMN applied_snapshot_id UUID NOT NULL;
-- squawk-ignore ban-drop-column -- Pre-launch snapshot-only receipts replace JSON entirely; no mixed-version compatibility path is retained.
ALTER TABLE post_publication_projection_receipts DROP COLUMN applied_identity;

CREATE INDEX IF NOT EXISTS idx_post_publication_projection_receipts__applied_snapshot_id
  ON post_publication_projection_receipts (applied_snapshot_id);

ALTER TABLE post_publication_projection_receipts
  ADD CONSTRAINT fk_post_publication_projection_receipts__snapshot
  FOREIGN KEY (applied_snapshot_id) REFERENCES post_publication_identity_snapshots(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE post_publication_projection_receipts VALIDATE CONSTRAINT fk_post_publication_projection_receipts__snapshot;

CREATE OR REPLACE TRIGGER trigger_post_publication_identity_snapshots_updated_at
BEFORE UPDATE ON post_publication_identity_snapshots FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON COLUMN post_publication_identity_snapshots.dirty_work_id IS 'Live owning work FK; acknowledgement clears it without deleting accepted storage.';
COMMENT ON COLUMN post_publication_identity_snapshots.generation IS 'Captured work generation fencing this attempt.';
COMMENT ON COLUMN post_publication_identity_snapshots.post_identity_id IS 'Durable post identity FK added by the concrete identities migration.';
COMMENT ON COLUMN post_publication_identity_snapshots.eligibility_fingerprint IS 'Scalar candidate and root eligibility version.';
COMMENT ON COLUMN post_publication_identity_snapshots.is_public IS 'Eligibility captured for this attempt.';
COMMENT ON COLUMN post_publication_identity_snapshots.source_cursor_kind IS 'Native source branch advanced by the last atomically staged physical row page.';
COMMENT ON COLUMN post_publication_identity_snapshots.source_cursor_value IS 'Last native branch row key, independent from emitted or deduplicated identities.';
COMMENT ON COLUMN post_publication_identity_snapshots.receipt_cursor_kind IS 'Snapshot-key source branch for prior receipt retention.';
COMMENT ON COLUMN post_publication_identity_snapshots.receipt_cursor_value IS 'Last snapshot key ID retained atomically.';
COMMENT ON COLUMN post_publication_identity_snapshots.receipt_retained_at IS 'EOF of prior receipt retention before current source staging.';
COMMENT ON COLUMN post_publication_identity_snapshots.receipt_source_version IS 'Accepted prior receipt version checked on every stage.';
COMMENT ON COLUMN post_publication_identity_snapshots.completed_at IS 'Exact source comparison and scalar validation completion time.';
COMMENT ON COLUMN post_publication_identity_snapshots.abandoned_at IS 'Source drift or supersession invalidated this attempt.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.snapshot_id IS 'Owning snapshot; restrict deletion until bounded key reclamation.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.post_type IS 'Post type of a sitemap tuple.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.day IS 'UTC publication day of a sitemap tuple.';
COMMENT ON TABLE post_publication_identity_snapshots IS 'Immutable-at-acceptance bounded identity materialization attempts; intentionally independent from dirty work.';
COMMENT ON TABLE post_publication_identity_snapshot_keys IS 'Typed exact projection identities for a publication snapshot; delete explicitly in bounded pages before removing a snapshot.';
COMMENT ON COLUMN post_publication_projection_receipts.applied_snapshot_id IS 'Complete snapshot accepted after projection effects; required for every receipt.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.topic_key IS 'Immutable topic key projection value; never joined to a live entity.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.author_key IS 'Immutable author key projection value; never joined to a live entity.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.author_username IS 'Immutable author username projection value; never joined to a live entity.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.community_key IS 'Immutable community key projection value; never joined to a live entity.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.community_slug IS 'Immutable community slug projection value; never joined to a live entity.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.post_slug IS 'Immutable post slug projection value; never joined to a live entity.';
COMMENT ON COLUMN post_publication_identity_snapshot_keys.rss_feed_key IS 'Immutable rss feed key projection value; never joined to a live entity.';
