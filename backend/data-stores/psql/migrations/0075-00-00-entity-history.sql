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

COMMENT ON TABLE post_revisions IS 'Append-only revision log for posts. Stores per-field before/after diffs.';
COMMENT ON COLUMN post_revisions.post_id IS 'The post this revision is for.';
COMMENT ON COLUMN post_revisions.revision_type IS 'Type of change: create, update, or delete.';
COMMENT ON COLUMN post_revisions.revised_by_id IS 'The user who performed this change.';
COMMENT ON COLUMN post_revisions.changes IS 'JSONB object: { "field_name": { "before": <old>, "after": <new> } }';

-- Topic revisions: not partitioned (small table, all queries filter by topic_id)
CREATE TABLE IF NOT EXISTS topic_revisions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  topic_id UUID NOT NULL,
  revision_type revision_types NOT NULL,
  revised_by_id UUID,
  revised_by_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  changes JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT topic_revisions_topic_id_fkey
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT topic_revisions_revised_by_id_fkey
    FOREIGN KEY (revised_by_id) REFERENCES users(id) ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE topic_revisions IS 'Append-only revision log for topics. Stores per-field before/after diffs.';
COMMENT ON COLUMN topic_revisions.topic_id IS 'The topic this revision is for.';
COMMENT ON COLUMN topic_revisions.revision_type IS 'Type of change: create, update, or delete.';
COMMENT ON COLUMN topic_revisions.revised_by_id IS 'The user who performed this change.';
COMMENT ON COLUMN topic_revisions.revised_by_roles IS 'Snapshot of the revising user roles at revision creation time.';
COMMENT ON COLUMN topic_revisions.changes IS 'JSONB object: { "field_name": { "before": <old>, "after": <new> } }';

CREATE INDEX IF NOT EXISTS idx_post_revisions__post_id ON post_revisions (post_id);
CREATE INDEX IF NOT EXISTS idx_topic_revisions__topic_id ON topic_revisions (topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_revisions__admin_content_update
  ON topic_revisions (topic_id, id DESC)
  WHERE revision_type IN ('create', 'update')
    AND changes ?| ARRAY['name', 'markdown']
    AND revised_by_roles @> ARRAY['administrator']::TEXT[];
