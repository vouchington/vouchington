-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Merged from: 0225-00-00-vote-integrity.sql

-- ==========================================================================
-- 0225-00-00-vote-integrity.sql
-- ============================================================================

-- Vote integrity: user agent tracking, integrity flag moderation queue,
-- and vote weight penalties for detected voting rings.

-- ============================================================================
-- ENUMs
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE vote_integrity_flag_types AS ENUM ('velocity_spike', 'ip_correlation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vote_integrity_resolutions AS ENUM ('dismissed', 'penalized', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- User Agent Strings
-- ============================================================================

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS user_agent_strings (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  user_agent TEXT NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT uq_user_agent_strings__user_agent UNIQUE (user_agent),
  CHECK (TRIM(user_agent) = user_agent),
  CHECK (LENGTH(user_agent) <= 1024)
);

COMMENT ON TABLE user_agent_strings IS 'Deduplicated lookup table for browser user-agent strings shared by sessions and votes; rows referenced by neither are removed by bounded cleanup. Empty string represents an unknown session user agent.';
COMMENT ON COLUMN user_agent_strings.user_agent IS 'The full user agent string, unique and trimmed.';

-- A candidate is created with each lookup row and recreated when a session or retention-deleted ballot
-- stops referencing it. The cleanup retires candidates that still have references; later release requeues them.
CREATE TABLE IF NOT EXISTS user_agent_string_cleanup_candidates (
  user_agent_string_id UUID PRIMARY KEY REFERENCES user_agent_strings ON DELETE CASCADE
);
COMMENT ON TABLE user_agent_string_cleanup_candidates IS 'Indexed bounded orphan checks for new user-agent strings and strings released by sessions or deleted ballots.';
COMMENT ON COLUMN user_agent_string_cleanup_candidates.user_agent_string_id IS 'User-agent lookup row awaiting an orphan check; removed after a completed check.';

CREATE OR REPLACE FUNCTION fn_register_new_user_agent_string_cleanup_candidate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_agent_string_cleanup_candidates (user_agent_string_id)
  VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION fn_register_released_user_agent_string_cleanup_candidate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.user_agent_string_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.user_agent_string_id IS NOT DISTINCT FROM NEW.user_agent_string_id THEN
      RETURN NULL;
    END IF;
  END IF;
  -- Keep the parent locked through the releasing transaction even if the candidate already
  -- exists. Cleanup must not consume that candidate while this release is uncommitted.
  PERFORM 1 FROM user_agent_strings
  WHERE id = OLD.user_agent_string_id FOR KEY SHARE;
  INSERT INTO user_agent_string_cleanup_candidates (user_agent_string_id)
  VALUES (OLD.user_agent_string_id) ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER trigger_user_agent_strings_queue_cleanup_candidate
  AFTER INSERT ON user_agent_strings FOR EACH ROW
  EXECUTE FUNCTION fn_register_new_user_agent_string_cleanup_candidate();

-- Each ballot family records the newest aged superseding event it has inspected.
DO $$ BEGIN
  CREATE TYPE vote_ballot_cleanup_families AS ENUM (
    'post_votes', 'topic_votes', 'hostname_votes', 'rss_feed_item_votes',
    'agent_moderation_votes', 'user_vouch_votes',
    'relation__user__category__topic__votes',
    'relation__post__category__topic__votes',
    'relation__post__category__topic_alias__votes',
    'relation__post__related__post__votes',
    'relation__post__related__url__votes',
    'relation__topic__related__topic__votes',
    'relation__topic__category__topic__votes',
    'relation__topic__publisher_type__topic__votes',
    'relation__topic__faq__post__votes',
    'relation__topic__related__post__votes',
    'relation__topic__related__url__votes',
    'relation__topic__faq__url__votes',
    'relation__topic__guide__url__votes',
    'relation__topic__landing_page__url__votes',
    'relation__topic__terms_of_service__url__votes',
    'relation__rss_feed_item__category__topic__votes',
    'relation__rss_feed_item__category__topic_alias__votes'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMENT ON TYPE vote_ballot_cleanup_families IS 'Fixed ballot families eligible for one independent retention cursor each.';

CREATE TABLE IF NOT EXISTS vote_ballot_cleanup_cursors (
  family vote_ballot_cleanup_families PRIMARY KEY,
  cursor_vote_id UUID,
  sweep_cutoff_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trigger_vote_ballot_cleanup_cursors_updated_at
  BEFORE UPDATE ON vote_ballot_cleanup_cursors FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
COMMENT ON TABLE vote_ballot_cleanup_cursors IS 'One monotonic aged-superseder frontier and frozen sweep end per ballot table.';
COMMENT ON COLUMN vote_ballot_cleanup_cursors.family IS 'Concrete ballot family selected by the cleanup worker.';
COMMENT ON COLUMN vote_ballot_cleanup_cursors.cursor_vote_id IS 'Last fully processed superseding ballot ID; not a durable relationship to a ballot.';
COMMENT ON COLUMN vote_ballot_cleanup_cursors.sweep_cutoff_id IS 'Frozen exclusive UUIDv7 upper bound for the current sweep.';
COMMENT ON COLUMN vote_ballot_cleanup_cursors.updated_at IS 'Last committed ballot sweep progress.';

CREATE TABLE IF NOT EXISTS post_vote_retained_daily_counts (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  day DATE NOT NULL UNIQUE,
  count BIGINT NOT NULL CHECK (count >= 0),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);
COMMENT ON TABLE post_vote_retained_daily_counts IS 'Anonymous daily count of post vote events removed by ballot retention, preserving historical engagement metrics.';
COMMENT ON COLUMN post_vote_retained_daily_counts.id IS 'Identity of this anonymous daily aggregate row.';
COMMENT ON COLUMN post_vote_retained_daily_counts.day IS 'UTC day of the removed ballot event.';
COMMENT ON COLUMN post_vote_retained_daily_counts.count IS 'Number of qualifying removed post vote events on this day.';
COMMENT ON COLUMN post_vote_retained_daily_counts.created_at IS 'When this aggregate row was created, derived from its UUIDv7 ID.';

-- ============================================================================
-- Vote Integrity Flags
-- ============================================================================

-- Moderation review queue for suspicious voting patterns.
-- Exactly one entity FK is set per row (enforced by CHECK constraint).
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS vote_integrity_flags (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  post_id UUID REFERENCES posts ON DELETE CASCADE,
  topic_id UUID REFERENCES topics ON DELETE CASCADE,
  hostname_id UUID REFERENCES url_hostnames ON DELETE CASCADE,
  rss_feed_item_id UUID REFERENCES rss_feed_items ON DELETE CASCADE,
  agent_moderation_post_id UUID,
  agent_moderation_id UUID,
  relation__user__category__topic_id UUID,
  relation__user__category__topic_subject_id UUID,
  relation__post__category__topic_id UUID,
  relation__post__category__topic_subject_id UUID,
  relation__post__category__topic_alias_id UUID,
  relation__post__category__topic_alias_subject_id UUID,
  relation__post__related__post_id UUID,
  relation__post__related__post_subject_id UUID,
  relation__post__related__url_id UUID,
  relation__post__related__url_subject_id UUID,
  relation__topic__related__topic_id UUID,
  relation__topic__related__topic_subject_id UUID,
  relation__topic__category__topic_id UUID,
  relation__topic__category__topic_subject_id UUID,
  relation__topic__publisher_type__topic_id UUID,
  relation__topic__publisher_type__topic_subject_id UUID,
  relation__topic__faq__post_id UUID,
  relation__topic__faq__post_subject_id UUID,
  relation__topic__related__post_id UUID,
  relation__topic__related__post_subject_id UUID,
  relation__topic__related__url_id UUID,
  relation__topic__related__url_subject_id UUID,
  relation__topic__faq__url_id UUID,
  relation__topic__faq__url_subject_id UUID,
  relation__topic__guide__url_id UUID,
  relation__topic__guide__url_subject_id UUID,
  relation__topic__landing_page__url_id UUID,
  relation__topic__landing_page__url_subject_id UUID,
  relation__topic__terms_of_service__url_id UUID,
  relation__topic__terms_of_service__url_subject_id UUID,
  relation__rss_feed_item__category__topic_id UUID,
  relation__rss_feed_item__category__topic_subject_id UUID,
  relation__rss_feed_item__category__topic_alias_id UUID,
  relation__rss_feed_item__category__topic_alias_subject_id UUID,
  flag_type vote_integrity_flag_types NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  resolved_at TIMESTAMPTZ,
  resolved_by_id UUID REFERENCES users ON DELETE SET NULL,
  resolution vote_integrity_resolutions,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vote_integrit_flags__agent_moderation_post__agent_moderation FOREIGN KEY (agent_moderation_post_id, agent_moderation_id)
    REFERENCES agent_moderations (post_id, id) ON DELETE CASCADE,
  CHECK ((agent_moderation_post_id IS NULL) = (agent_moderation_id IS NULL))
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_vote_integrity_flags_updated_at
  BEFORE UPDATE ON vote_integrity_flags FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_vote_integrity_flags__pending
  ON vote_integrity_flags (id)
  WHERE resolved_at IS NULL;

-- Per-entity partial unique indexes for deduplication (used by createVoteIntegrityFlag WHERE NOT EXISTS)
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_integrity_flags__post_flag_pending
  ON vote_integrity_flags (post_id, flag_type)
  WHERE resolved_at IS NULL AND post_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_integrity_flags__topic_flag_pending
  ON vote_integrity_flags (topic_id, flag_type)
  WHERE resolved_at IS NULL AND topic_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_integrity_flags__hostname_flag_pending
  ON vote_integrity_flags (hostname_id, flag_type)
  WHERE resolved_at IS NULL AND hostname_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_integrity_flags__rss_feed_item_flag_pending
  ON vote_integrity_flags (rss_feed_item_id, flag_type)
  WHERE resolved_at IS NULL AND rss_feed_item_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_integrity_flags__agent_moderator_flag_pending
  ON vote_integrity_flags (agent_moderation_id, flag_type)
  WHERE resolved_at IS NULL AND agent_moderation_id IS NOT NULL;

-- Per-entity lookup indexes
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_vote_integrity_flags__post_id
  ON vote_integrity_flags (post_id) WHERE post_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_vote_integrity_flags__topic_id
  ON vote_integrity_flags (topic_id) WHERE topic_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_vote_integrity_flags__hostname_id
  ON vote_integrity_flags (hostname_id) WHERE hostname_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_vote_integrity_flags__rss_feed_item_id
  ON vote_integrity_flags (rss_feed_item_id) WHERE rss_feed_item_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_vote_integrity_flags__agent_moderation_id
  ON vote_integrity_flags (agent_moderation_id) WHERE agent_moderation_id IS NOT NULL;

COMMENT ON TABLE vote_integrity_flags IS 'Moderation review queue for suspicious voting patterns. Exactly one entity FK is set per row.';
COMMENT ON COLUMN vote_integrity_flags.post_id IS 'Flagged post, if this flag targets a post.';
COMMENT ON COLUMN vote_integrity_flags.topic_id IS 'Flagged topic, if this flag targets a topic.';
COMMENT ON COLUMN vote_integrity_flags.hostname_id IS 'Flagged hostname, if this flag targets a URL hostname.';
COMMENT ON COLUMN vote_integrity_flags.rss_feed_item_id IS 'Flagged RSS feed item, if this flag targets an RSS item.';
COMMENT ON COLUMN vote_integrity_flags.agent_moderation_post_id IS 'Partition key for the flagged agent moderation.';
COMMENT ON COLUMN vote_integrity_flags.agent_moderation_id IS 'Flagged agent moderation, if this flag targets a moderation decision.';
COMMENT ON COLUMN vote_integrity_flags.flag_type IS 'Type of integrity violation detected: velocity_spike or ip_correlation.';
COMMENT ON COLUMN vote_integrity_flags.details IS 'JSON details about the detected anomaly.';
COMMENT ON COLUMN vote_integrity_flags.resolved_at IS 'When a moderator resolved this flag.';
COMMENT ON COLUMN vote_integrity_flags.resolved_by_id IS 'Moderator who resolved this flag.';
COMMENT ON COLUMN vote_integrity_flags.resolution IS 'Outcome: dismissed, penalized, or suspended.';

-- The flag itself remains for moderation; only identifying detail is time-limited.
CREATE INDEX IF NOT EXISTS idx_vote_integrity_flags__identifying_details__id
  ON vote_integrity_flags (id)
  WHERE details ?| ARRAY['correlated_ips', 'ip_address', 'ipAddress', 'device_id', 'deviceId',
                         'session_id', 'sessionId', 'user_agent', 'userAgent', 'user_agent_string_id'];

CREATE TABLE IF NOT EXISTS vote_integrity_flag_detail_cleanup_cursors (
  is_singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (is_singleton),
  cursor_flag_id UUID,
  sweep_cutoff_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trigger_vote_integrity_flag_detail_cleanup_cursors_updated_at
  BEFORE UPDATE ON vote_integrity_flag_detail_cleanup_cursors
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
COMMENT ON TABLE vote_integrity_flag_detail_cleanup_cursors IS 'Bounded cyclic UUIDv7 sweep that strips aged identifying details while retaining moderation flags.';
COMMENT ON COLUMN vote_integrity_flag_detail_cleanup_cursors.is_singleton IS 'Checked singleton key serializes the sweep.';
COMMENT ON COLUMN vote_integrity_flag_detail_cleanup_cursors.cursor_flag_id IS 'Last examined flag ID; not a relationship to the flag.';
COMMENT ON COLUMN vote_integrity_flag_detail_cleanup_cursors.sweep_cutoff_id IS 'Frozen exclusive UUIDv7 upper bound for the current sweep.';
COMMENT ON COLUMN vote_integrity_flag_detail_cleanup_cursors.updated_at IS 'Last committed flag-detail sweep progress.';

-- ============================================================================
-- Vote Weight Penalties
-- ============================================================================

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS vote_weight_penalties (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  penalty_multiplier DOUBLE PRECISION NOT NULL CHECK (penalty_multiplier > 0 AND penalty_multiplier <= 1),
  reason TEXT NOT NULL,
  source_flag_id UUID REFERENCES vote_integrity_flags ON DELETE SET NULL,
  source_hostname_id UUID REFERENCES url_hostnames ON DELETE SET NULL,
  source_hostname_block_id UUID,
  source_post_id UUID REFERENCES posts ON DELETE SET NULL,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by_id UUID REFERENCES users ON DELETE SET NULL,
  reviewed_at timestamptz,
  reviewed_by_id uuid REFERENCES users ON DELETE SET NULL,
  review_due_at timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '12 months'),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_vote_weight_penalties_updated_at
  BEFORE UPDATE ON vote_weight_penalties FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_vote_weight_penalties__active
  ON vote_weight_penalties (user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vote_weight_penalties__review_due
  ON vote_weight_penalties (review_due_at, id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vote_weight_penalties__reviewed_by_id
  ON vote_weight_penalties (reviewed_by_id)
  WHERE reviewed_by_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_weight_penalties__user_flag_unique
  ON vote_weight_penalties (user_id, source_flag_id)
  WHERE source_flag_id IS NOT NULL AND revoked_at IS NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_vote_weight_penalties__flag
  ON vote_weight_penalties (source_flag_id)
  WHERE source_flag_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_weight_penalties__user_hostname_unique
  ON vote_weight_penalties (user_id, source_hostname_id)
  WHERE source_hostname_id IS NOT NULL AND revoked_at IS NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_vote_weight_penalties__hostname
  ON vote_weight_penalties (source_hostname_id)
  WHERE source_hostname_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_weight_penalties__user_post_unique
  ON vote_weight_penalties (user_id, source_post_id)
  WHERE source_post_id IS NOT NULL AND revoked_at IS NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_vote_weight_penalties__post
  ON vote_weight_penalties (source_post_id)
  WHERE source_post_id IS NOT NULL;

COMMENT ON TABLE vote_weight_penalties IS 'Penalties applied to users'' vote weights. Revoked rows are deleted after 180 days; active rows remain subject to annual staff review.';
COMMENT ON COLUMN vote_weight_penalties.user_id IS 'The penalized user.';
COMMENT ON COLUMN vote_weight_penalties.penalty_multiplier IS 'Multiplier applied to vote weight (0-1, where 1 means no penalty).';
COMMENT ON COLUMN vote_weight_penalties.reason IS 'Human-readable explanation of why the penalty was applied.';
COMMENT ON COLUMN vote_weight_penalties.source_flag_id IS 'The integrity flag that triggered this penalty, if auto-generated.';
COMMENT ON COLUMN vote_weight_penalties.source_hostname_id IS 'The blocked hostname whose active penalty identity prevents stacking across unblock and reblock operations. NULL for stacking attempt penalties.';
COMMENT ON COLUMN vote_weight_penalties.source_hostname_block_id IS 'The exact hostname block event whose bounded relation cleanup first created this penalty fact.';
COMMENT ON COLUMN vote_weight_penalties.source_post_id IS 'The post that triggered this penalty (for referral_link_in_post penalties). NULL for other penalty types.';
COMMENT ON COLUMN vote_weight_penalties.created_by_id IS 'User who created the penalty, or NULL after that account is purged.';
COMMENT ON COLUMN vote_weight_penalties.revoked_at IS 'When the penalty was revoked.';
COMMENT ON COLUMN vote_weight_penalties.revoked_by_id IS 'Moderator who revoked the penalty.';
COMMENT ON COLUMN vote_weight_penalties.reviewed_at IS 'Most recent staff confirmation that an active penalty remains warranted.';
COMMENT ON COLUMN vote_weight_penalties.reviewed_by_id IS 'Staff member who last reviewed the active penalty.';
COMMENT ON COLUMN vote_weight_penalties.review_due_at IS 'Next annual review deadline while this penalty remains active.';

-- Current indexes for fresh schema bootstrap.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_vote_integrity_flags__agent_moderation_post_id
  ON vote_integrity_flags (agent_moderation_post_id)
  WHERE agent_moderation_post_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_vote_weight_penalties__created_by_id
  ON vote_weight_penalties (created_by_id)
  WHERE created_by_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_vote_weight_penalties__user_id
  ON vote_weight_penalties (user_id)
  WHERE user_id IS NOT NULL;
