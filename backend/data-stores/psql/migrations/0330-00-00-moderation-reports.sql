-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- edited-in-place: pre-launch, never deployed to production
DO $$ BEGIN
  CREATE TYPE moderation_report_entity_types AS ENUM ('rss_feed_item', 'post', 'comment', 'user', 'url_hostname');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE moderation_report_reasons AS ENUM ('spam', 'harassment', 'misinformation', 'illegal_content', 'other', 'vote_manipulation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE moderation_report_resolution_actions AS ENUM ('reviewed', 'actioned', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS moderation_reports (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  created_via content_creation_channels NOT NULL,
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
  reason           moderation_report_reasons NOT NULL,
  original_reason  moderation_report_reasons NOT NULL,
  -- Nullable operational owner. Reports that are not community-scoped stay valid, and
  -- ON DELETE SET NULL clears ownership when a community is removed without deleting the
  -- transparency snapshot, which is deliberately not a foreign key.
  community_id uuid REFERENCES communities (id) ON DELETE SET NULL,
  moderation_transparency_community_id uuid,
  note             text CHECK (note IS NULL OR char_length(note) <= 1000),
  resolution_action moderation_report_resolution_actions,
  resolved_by_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Escalation: a moderator can escalate a pending report for senior-mod review.
  escalated_at     timestamptz,
  escalated_by_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  CHECK (num_nonnulls(post_id, reported_user_id, hostname_id, rss_feed_item_id) = 1),
  CHECK ((reviewed_at IS NULL AND resolution_action IS NULL) OR (reviewed_at IS NOT NULL AND resolution_action IS NOT NULL)),
  CHECK (escalated_at IS NOT NULL OR escalated_by_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_moderation_reports__escalated_by_id
  ON moderation_reports (escalated_by_id) WHERE escalated_by_id IS NOT NULL;

-- Per-entity dedup: one pending report per reporter per target.
-- User reports without an operational community stay global. User reports owned by a
-- community, including ban-evasion system reports, are one pending row per community.
-- A cleared community_id keeps its transparency snapshot and leaves both unique indexes.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Post-first also serves pending-report existence probes for a community post.
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_reports__active_post_unique
  ON moderation_reports (post_id, reporter_user_id)
  WHERE reviewed_at IS NULL AND post_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_reports__active_user_unique
  ON moderation_reports (reporter_user_id, reported_user_id)
  WHERE reviewed_at IS NULL
    AND reported_user_id IS NOT NULL
    AND community_id IS NULL
    AND moderation_transparency_community_id IS NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_reports__active_community_user_unique
  ON moderation_reports (
    reporter_user_id, reported_user_id, community_id
  )
  WHERE reviewed_at IS NULL
    AND reported_user_id IS NOT NULL
    AND community_id IS NOT NULL;

-- Leading index for the community_id foreign key. The partial predicate is referential-integrity
-- usable because the probed parent id is never null.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_moderation_reports__community_id
  ON moderation_reports (community_id)
  WHERE community_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_reports__active_hostname_unique
  ON moderation_reports (reporter_user_id, hostname_id)
  WHERE reviewed_at IS NULL AND hostname_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_reports__active_rss_unique
  ON moderation_reports (reporter_user_id, rss_feed_item_id)
  WHERE reviewed_at IS NULL AND rss_feed_item_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_moderation_reports__pending_id
  ON moderation_reports (id DESC)
  WHERE reviewed_at IS NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_moderation_reports__resolution_id
  ON moderation_reports (resolution_action, id DESC)
  WHERE reviewed_at IS NOT NULL;

-- Per-entity lookup indexes
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_moderation_reports__post_id
  ON moderation_reports (post_id, resolution_action, id DESC) WHERE post_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_moderation_reports__reported_user_id
  ON moderation_reports (reported_user_id, resolution_action, id DESC)
  WHERE reported_user_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_moderation_reports__hostname_id
  ON moderation_reports (hostname_id, resolution_action, id DESC) WHERE hostname_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_moderation_reports__rss_feed_item_id
  ON moderation_reports (rss_feed_item_id, resolution_action, id DESC)
  WHERE rss_feed_item_id IS NOT NULL;

-- A dense pending post cluster needs its latest report without sorting every sibling.
CREATE INDEX IF NOT EXISTS idx_moderation_reports__pending_post_id_id
  ON moderation_reports (post_id, id DESC)
  WHERE reviewed_at IS NULL AND post_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_moderation_reports__case_id
  ON moderation_reports (case_id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_moderation_reports__resolved_by_id
  ON moderation_reports (resolved_by_id)
  WHERE resolved_by_id IS NOT NULL;

COMMENT ON TABLE moderation_reports IS 'User-submitted reports flagging content or accounts for moderator review. Exactly one entity FK is set per row. Resolved reports are deleted 24 months after review; pending reports remain.';
COMMENT ON COLUMN moderation_reports.reporter_user_id IS 'User who submitted the report. System-generated reports use a dedicated system user (e.g. the ban-evasion system user).';
COMMENT ON COLUMN moderation_reports.reviewed_at IS 'Timestamp when a moderator reviewed the report.';
COMMENT ON COLUMN moderation_reports.post_id IS 'Reported post or comment; set when entity is a post or comment (distinguished by posts.post_type).';
COMMENT ON COLUMN moderation_reports.reported_user_id IS 'Reported user; set when entity is a user.';
COMMENT ON COLUMN moderation_reports.hostname_id IS 'Reported URL hostname; set when entity is url_hostname.';
COMMENT ON COLUMN moderation_reports.rss_feed_item_id IS 'Reported RSS feed item; set when entity is rss_feed_item.';
COMMENT ON COLUMN moderation_reports.reason IS 'Reporter-selected reason for the report.';
COMMENT ON COLUMN moderation_reports.original_reason IS 'Immutable reporter-selected reason when this report row was created.';
COMMENT ON COLUMN moderation_reports.community_id IS 'Community that owns this report. NULL when the report is not community-scoped. Deleting the community clears this reference and leaves the transparency snapshot intact.';
COMMENT ON COLUMN moderation_reports.moderation_transparency_community_id IS 'Immutable community scope stamped for global-transparency exclusion. Not a foreign key, so the snapshot survives community deletion.';
COMMENT ON COLUMN moderation_reports.note IS 'Optional free-text note from the reporter.';
COMMENT ON COLUMN moderation_reports.resolution_action IS 'Final moderation report outcome. NULL means pending; application queries derive status from reviewed_at plus this action.';
COMMENT ON COLUMN moderation_reports.resolved_by_id IS 'Moderator who resolved the report.';
COMMENT ON COLUMN moderation_reports.escalated_at IS 'When a moderator escalated this report for senior-mod attention. NULL means not escalated.';
COMMENT ON COLUMN moderation_reports.escalated_by_id IS 'The moderator who escalated this report.';
COMMENT ON COLUMN moderation_reports.case_id IS 'The moderation case this report belongs to.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_moderation_reports__created_via_oauth_client_id
  ON moderation_reports (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

-- Current indexes for fresh schema bootstrap.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_moderation_reports__reporter_user_id
  ON moderation_reports (reporter_user_id)
  WHERE reporter_user_id IS NOT NULL;

-- Current, transactionally maintained cluster sort keys. A NULL resolution_action denotes pending.
-- No report-id pointer survives a report's retention deletion.
CREATE TABLE IF NOT EXISTS moderation_report_clusters (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  post_id uuid REFERENCES posts (id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  hostname_id uuid REFERENCES url_hostnames (id) ON DELETE CASCADE,
  rss_feed_item_id uuid REFERENCES rss_feed_items (id) ON DELETE CASCADE,
  resolution_action moderation_report_resolution_actions,
  first_reported_at timestamptz NOT NULL,
  last_reported_at timestamptz NOT NULL,
  report_count integer NOT NULL CHECK (report_count > 0),
  CONSTRAINT moderation_report_clusters_one_target
    CHECK (num_nonnulls(post_id, reported_user_id, hostname_id, rss_feed_item_id) = 1),
  CONSTRAINT moderation_report_clusters_one_status_target
    UNIQUE NULLS NOT DISTINCT (
      resolution_action, post_id, reported_user_id, hostname_id, rss_feed_item_id
    ),
  CONSTRAINT moderation_report_clusters_reported_order
    CHECK (first_reported_at <= last_reported_at)
);

CREATE INDEX IF NOT EXISTS idx_moderation_report_clusters__post_id
  ON moderation_report_clusters (post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_moderation_report_clusters__reported_user_id
  ON moderation_report_clusters (reported_user_id) WHERE reported_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_moderation_report_clusters__hostname_id
  ON moderation_report_clusters (hostname_id) WHERE hostname_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_moderation_report_clusters__rss_feed_item_id
  ON moderation_report_clusters (rss_feed_item_id) WHERE rss_feed_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_report_clusters__first_reported_at
  ON moderation_report_clusters (
    resolution_action, first_reported_at,
    (COALESCE(post_id, reported_user_id, hostname_id, rss_feed_item_id))
  );
CREATE INDEX IF NOT EXISTS idx_moderation_report_clusters__last_reported_at
  ON moderation_report_clusters (
    resolution_action, last_reported_at,
    (COALESCE(post_id, reported_user_id, hostname_id, rss_feed_item_id))
  );

-- Pending dominates the queue. These covering walks reach the page before probing post type;
-- the general indexes above serve the three smaller resolved-outcome walks.
CREATE INDEX IF NOT EXISTS idx_moderation_report_clusters__pending_first_reported_at
  ON moderation_report_clusters (
    first_reported_at,
    (COALESCE(post_id, reported_user_id, hostname_id, rss_feed_item_id))
  ) INCLUDE (post_id, reported_user_id, hostname_id, rss_feed_item_id)
  WHERE resolution_action IS NULL;
CREATE INDEX IF NOT EXISTS idx_moderation_report_clusters__pending_last_reported_at
  ON moderation_report_clusters (
    last_reported_at,
    (COALESCE(post_id, reported_user_id, hostname_id, rss_feed_item_id))
  ) INCLUDE (post_id, reported_user_id, hostname_id, rss_feed_item_id)
  WHERE resolution_action IS NULL;

COMMENT ON TABLE moderation_report_clusters IS 'Current per-entity and per-outcome report cluster keys, kept exact by report row triggers and removed when no reports remain.';
COMMENT ON COLUMN moderation_report_clusters.post_id IS 'Reported post or comment, including the live target for this cluster.';
COMMENT ON COLUMN moderation_report_clusters.reported_user_id IS 'Reported user, including the live target for this cluster.';
COMMENT ON COLUMN moderation_report_clusters.hostname_id IS 'Reported hostname, including the live target for this cluster.';
COMMENT ON COLUMN moderation_report_clusters.rss_feed_item_id IS 'Reported RSS feed item, including the live target for this cluster.';
COMMENT ON COLUMN moderation_report_clusters.resolution_action IS 'NULL for pending reports, otherwise the reviewed report outcome.';
COMMENT ON COLUMN moderation_report_clusters.first_reported_at IS 'Earliest UUIDv7 report timestamp in this target and outcome cluster.';
COMMENT ON COLUMN moderation_report_clusters.last_reported_at IS 'Latest UUIDv7 report timestamp in this target and outcome cluster.';
COMMENT ON COLUMN moderation_report_clusters.report_count IS 'Number of current report rows in this target and outcome cluster.';

CREATE OR REPLACE FUNCTION fn_update_moderation_report_cluster() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  prior_cluster record;
  next_first timestamptz;
  next_last timestamptz;
  prior_reported_at timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.id = NEW.id
      AND OLD.resolution_action IS NOT DISTINCT FROM NEW.resolution_action
      AND OLD.post_id IS NOT DISTINCT FROM NEW.post_id
      AND OLD.reported_user_id IS NOT DISTINCT FROM NEW.reported_user_id
      AND OLD.hostname_id IS NOT DISTINCT FROM NEW.hostname_id
      AND OLD.rss_feed_item_id IS NOT DISTINCT FROM NEW.rss_feed_item_id THEN
      RETURN NEW;
    END IF;

    IF OLD.resolution_action IS DISTINCT FROM NEW.resolution_action
      OR OLD.post_id IS DISTINCT FROM NEW.post_id
      OR OLD.reported_user_id IS DISTINCT FROM NEW.reported_user_id
      OR OLD.hostname_id IS DISTINCT FROM NEW.hostname_id
      OR OLD.rss_feed_item_id IS DISTINCT FROM NEW.rss_feed_item_id THEN
      -- Both existing clusters will be written. Lock them in one order before the OLD
      -- decrement and NEW upsert, so opposite status/target moves cannot form ABBA.
      PERFORM cluster.id FROM moderation_report_clusters cluster
      WHERE (cluster.resolution_action IS NOT DISTINCT FROM OLD.resolution_action
          AND (cluster.post_id = OLD.post_id
            OR cluster.reported_user_id = OLD.reported_user_id
            OR cluster.hostname_id = OLD.hostname_id
            OR cluster.rss_feed_item_id = OLD.rss_feed_item_id))
        OR (cluster.resolution_action IS NOT DISTINCT FROM NEW.resolution_action
          AND (cluster.post_id = NEW.post_id
            OR cluster.reported_user_id = NEW.reported_user_id
            OR cluster.hostname_id = NEW.hostname_id
            OR cluster.rss_feed_item_id = NEW.rss_feed_item_id))
      ORDER BY cluster.id FOR UPDATE;
    END IF;
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    SELECT cluster.id, cluster.report_count, cluster.first_reported_at,
      cluster.last_reported_at INTO prior_cluster
    FROM moderation_report_clusters cluster
    WHERE cluster.resolution_action IS NOT DISTINCT FROM OLD.resolution_action
      AND (cluster.post_id = OLD.post_id
        OR cluster.reported_user_id = OLD.reported_user_id
        OR cluster.hostname_id = OLD.hostname_id
        OR cluster.rss_feed_item_id = OLD.rss_feed_item_id)
    FOR UPDATE;

    IF FOUND THEN
      IF prior_cluster.report_count = 1 THEN
        DELETE FROM moderation_report_clusters WHERE id = prior_cluster.id;
      ELSE
        prior_reported_at := uuid_extract_timestamp(OLD.id);
        IF prior_cluster.first_reported_at = prior_reported_at THEN
          SELECT uuid_extract_timestamp(s.id) INTO next_first
          FROM moderation_reports s
          WHERE (s.post_id = OLD.post_id OR s.reported_user_id = OLD.reported_user_id
              OR s.hostname_id = OLD.hostname_id OR s.rss_feed_item_id = OLD.rss_feed_item_id)
            AND s.resolution_action IS NOT DISTINCT FROM OLD.resolution_action
          ORDER BY s.id ASC LIMIT 1;
        END IF;
        IF prior_cluster.last_reported_at = prior_reported_at THEN
          SELECT uuid_extract_timestamp(s.id) INTO next_last
          FROM moderation_reports s
          WHERE (s.post_id = OLD.post_id OR s.reported_user_id = OLD.reported_user_id
              OR s.hostname_id = OLD.hostname_id OR s.rss_feed_item_id = OLD.rss_feed_item_id)
            AND s.resolution_action IS NOT DISTINCT FROM OLD.resolution_action
          ORDER BY s.id DESC LIMIT 1;
        END IF;
        UPDATE moderation_report_clusters
        SET report_count = report_count - 1,
          first_reported_at = COALESCE(next_first, first_reported_at),
          last_reported_at = COALESCE(next_last, last_reported_at)
        WHERE id = prior_cluster.id;
      END IF;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO moderation_report_clusters (
      post_id, reported_user_id, hostname_id, rss_feed_item_id,
      resolution_action, first_reported_at, last_reported_at, report_count
    ) VALUES (
      NEW.post_id, NEW.reported_user_id, NEW.hostname_id, NEW.rss_feed_item_id,
      NEW.resolution_action, uuid_extract_timestamp(NEW.id), uuid_extract_timestamp(NEW.id), 1
    )
    ON CONFLICT ON CONSTRAINT moderation_report_clusters_one_status_target
    DO UPDATE SET
      first_reported_at = LEAST(moderation_report_clusters.first_reported_at, EXCLUDED.first_reported_at),
      last_reported_at = GREATEST(moderation_report_clusters.last_reported_at, EXCLUDED.last_reported_at),
      report_count = moderation_report_clusters.report_count + 1;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trigger_moderation_report_clusters_insert_delete
  AFTER INSERT OR DELETE ON moderation_reports
  FOR EACH ROW EXECUTE FUNCTION fn_update_moderation_report_cluster();
CREATE OR REPLACE TRIGGER trigger_moderation_report_clusters_update
  AFTER UPDATE OF id, reviewed_at, resolution_action, post_id, reported_user_id,
    hostname_id, rss_feed_item_id ON moderation_reports
  FOR EACH ROW EXECUTE FUNCTION fn_update_moderation_report_cluster();
