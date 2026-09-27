-- edited-in-place: pre-launch, never deployed to production
DO $$ BEGIN
  CREATE TYPE moderation_report_entity_type AS ENUM ('rss_feed_item', 'post', 'comment', 'user', 'url_hostname');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE moderation_report_reason AS ENUM ('spam', 'harassment', 'misinformation', 'illegal_content', 'other', 'vote_manipulation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE moderation_report_resolution_action AS ENUM ('reviewed', 'actioned', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS moderation_reports (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  created_via content_creation_channels,
  created_via_oauth_client_id UUID,
  CONSTRAINT moderation_reports_created_via_oauth_client_id_check CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp'))),
  created_at       timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  reviewed_at      timestamptz,
  reporter_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Exactly one entity FK is set per row (enforced by CHECK constraint below).
  -- post_id covers both posts and comments (distinguished by posts.post_type).
  post_id          uuid REFERENCES posts(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  hostname_id      uuid REFERENCES url_hostnames(id) ON DELETE CASCADE,
  rss_feed_item_id uuid REFERENCES rss_feed_items(id) ON DELETE CASCADE,
  -- guardrails-disable-next-line uuid-must-be-key
  case_id          uuid NOT NULL REFERENCES moderation_cases (id) ON DELETE CASCADE,
  reason           moderation_report_reason NOT NULL,
  original_reason  moderation_report_reason NOT NULL,
  moderation_transparency_community_id uuid,
  note             text CHECK (note IS NULL OR char_length(note) <= 1000),
  resolution_action moderation_report_resolution_action,
  resolved_by_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Escalation: a moderator can escalate a pending report for senior-mod review.
  escalated_at     timestamptz,
  escalated_by_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  CHECK (num_nonnulls(post_id, reported_user_id, hostname_id, rss_feed_item_id) = 1),
  CHECK ((reviewed_at IS NULL AND resolution_action IS NULL) OR (reviewed_at IS NOT NULL AND resolution_action IS NOT NULL)),
  CHECK (escalated_at IS NOT NULL OR escalated_by_id IS NULL)
);

-- Per-entity dedup: one pending report per reporter per target
CREATE UNIQUE INDEX IF NOT EXISTS moderation_reports_active_post_uniq
  ON moderation_reports (reporter_user_id, post_id)
  WHERE reviewed_at IS NULL AND post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS moderation_reports_active_user_uniq
  ON moderation_reports (reporter_user_id, reported_user_id)
  WHERE reviewed_at IS NULL AND reported_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS moderation_reports_active_hostname_uniq
  ON moderation_reports (reporter_user_id, hostname_id)
  WHERE reviewed_at IS NULL AND hostname_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS moderation_reports_active_rss_uniq
  ON moderation_reports (reporter_user_id, rss_feed_item_id)
  WHERE reviewed_at IS NULL AND rss_feed_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_reports_pending_id
  ON moderation_reports (id DESC)
  WHERE reviewed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_reports_resolution_id
  ON moderation_reports (resolution_action, id DESC)
  WHERE reviewed_at IS NOT NULL;

-- Per-entity lookup indexes
CREATE INDEX IF NOT EXISTS idx_moderation_reports_post_id
  ON moderation_reports (post_id) WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_reports_reported_user_id
  ON moderation_reports (reported_user_id) WHERE reported_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_reports_hostname_id
  ON moderation_reports (hostname_id) WHERE hostname_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_reports_rss_feed_item_id
  ON moderation_reports (rss_feed_item_id) WHERE rss_feed_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_reports_case_id
  ON moderation_reports (case_id);

CREATE INDEX IF NOT EXISTS idx_moderation_reports_resolved_by_id
  ON moderation_reports (resolved_by_id)
  WHERE resolved_by_id IS NOT NULL;

COMMENT ON TABLE moderation_reports IS 'User-submitted reports flagging content or accounts for moderator review. Exactly one entity FK is set per row.';
COMMENT ON COLUMN moderation_reports.reporter_user_id IS 'User who submitted the report. System-generated reports use a dedicated system user (e.g. the ban-evasion system user).';
COMMENT ON COLUMN moderation_reports.reviewed_at IS 'Timestamp when a moderator reviewed the report.';
COMMENT ON COLUMN moderation_reports.post_id IS 'Reported post or comment; set when entity is a post or comment (distinguished by posts.post_type).';
COMMENT ON COLUMN moderation_reports.reported_user_id IS 'Reported user; set when entity is a user.';
COMMENT ON COLUMN moderation_reports.hostname_id IS 'Reported URL hostname; set when entity is url_hostname.';
COMMENT ON COLUMN moderation_reports.rss_feed_item_id IS 'Reported RSS feed item; set when entity is rss_feed_item.';
COMMENT ON COLUMN moderation_reports.reason IS 'Reporter-selected reason for the report.';
COMMENT ON COLUMN moderation_reports.original_reason IS 'Immutable reporter-selected reason when this report row was created.';
COMMENT ON COLUMN moderation_reports.moderation_transparency_community_id IS 'Immutable community scope stamped from the reported post for global-transparency exclusion.';
COMMENT ON COLUMN moderation_reports.note IS 'Optional free-text note from the reporter.';
COMMENT ON COLUMN moderation_reports.resolution_action IS 'Final moderation report outcome. NULL means pending; application queries derive status from reviewed_at plus this action.';
COMMENT ON COLUMN moderation_reports.resolved_by_id IS 'Moderator who resolved the report.';
COMMENT ON COLUMN moderation_reports.escalated_at IS 'When a moderator escalated this report for senior-mod attention. NULL means not escalated.';
COMMENT ON COLUMN moderation_reports.escalated_by_id IS 'The moderator who escalated this report.';
COMMENT ON COLUMN moderation_reports.case_id IS 'The moderation case this report belongs to.';

CREATE INDEX IF NOT EXISTS idx_moderation_reports__created_via_oauth_client_id
  ON moderation_reports (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;
