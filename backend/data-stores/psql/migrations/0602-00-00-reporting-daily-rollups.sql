CREATE TYPE reporting_rollup_kinds AS ENUM ('growth', 'moderator_workload');
COMMENT ON TYPE reporting_rollup_kinds IS 'Reporting projections completed by the ordered daily rollup worker.';

CREATE TABLE growth_metrics_daily_totals (
  day DATE PRIMARY KEY,
  user_count BIGINT NOT NULL CHECK (user_count >= 0),
  post_count BIGINT NOT NULL CHECK (post_count >= 0),
  review_count BIGINT NOT NULL CHECK (review_count >= 0),
  data_point_count BIGINT NOT NULL CHECK (data_point_count >= 0),
  discussion_count BIGINT NOT NULL CHECK (discussion_count >= 0),
  comment_count BIGINT NOT NULL CHECK (comment_count >= 0),
  story_count BIGINT NOT NULL CHECK (story_count >= 0),
  approved_count BIGINT NOT NULL CHECK (approved_count >= 0),
  reviewed_count BIGINT NOT NULL CHECK (reviewed_count >= 0),
  follow_count BIGINT NOT NULL CHECK (follow_count >= 0),
  vote_count BIGINT NOT NULL CHECK (vote_count >= 0),
  retained_vote_count BIGINT NOT NULL CHECK (retained_vote_count >= 0)
);
COMMENT ON TABLE growth_metrics_daily_totals IS 'Anonymous current-eligibility daily reporting totals, retained for the all-range growth report and replaced when that source day changes.';
COMMENT ON COLUMN growth_metrics_daily_totals.day IS 'UTC creation day of the counted source rows.';
COMMENT ON COLUMN growth_metrics_daily_totals.user_count IS 'Non-deleted users created on this day.';
COMMENT ON COLUMN growth_metrics_daily_totals.post_count IS 'Non-deleted posts created on this day, including types outside the displayed breakdown.';
COMMENT ON COLUMN growth_metrics_daily_totals.review_count IS 'Non-deleted review posts created on this day.';
COMMENT ON COLUMN growth_metrics_daily_totals.data_point_count IS 'Non-deleted data-point posts created on this day.';
COMMENT ON COLUMN growth_metrics_daily_totals.discussion_count IS 'Non-deleted discussion posts created on this day.';
COMMENT ON COLUMN growth_metrics_daily_totals.comment_count IS 'Non-deleted comments created on this day.';
COMMENT ON COLUMN growth_metrics_daily_totals.story_count IS 'Non-deleted story posts created on this day.';
COMMENT ON COLUMN growth_metrics_daily_totals.approved_count IS 'Non-deleted posts from this day whose approval timestamp is present.';
COMMENT ON COLUMN growth_metrics_daily_totals.reviewed_count IS 'Non-deleted posts from this day with an approval or rejection timestamp.';
COMMENT ON COLUMN growth_metrics_daily_totals.follow_count IS 'Active user follows whose current creation timestamp belongs to this day.';
COMMENT ON COLUMN growth_metrics_daily_totals.vote_count IS 'Qualifying post ballots from this day still present in the raw vote source.';
COMMENT ON COLUMN growth_metrics_daily_totals.retained_vote_count IS 'Anonymous qualifying ballot events already retained by the existing ballot cleanup tally.';

CREATE TABLE growth_metrics_daily_post_authors (
  day DATE NOT NULL REFERENCES growth_metrics_daily_totals(day) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (day, author_user_id)
);
CREATE INDEX idx_growth_metrics_daily_post_authors__author_user_id
  ON growth_metrics_daily_post_authors(author_user_id, day);
COMMENT ON TABLE growth_metrics_daily_post_authors IS 'Exact distinct-author membership for eligible posts on a completed day; recomputation removes memberships without eligible source posts and user purge cascades.';
COMMENT ON COLUMN growth_metrics_daily_post_authors.day IS 'Daily total cohort containing this eligible author membership.';
COMMENT ON COLUMN growth_metrics_daily_post_authors.author_user_id IS 'Live post author, including the existing deleted-account identity when source posts are reassigned.';

