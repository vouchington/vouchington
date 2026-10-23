-- edited-in-place: pre-launch, never deployed to production
CREATE TABLE IF NOT EXISTS moderation_cases (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  -- Exactly one of these must be non-null (the entity this case concerns).
  -- guardrails-disable-next-line uuid-must-be-key
  post_id uuid REFERENCES posts (id) ON DELETE CASCADE,
  -- guardrails-disable-next-line uuid-must-be-key
  reported_user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  -- guardrails-disable-next-line uuid-must-be-key
  hostname_id uuid REFERENCES url_hostnames (id) ON DELETE CASCADE,
  rss_feed_item_id uuid REFERENCES rss_feed_items (id) ON DELETE CASCADE,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  resolved_at timestamptz,
  -- guardrails-disable-next-line uuid-must-be-key
  resolved_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  CHECK (num_nonnulls(post_id, reported_user_id, hostname_id, rss_feed_item_id) = 1)
);

CREATE OR REPLACE TRIGGER trigger_moderation_cases_updated_at
  BEFORE UPDATE ON moderation_cases
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- At most one open (unresolved) case per entity at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_cases__one_open_post
  ON moderation_cases (post_id)
  WHERE post_id IS NOT NULL AND resolved_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_cases__one_open_user
  ON moderation_cases (reported_user_id)
  WHERE reported_user_id IS NOT NULL AND resolved_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_cases__one_open_hostname
  ON moderation_cases (hostname_id)
  WHERE hostname_id IS NOT NULL AND resolved_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_cases__one_open_rss
  ON moderation_cases (rss_feed_item_id)
  WHERE rss_feed_item_id IS NOT NULL AND resolved_at IS NULL;

-- FK-backing lookup indexes
CREATE INDEX IF NOT EXISTS idx_moderation_cases__post_id
  ON moderation_cases (post_id) WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_cases__reported_user_id
  ON moderation_cases (reported_user_id) WHERE reported_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_cases__hostname_id
  ON moderation_cases (hostname_id) WHERE hostname_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_cases__rss_feed_item_id
  ON moderation_cases (rss_feed_item_id) WHERE rss_feed_item_id IS NOT NULL;

COMMENT ON TABLE moderation_cases IS 'Unified moderation case ledger. One open case per entity at a time; all moderation stages reference a case_id. Resolved cases are deleted after 24 months once every child record has expired.';
COMMENT ON COLUMN moderation_cases.post_id IS 'Affected post or comment; set when entity is a post or comment.';
COMMENT ON COLUMN moderation_cases.reported_user_id IS 'Affected user; set when entity is a user.';
COMMENT ON COLUMN moderation_cases.hostname_id IS 'Affected URL hostname; set when entity is url_hostname.';
COMMENT ON COLUMN moderation_cases.rss_feed_item_id IS 'Affected RSS feed item; set when entity is rss_feed_item.';
COMMENT ON COLUMN moderation_cases.resolved_at IS 'When this case was closed (all open reports and appeals for the entity resolved). NULL means the case is still open.';
COMMENT ON COLUMN moderation_cases.resolved_by_id IS 'The staff user who triggered the final resolution. NULL for system-resolved cases.';

-- Each moderation record family advances independently through an id-bounded pass.
-- A completed pass resets its position so rows that became terminal later are revisited.
DO $$ BEGIN
  CREATE TYPE moderation_record_cleanup_kinds AS ENUM (
    'reports', 'cases', 'appeals', 'disputes', 'actions', 'training_feedbacks',
    'judgements', 'integrity_flags', 'report_penalties', 'vote_penalties',
    'warnings', 'suspensions', 'bans', 'notes', 'applications'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS moderation_record_cleanup_cursors (
  kind moderation_record_cleanup_kinds PRIMARY KEY,
  cursor_id uuid,
  sweep_upper_bound_id uuid,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trigger_moderation_record_cleanup_cursors_updated_at
  BEFORE UPDATE ON moderation_record_cleanup_cursors
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

INSERT INTO moderation_record_cleanup_cursors (kind) VALUES
  ('reports'), ('cases'), ('appeals'), ('disputes'), ('actions'),
  ('training_feedbacks'), ('judgements'), ('integrity_flags'),
  ('report_penalties'), ('vote_penalties'), ('warnings'), ('suspensions'),
  ('bans'), ('notes'), ('applications') ON CONFLICT DO NOTHING;

COMMENT ON TABLE moderation_record_cleanup_cursors IS 'Durable UUIDv7 keyset progress for bounded daily moderation record retention.';
COMMENT ON COLUMN moderation_record_cleanup_cursors.kind IS 'Moderation record family scanned by this cursor.';
COMMENT ON COLUMN moderation_record_cleanup_cursors.cursor_id IS 'Last examined UUIDv7 id; NULL starts the next full pass, with no entity foreign key because examined rows may be deleted.';
COMMENT ON COLUMN moderation_record_cleanup_cursors.sweep_upper_bound_id IS 'Frozen exclusive UUIDv7 upper bound for the current pass; NULL when no pass is in progress.';
COMMENT ON COLUMN moderation_record_cleanup_cursors.updated_at IS 'When this stream last checkpointed.';
