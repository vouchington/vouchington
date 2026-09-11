-- Report integrity: detection flags for mass-report campaigns and reporter penalties.
-- edited-in-place: pre-launch, never deployed to production

-- ============================================================================
-- ENUMs
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE report_integrity_flag_types AS ENUM ('mass_report_suspected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE report_integrity_resolutions AS ENUM ('dismissed', 'penalized');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Report Integrity Flags
-- ============================================================================

-- Moderation review queue for suspected mass-report campaigns.
-- Exactly one entity FK is set per row (enforced by CHECK constraint).
-- post_id covers both posts and comments (distinguished by posts.post_type).
CREATE TABLE IF NOT EXISTS report_integrity_flags (
  id               uuid DEFAULT uuidv7() PRIMARY KEY,
  post_id          uuid REFERENCES posts ON DELETE CASCADE,
  reported_user_id uuid REFERENCES users ON DELETE CASCADE,
  hostname_id      uuid REFERENCES url_hostnames ON DELETE CASCADE,
  rss_feed_item_id uuid REFERENCES rss_feed_items ON DELETE CASCADE,
  flag_type        report_integrity_flag_types NOT NULL DEFAULT 'mass_report_suspected',
  reporter_count   int NOT NULL,
  new_account_reporter_pct double precision NOT NULL
    CHECK (new_account_reporter_pct >= 0 AND new_account_reporter_pct <= 1),
  details          jsonb NOT NULL DEFAULT '{}',
  resolved_at      timestamptz,
  resolved_by_id   uuid REFERENCES users ON DELETE SET NULL,
  resolution       report_integrity_resolutions,
  created_at       timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (num_nonnulls(post_id, reported_user_id, hostname_id, rss_feed_item_id) = 1)
);

CREATE OR REPLACE TRIGGER trigger_report_integrity_flags_updated_at
  BEFORE UPDATE ON report_integrity_flags FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- Pending queue scan
CREATE INDEX IF NOT EXISTS idx_report_integrity_flags__pending
  ON report_integrity_flags (id)
  WHERE resolved_at IS NULL;

-- Per-entity dedup: one unresolved flag per entity per flag_type
CREATE UNIQUE INDEX IF NOT EXISTS idx_rif__post_flag_pending
  ON report_integrity_flags (post_id, flag_type)
  WHERE resolved_at IS NULL AND post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rif__user_flag_pending
  ON report_integrity_flags (reported_user_id, flag_type)
  WHERE resolved_at IS NULL AND reported_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rif__hostname_flag_pending
  ON report_integrity_flags (hostname_id, flag_type)
  WHERE resolved_at IS NULL AND hostname_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rif__rss_flag_pending
  ON report_integrity_flags (rss_feed_item_id, flag_type)
  WHERE resolved_at IS NULL AND rss_feed_item_id IS NOT NULL;

-- Per-entity lookup indexes
CREATE INDEX IF NOT EXISTS idx_rif__post_id
  ON report_integrity_flags (post_id) WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rif__reported_user_id
  ON report_integrity_flags (reported_user_id) WHERE reported_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rif__hostname_id
  ON report_integrity_flags (hostname_id) WHERE hostname_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rif__rss_feed_item_id
  ON report_integrity_flags (rss_feed_item_id) WHERE rss_feed_item_id IS NOT NULL;

COMMENT ON TABLE report_integrity_flags IS 'Moderation review queue for suspected mass-report campaigns. Exactly one entity FK is set per row.';
COMMENT ON COLUMN report_integrity_flags.post_id IS 'Flagged post or comment, if this flag targets a post or comment.';
COMMENT ON COLUMN report_integrity_flags.reported_user_id IS 'Flagged user, if this flag targets a user.';
COMMENT ON COLUMN report_integrity_flags.hostname_id IS 'Flagged URL hostname, if this flag targets a hostname.';
COMMENT ON COLUMN report_integrity_flags.rss_feed_item_id IS 'Flagged RSS feed item, if this flag targets an RSS item.';
COMMENT ON COLUMN report_integrity_flags.flag_type IS 'Type of integrity violation detected.';
COMMENT ON COLUMN report_integrity_flags.reporter_count IS 'Number of distinct reporters who filed pending reports on this entity within the detection window.';
COMMENT ON COLUMN report_integrity_flags.new_account_reporter_pct IS 'Percentage (0-1) of those reporters whose accounts are considered new (< NEW_ACCOUNT_AGE_DAYS old).';
COMMENT ON COLUMN report_integrity_flags.details IS 'JSON details about the detected anomaly including thresholds used.';
COMMENT ON COLUMN report_integrity_flags.resolved_at IS 'When a moderator resolved this flag.';
COMMENT ON COLUMN report_integrity_flags.resolved_by_id IS 'Moderator who resolved this flag.';
COMMENT ON COLUMN report_integrity_flags.resolution IS 'Outcome: dismissed or penalized.';

-- ============================================================================
-- Report Abuse Penalties
-- ============================================================================

-- Per-reporter audit records created when a mass-report flag is actioned.
CREATE TABLE IF NOT EXISTS report_abuse_penalties (
  id            uuid DEFAULT uuidv7() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  reason        text NOT NULL,
  source_flag_id uuid REFERENCES report_integrity_flags ON DELETE SET NULL,
  -- SET NULL (not CASCADE): the penalty audit row must survive the acting admin's
  -- hard-delete, otherwise the penalized reporter's users.bad_faith_reporter_at would
  -- be orphaned (trust-tier penalty stuck with no row left to revoke).
  created_by_id uuid REFERENCES users ON DELETE SET NULL,
  revoked_at    timestamptz,
  revoked_by_id uuid REFERENCES users ON DELETE SET NULL,
  created_at    timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_report_abuse_penalties_updated_at
  BEFORE UPDATE ON report_abuse_penalties FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_report_abuse_penalties__active
  ON report_abuse_penalties (user_id)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_abuse_penalties__user_flag_uniq
  ON report_abuse_penalties (user_id, source_flag_id)
  WHERE source_flag_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_report_abuse_penalties__flag
  ON report_abuse_penalties (source_flag_id)
  WHERE source_flag_id IS NOT NULL;

COMMENT ON TABLE report_abuse_penalties IS 'Penalties applied to bad-faith reporters as a result of a confirmed mass-report campaign.';
COMMENT ON COLUMN report_abuse_penalties.user_id IS 'The penalized reporter.';
COMMENT ON COLUMN report_abuse_penalties.reason IS 'Human-readable explanation of why the penalty was applied.';
COMMENT ON COLUMN report_abuse_penalties.source_flag_id IS 'The report integrity flag that triggered this penalty.';
COMMENT ON COLUMN report_abuse_penalties.revoked_at IS 'When the penalty was revoked.';
COMMENT ON COLUMN report_abuse_penalties.revoked_by_id IS 'Moderator who revoked the penalty.';