CREATE TABLE moderator_workload_daily_totals (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  day DATE NOT NULL,
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type moderator_action_types NOT NULL,
  count BIGINT NOT NULL CHECK (count > 0),
  CONSTRAINT moderator_workload_daily_totals_cohort
    UNIQUE NULLS NOT DISTINCT (day, community_id, actor_user_id, action_type)
);
CREATE INDEX idx_moderator_workload_daily_totals__community_id_day
  ON moderator_workload_daily_totals(community_id, day, actor_user_id, action_type);
CREATE INDEX idx_moderator_workload_daily_totals__actor_user_id
  ON moderator_workload_daily_totals(actor_user_id, day);
COMMENT ON TABLE moderator_workload_daily_totals IS 'Daily moderator-action reporting cohorts; NULL-community global cohorts survive community purge, scoped cohorts cascade, and bounded cleanup retires days outside the analytics window.';
COMMENT ON COLUMN moderator_workload_daily_totals.id IS 'Identity of this daily reporting cohort.';
COMMENT ON COLUMN moderator_workload_daily_totals.day IS 'UTC creation day of the source moderator actions.';
COMMENT ON COLUMN moderator_workload_daily_totals.community_id IS 'Live community scope, or NULL for the independent global aggregate.';
COMMENT ON COLUMN moderator_workload_daily_totals.actor_user_id IS 'Live actor required by the existing workload reader; physical user purge removes this cohort.';
COMMENT ON COLUMN moderator_workload_daily_totals.action_type IS 'Moderator action counted by this cohort; reader applies the current dashboard taxonomy.';
COMMENT ON COLUMN moderator_workload_daily_totals.count IS 'Exact source actions in this cohort, replaced by a completed-day recomputation.';

CREATE TABLE reporting_daily_rollup_cursors (
  kind reporting_rollup_kinds PRIMARY KEY,
  next_rollup_on DATE NOT NULL
);
COMMENT ON TABLE reporting_daily_rollup_cursors IS 'Transactional first-unmaterialized day for scheduled reporting; ordinary initialization discovers the earliest source day and every completed day writes explicit totals before advancing.';
COMMENT ON COLUMN reporting_daily_rollup_cursors.kind IS 'Concrete daily reporting projection whose position this row owns.';
COMMENT ON COLUMN reporting_daily_rollup_cursors.next_rollup_on IS 'Next UTC source day due for scheduled computation; initialization claims no historical day was completed.';

CREATE TYPE reporting_source_change_types AS ENUM ('user_follow', 'post_vote_deletion', 'moderator_action_deletion', 'user_deletion', 'post_deletion', 'retained_vote_change', 'post_vote_creation', 'moderator_action_creation');
COMMENT ON TYPE reporting_source_change_types IS 'Closed lifecycle sources whose old reporting day can vanish during a mutation.';
CREATE TABLE reporting_source_changes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  source_type reporting_source_change_types NOT NULL,
  source_day DATE NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
) PARTITION BY RANGE (id);
COMMENT ON TABLE reporting_source_changes IS 'Anonymous atomic lifecycle snapshots of vanished reporting-day inputs; existing entity reconciliation consumes the UUIDv7 event window and cleanupPartitions retires the monthly history.';
COMMENT ON COLUMN reporting_source_changes.id IS 'Monotonic event cursor, not a relationship to a source row.';
COMMENT ON COLUMN reporting_source_changes.source_type IS 'Concrete source lifecycle represented by the immutable snapshot.';
COMMENT ON COLUMN reporting_source_changes.source_day IS 'UTC source day whose old input vanished or retained tally changed; contains no entity identity or pending-work state.';
COMMENT ON COLUMN reporting_source_changes.created_at IS 'Source mutation event time derived from its UUIDv7 identity.';

