-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
DO $$ BEGIN
  CREATE TYPE revision_types AS ENUM ('create', 'update', 'delete');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Post revisions: RANGE partitioned by id (UUIDv7) for partition-wise locality
CREATE TABLE IF NOT EXISTS post_revisions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  post_id UUID NOT NULL,
  revision_type revision_types NOT NULL,
  revised_by_id UUID,
  changes JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT post_revisions_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT post_revisions_revised_by_id_fkey
    FOREIGN KEY (revised_by_id) REFERENCES users(id) ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED
) PARTITION BY RANGE (id);

COMMENT ON TABLE post_revisions IS 'Append-only revision log for posts. Stores per-field before/after diffs; proposed default retention is 90 days through guarded range retirement.';
COMMENT ON COLUMN post_revisions.post_id IS 'The post this revision is for.';
COMMENT ON COLUMN post_revisions.revision_type IS 'Type of change: create, update, or delete.';
COMMENT ON COLUMN post_revisions.revised_by_id IS 'The user who performed this change.';
COMMENT ON COLUMN post_revisions.changes IS 'JSONB object: { "field_name": { "before": <old>, "after": <new> } }';

-- Topic revisions: not partitioned (small table, all queries filter by topic_id)
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS topic_revisions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  topic_id UUID NOT NULL,
  revision_type revision_types NOT NULL,
  revised_by_id UUID,
  changes JSONB NOT NULL DEFAULT '{"changes": {}, "revised_by_roles": []}',
  CHECK (changes ?& ARRAY['changes', 'revised_by_roles']
    AND jsonb_typeof(changes->'changes') = 'object'
    AND jsonb_typeof(changes->'revised_by_roles') = 'array'),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT topic_revisions_topic_id_fkey
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT topic_revisions_revised_by_id_fkey
    FOREIGN KEY (revised_by_id) REFERENCES users(id) ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE topic_revisions IS 'Append-only revision log for topics. Stores per-field before/after diffs; proposed default retention is one year with the newest revision retained.';
COMMENT ON COLUMN topic_revisions.topic_id IS 'The topic this revision is for.';
COMMENT ON COLUMN topic_revisions.revision_type IS 'Type of change: create, update, or delete.';
COMMENT ON COLUMN topic_revisions.revised_by_id IS 'The user who performed this change.';
COMMENT ON COLUMN topic_revisions.changes IS 'Revision document containing per-field before/after changes and the revising user role snapshot.';

CREATE INDEX IF NOT EXISTS idx_post_revisions__post_id ON post_revisions (post_id);
CREATE INDEX IF NOT EXISTS idx_topic_revisions__topic_id__id ON topic_revisions (topic_id, id DESC);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)

CREATE TRIGGER trigger_post_revisions_append_only BEFORE UPDATE OR DELETE ON post_revisions FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation('revised_by_id');
CREATE TRIGGER trigger_topic_revisions_append_only BEFORE UPDATE ON topic_revisions FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation('revised_by_id');

CREATE OR REPLACE FUNCTION fn_reject_topic_revision_retention_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  IF uuid_extract_timestamp(OLD.id) < CURRENT_TIMESTAMP - INTERVAL '1 year'
    AND EXISTS (
      SELECT 1 FROM topic_revisions newer
      WHERE newer.topic_id = OLD.topic_id AND newer.id > OLD.id
      LIMIT 1
    ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'topic_revisions rows are append-only inside the one-year window or while latest'
    USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER trigger_topic_revisions_retention_delete
BEFORE DELETE ON topic_revisions FOR EACH ROW EXECUTE FUNCTION fn_reject_topic_revision_retention_delete();

CREATE TYPE content_history_cleanup_families AS ENUM (
  'topic_revisions', 'post_moderation_versions',
  'post_moderation_dispositions', 'agent_moderations'
);
CREATE TABLE IF NOT EXISTS content_history_cleanup_cursors (
  family content_history_cleanup_families PRIMARY KEY,
  cursor_record_id UUID,
  sweep_upper_bound_record_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((cursor_record_id IS NULL) OR (sweep_upper_bound_record_id IS NOT NULL AND cursor_record_id < sweep_upper_bound_record_id))
);
CREATE TRIGGER trigger_content_history_cleanup_cursors_updated_at
BEFORE UPDATE ON content_history_cleanup_cursors
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
COMMENT ON TABLE content_history_cleanup_cursors IS 'One deletion-stable fixed-window UUIDv7 sweep cursor per bounded content-history cleanup.';
COMMENT ON COLUMN content_history_cleanup_cursors.family IS 'History family with an independent retention scan and lock.';
COMMENT ON COLUMN content_history_cleanup_cursors.cursor_record_id IS 'Last scanned UUIDv7 record, not a live entity relationship.';
COMMENT ON COLUMN content_history_cleanup_cursors.sweep_upper_bound_record_id IS 'Exclusive fixed UUIDv7 age bound for the current sweep, not a live entity relationship.';
COMMENT ON COLUMN content_history_cleanup_cursors.updated_at IS 'Last committed sweep advance.';
