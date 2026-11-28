CREATE TYPE reporting_rollup_kinds AS ENUM ('growth', 'moderator_workload');
COMMENT ON TYPE reporting_rollup_kinds IS 'Reporting projections completed by the ordered daily rollup worker.';

CREATE TABLE growth_metric_daily_totals (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  day DATE NOT NULL UNIQUE,
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
COMMENT ON TABLE growth_metric_daily_totals IS 'Anonymous current-eligibility daily reporting totals, retained for the all-range growth report and replaced when that source day changes.';
COMMENT ON COLUMN growth_metric_daily_totals.id IS 'Stable identity of this completed-day reporting total.';
COMMENT ON COLUMN growth_metric_daily_totals.created_at IS 'UUIDv7-derived creation time of this reporting total.';
COMMENT ON COLUMN growth_metric_daily_totals.day IS 'UTC creation day of the counted source rows.';
COMMENT ON COLUMN growth_metric_daily_totals.user_count IS 'Non-deleted users created on this day.';
COMMENT ON COLUMN growth_metric_daily_totals.post_count IS 'Non-deleted posts created on this day, including types outside the displayed breakdown.';
COMMENT ON COLUMN growth_metric_daily_totals.review_count IS 'Non-deleted review posts created on this day.';
COMMENT ON COLUMN growth_metric_daily_totals.data_point_count IS 'Non-deleted data-point posts created on this day.';
COMMENT ON COLUMN growth_metric_daily_totals.discussion_count IS 'Non-deleted discussion posts created on this day.';
COMMENT ON COLUMN growth_metric_daily_totals.comment_count IS 'Non-deleted comments created on this day.';
COMMENT ON COLUMN growth_metric_daily_totals.story_count IS 'Non-deleted story posts created on this day.';
COMMENT ON COLUMN growth_metric_daily_totals.approved_count IS 'Non-deleted posts from this day whose approval timestamp is present.';
COMMENT ON COLUMN growth_metric_daily_totals.reviewed_count IS 'Non-deleted posts from this day with an approval or rejection timestamp.';
COMMENT ON COLUMN growth_metric_daily_totals.follow_count IS 'Active user follows whose current creation timestamp belongs to this day.';
COMMENT ON COLUMN growth_metric_daily_totals.vote_count IS 'Qualifying post ballots from this day still present in the raw vote source.';
COMMENT ON COLUMN growth_metric_daily_totals.retained_vote_count IS 'Anonymous qualifying ballot events already retained by the existing ballot cleanup tally.';

CREATE TABLE growth_metric_daily_post_authors (
  growth_metric_daily_total_id UUID NOT NULL REFERENCES growth_metric_daily_totals(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (growth_metric_daily_total_id, author_user_id)
);
CREATE INDEX idx_growth_metric_daily_post_authors__author_user_id
  ON growth_metric_daily_post_authors(author_user_id, growth_metric_daily_total_id);
COMMENT ON TABLE growth_metric_daily_post_authors IS 'Exact distinct-author membership for eligible posts on a completed day; recomputation removes memberships without eligible source posts and user purge cascades.';
COMMENT ON COLUMN growth_metric_daily_post_authors.growth_metric_daily_total_id IS 'Daily total cohort containing this eligible author membership.';
COMMENT ON COLUMN growth_metric_daily_post_authors.author_user_id IS 'Live post author, including the existing deleted-account identity when source posts are reassigned.';

CREATE TABLE moderator_workload_daily_totals (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  day DATE NOT NULL,
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type moderator_action_types NOT NULL,
  count BIGINT NOT NULL CHECK (count > 0),
  CONSTRAINT moderator_workload_daily_totals_cohort
    UNIQUE NULLS NOT DISTINCT (day, community_id, actor_user_id, action_type)
);
CREATE INDEX idx_moderator_workload_daily_totals__community_id_day
  ON moderator_workload_daily_totals(community_id, day);
CREATE INDEX idx_moderator_workload_daily_totals__actor_user_id
  ON moderator_workload_daily_totals(actor_user_id, day);
COMMENT ON TABLE moderator_workload_daily_totals IS 'Daily moderator-action reporting cohorts; NULL-community global cohorts survive community purge, scoped cohorts cascade, and bounded cleanup retires days outside the analytics window.';
COMMENT ON COLUMN moderator_workload_daily_totals.id IS 'Identity of this daily reporting cohort.';
COMMENT ON COLUMN moderator_workload_daily_totals.created_at IS 'UUIDv7-derived creation time of this daily reporting cohort.';
COMMENT ON COLUMN moderator_workload_daily_totals.day IS 'UTC creation day of the source moderator actions.';
COMMENT ON COLUMN moderator_workload_daily_totals.community_id IS 'Live community scope, or NULL for the independent global aggregate.';
COMMENT ON COLUMN moderator_workload_daily_totals.actor_user_id IS 'Live actor required by the existing workload reader; physical user purge removes this cohort.';
COMMENT ON COLUMN moderator_workload_daily_totals.action_type IS 'Moderator action counted by this cohort; reader applies the current dashboard taxonomy.';
COMMENT ON COLUMN moderator_workload_daily_totals.count IS 'Exact source actions in this cohort, replaced by a completed-day recomputation.';

CREATE TABLE reporting_daily_rollup_cursors (
  kind reporting_rollup_kinds PRIMARY KEY,
  cursor_rollup_on DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trigger_reporting_daily_rollup_cursors_updated_at
  BEFORE UPDATE ON reporting_daily_rollup_cursors
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
COMMENT ON TABLE reporting_daily_rollup_cursors IS 'Transactional first-unmaterialized day for scheduled reporting; ordinary initialization discovers the earliest source day and every completed day writes explicit totals before advancing.';
COMMENT ON COLUMN reporting_daily_rollup_cursors.updated_at IS 'Last cursor progression time maintained by the canonical update trigger.';
COMMENT ON COLUMN reporting_daily_rollup_cursors.kind IS 'Concrete daily reporting projection whose position this row owns.';
COMMENT ON COLUMN reporting_daily_rollup_cursors.cursor_rollup_on IS 'Next UTC source day due for scheduled computation; initialization claims no historical day was completed.';

CREATE TYPE reporting_source_day_event_types AS ENUM ('user_follow', 'post_vote_deletion', 'moderator_action_deletion', 'user_deletion', 'post_deletion', 'retained_vote_change', 'post_vote_creation', 'moderator_action_creation');
COMMENT ON TYPE reporting_source_day_event_types IS 'Closed lifecycle sources whose old reporting day can vanish during a mutation.';
CREATE TABLE reporting_source_day_events (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  source_type reporting_source_day_event_types NOT NULL,
  source_on DATE NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  occurred_at TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
) PARTITION BY RANGE (id);
CREATE TRIGGER trigger_reporting_source_day_events_append_only
  BEFORE UPDATE OR DELETE ON reporting_source_day_events
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
COMMENT ON TABLE reporting_source_day_events IS 'Anonymous atomic source-day recovery events; existing entity reconciliation consumes the UUIDv7 event window and cleanupPartitions retires the monthly history.';
COMMENT ON COLUMN reporting_source_day_events.id IS 'Monotonic event cursor, not a relationship to a source row.';
COMMENT ON COLUMN reporting_source_day_events.source_type IS 'Concrete source lifecycle represented by the immutable snapshot.';
COMMENT ON COLUMN reporting_source_day_events.source_on IS 'UTC source day whose old input vanished or retained tally changed; contains no entity identity or pending-work state.';
COMMENT ON COLUMN reporting_source_day_events.created_at IS 'UUIDv7-derived creation time of this recovery event.';
COMMENT ON COLUMN reporting_source_day_events.occurred_at IS 'Source mutation occurrence time, equal to event creation because recovery events are inserted atomically with the mutation.';

CREATE FUNCTION fn_register_vanished_reporting_day() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_day date;
  source_kind reporting_source_day_event_types;
BEGIN
  CASE TG_ARGV[0]
    WHEN 'user_follow' THEN
      IF TG_OP = 'UPDATE' AND OLD.created_at IS NOT DISTINCT FROM NEW.created_at
        AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at THEN RETURN NULL; END IF;
      old_day := (CASE WHEN TG_OP = 'INSERT' THEN NEW.created_at ELSE OLD.created_at END AT TIME ZONE 'UTC')::date;
      source_kind := 'user_follow';
    WHEN 'retained_vote_change' THEN
      old_day := CASE WHEN TG_OP = 'DELETE' THEN OLD.day ELSE NEW.day END;
      source_kind := 'retained_vote_change';
    ELSE RAISE EXCEPTION 'Unknown reporting lifecycle source: %', TG_ARGV[0];
  END CASE;
  IF TG_ARGV[0] = 'user_follow' AND TG_OP = 'UPDATE'
    AND (NEW.created_at AT TIME ZONE 'UTC')::date IS DISTINCT FROM old_day
    AND (NEW.created_at AT TIME ZONE 'UTC')::date < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date THEN
    INSERT INTO reporting_source_day_events(source_type, source_on)
      VALUES ('user_follow', (NEW.created_at AT TIME ZONE 'UTC')::date);
  END IF;
  IF old_day IS NULL OR old_day >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date THEN RETURN NULL; END IF;
  INSERT INTO reporting_source_day_events(source_type, source_on) VALUES (source_kind, old_day);
  RETURN NULL;
END;
$$;
COMMENT ON FUNCTION fn_register_vanished_reporting_day() IS 'Preserves affected completed days for follow lifecycle changes and retained ballot tally mutations in their source transaction.';

CREATE FUNCTION fn_register_reporting_statement_days() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO reporting_source_day_events(source_type, source_on)
    SELECT DISTINCT TG_ARGV[0]::reporting_source_day_event_types, source_on
    FROM (
      SELECT (uuid_extract_timestamp(id) AT TIME ZONE 'UTC')::date AS source_on
      FROM reporting_rows
    ) affected
    WHERE source_on < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
  RETURN NULL;
END;
$$;
COMMENT ON FUNCTION fn_register_reporting_statement_days() IS 'Coalesces a source statement transition table into one immutable recovery event per completed UTC source day, including all affected partitions when the parent is targeted.';

CREATE INDEX idx_moderator_workload_daily_totals__day_id
  ON moderator_workload_daily_totals(day, id);
COMMENT ON INDEX idx_moderator_workload_daily_totals__day_id IS 'Ordered bounded retirement of reporting cohorts outside the existing workload history window.';
COMMENT ON INDEX idx_growth_metric_daily_post_authors__author_user_id IS 'Live-author FK cleanup finds completed-day memberships without scanning all authors.';
COMMENT ON INDEX idx_moderator_workload_daily_totals__community_id_day IS 'Community FK cleanup and scoped completed-day workload reads share this community-leading path.';
COMMENT ON INDEX idx_moderator_workload_daily_totals__actor_user_id IS 'Live-actor FK cleanup finds workload cohorts across their retained days.';