CREATE FUNCTION record_vanished_reporting_day() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_day date;
  source_kind reporting_source_change_types;
BEGIN
  CASE TG_ARGV[0]
    WHEN 'user_follow' THEN
      IF TG_OP = 'UPDATE' AND OLD.created_at IS NOT DISTINCT FROM NEW.created_at
        AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at THEN RETURN NULL; END IF;
      old_day := (CASE WHEN TG_OP = 'INSERT' THEN NEW.created_at ELSE OLD.created_at END AT TIME ZONE 'UTC')::date;
      source_kind := 'user_follow';
    WHEN 'user_deletion' THEN
      old_day := (uuid_extract_timestamp(OLD.id) AT TIME ZONE 'UTC')::date;
      source_kind := 'user_deletion';
    WHEN 'post_deletion' THEN
      old_day := (uuid_extract_timestamp(OLD.id) AT TIME ZONE 'UTC')::date;
      source_kind := 'post_deletion';
    WHEN 'moderator_action_deletion' THEN
      old_day := (uuid_extract_timestamp(OLD.id) AT TIME ZONE 'UTC')::date;
      source_kind := 'moderator_action_deletion';
    WHEN 'retained_vote_change' THEN
      old_day := CASE WHEN TG_OP = 'DELETE' THEN OLD.day ELSE NEW.day END;
      source_kind := 'retained_vote_change';
    WHEN 'post_vote_creation' THEN
      old_day := (uuid_extract_timestamp(NEW.id) AT TIME ZONE 'UTC')::date;
      source_kind := 'post_vote_creation';
    WHEN 'moderator_action_creation' THEN
      old_day := (uuid_extract_timestamp(NEW.id) AT TIME ZONE 'UTC')::date;
      source_kind := 'moderator_action_creation';
    WHEN 'post_vote_deletion' THEN
      -- Ballot row triggers are cloned to range children, including direct child and FK deletes.
      old_day := (uuid_extract_timestamp(OLD.id) AT TIME ZONE 'UTC')::date;
      source_kind := 'post_vote_deletion';
    ELSE RAISE EXCEPTION 'Unknown reporting lifecycle source: %', TG_ARGV[0];
  END CASE;
  IF TG_ARGV[0] = 'user_follow' AND TG_OP = 'UPDATE'
    AND (NEW.created_at AT TIME ZONE 'UTC')::date IS DISTINCT FROM old_day
    AND (NEW.created_at AT TIME ZONE 'UTC')::date < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date THEN
    INSERT INTO reporting_source_changes(source_type, source_day)
      VALUES ('user_follow', (NEW.created_at AT TIME ZONE 'UTC')::date);
  END IF;
  IF old_day IS NULL OR old_day >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date THEN RETURN NULL; END IF;
  INSERT INTO reporting_source_changes(source_type, source_day) VALUES (source_kind, old_day);
  RETURN NULL;
END;
$$;
COMMENT ON FUNCTION record_vanished_reporting_day() IS 'Atomically preserves only the anonymous old UTC day needed after source loss; existing reconciliation reads event UUID ranges, not current-state history.';

CREATE INDEX idx_moderator_workload_daily_totals__day_id
  ON moderator_workload_daily_totals(day, id);
COMMENT ON INDEX idx_moderator_workload_daily_totals__day_id IS 'Ordered bounded retirement of reporting cohorts outside the existing workload history window.';
COMMENT ON INDEX idx_growth_metrics_daily_post_authors__author_user_id IS 'Live-author FK cleanup finds completed-day memberships without scanning all authors.';
COMMENT ON INDEX idx_moderator_workload_daily_totals__community_id_day IS 'Community FK cleanup and scoped completed-day workload reads share this community-leading path.';
COMMENT ON INDEX idx_moderator_workload_daily_totals__actor_user_id IS 'Live-actor FK cleanup finds workload cohorts across their retained days.';
