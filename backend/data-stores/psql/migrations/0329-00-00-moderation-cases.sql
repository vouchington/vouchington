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

COMMENT ON TABLE moderation_cases IS 'Unified moderation case ledger. One open case per entity at a time; all moderation stages (report → judgement → enforcement → notice → appeal) reference a case_id. Closed via resolved_at when all open reports and appeals for the entity are resolved.';
COMMENT ON COLUMN moderation_cases.post_id IS 'Affected post or comment; set when entity is a post or comment.';
COMMENT ON COLUMN moderation_cases.reported_user_id IS 'Affected user; set when entity is a user.';
COMMENT ON COLUMN moderation_cases.hostname_id IS 'Affected URL hostname; set when entity is url_hostname.';
COMMENT ON COLUMN moderation_cases.rss_feed_item_id IS 'Affected RSS feed item; set when entity is rss_feed_item.';
COMMENT ON COLUMN moderation_cases.resolved_at IS 'When this case was closed (all open reports and appeals for the entity resolved). NULL means the case is still open.';
COMMENT ON COLUMN moderation_cases.resolved_by_id IS 'The staff user who triggered the final resolution. NULL for system-resolved cases.';
