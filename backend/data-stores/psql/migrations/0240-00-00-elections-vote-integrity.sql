-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
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
-- Vote User Agents
-- ============================================================================

CREATE TABLE IF NOT EXISTS vote_user_agents (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  user_agent TEXT NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_vote_user_agents__user_agent UNIQUE (user_agent),
  CHECK (TRIM(user_agent) = user_agent),
  CHECK (LENGTH(user_agent) <= 1024)
);

CREATE OR REPLACE TRIGGER trigger_vote_user_agents_updated_at
  BEFORE UPDATE ON vote_user_agents FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE vote_user_agents IS 'Deduplicated lookup table for browser user agent strings associated with votes.';
COMMENT ON COLUMN vote_user_agents.user_agent IS 'The full user agent string, unique and trimmed.';

-- ============================================================================
-- Vote Integrity Flags
-- ============================================================================

-- Moderation review queue for suspicious voting patterns.
-- Exactly one entity FK is set per row (enforced by CHECK constraint).
CREATE TABLE IF NOT EXISTS vote_integrity_flags (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  post_id UUID REFERENCES posts ON DELETE CASCADE,
  topic_id UUID REFERENCES topics ON DELETE CASCADE,
  hostname_id UUID REFERENCES url_hostnames ON DELETE CASCADE,
  rss_feed_item_id UUID REFERENCES rss_feed_items ON DELETE CASCADE,
  agent_moderation_post_id UUID,
  agent_moderation_id UUID,
  flag_type vote_integrity_flag_types NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  resolved_at TIMESTAMPTZ,
  resolved_by_id UUID REFERENCES users ON DELETE SET NULL,
  resolution vote_integrity_resolutions,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_moderation_post_id, agent_moderation_id)
    REFERENCES agent_moderations (post_id, id) ON DELETE CASCADE,
  CHECK ((agent_moderation_post_id IS NULL) = (agent_moderation_id IS NULL))
);

CREATE OR REPLACE TRIGGER trigger_vote_integrity_flags_updated_at
  BEFORE UPDATE ON vote_integrity_flags FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_vote_integrity_flags__pending
  ON vote_integrity_flags (id)
  WHERE resolved_at IS NULL;

-- Per-entity partial unique indexes for deduplication (used by createVoteIntegrityFlag WHERE NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vif__post_flag_pending
  ON vote_integrity_flags (post_id, flag_type)
  WHERE resolved_at IS NULL AND post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vif__topic_flag_pending
  ON vote_integrity_flags (topic_id, flag_type)
  WHERE resolved_at IS NULL AND topic_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vif__hostname_flag_pending
  ON vote_integrity_flags (hostname_id, flag_type)
  WHERE resolved_at IS NULL AND hostname_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vif__rss_feed_item_flag_pending
  ON vote_integrity_flags (rss_feed_item_id, flag_type)
  WHERE resolved_at IS NULL AND rss_feed_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vif__agent_mod_flag_pending
  ON vote_integrity_flags (agent_moderation_id, flag_type)
  WHERE resolved_at IS NULL AND agent_moderation_id IS NOT NULL;

-- Per-entity lookup indexes
CREATE INDEX IF NOT EXISTS idx_vif__post_id
  ON vote_integrity_flags (post_id) WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vif__topic_id
  ON vote_integrity_flags (topic_id) WHERE topic_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vif__hostname_id
  ON vote_integrity_flags (hostname_id) WHERE hostname_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vif__rss_feed_item_id
  ON vote_integrity_flags (rss_feed_item_id) WHERE rss_feed_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vif__agent_moderation_id
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

-- ============================================================================
-- Vote Weight Penalties
-- ============================================================================

CREATE TABLE IF NOT EXISTS vote_weight_penalties (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  penalty_multiplier DOUBLE PRECISION NOT NULL CHECK (penalty_multiplier > 0 AND penalty_multiplier <= 1),
  reason TEXT NOT NULL,
  source_flag_id UUID REFERENCES vote_integrity_flags ON DELETE SET NULL,
  source_hostname_id UUID REFERENCES url_hostnames ON DELETE SET NULL,
  source_post_id UUID REFERENCES posts ON DELETE SET NULL,
  created_by_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  revoked_at TIMESTAMPTZ,
  revoked_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_vote_weight_penalties_updated_at
  BEFORE UPDATE ON vote_weight_penalties FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_vote_weight_penalties__active
  ON vote_weight_penalties (user_id)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_weight_penalties__user_flag_uniq
  ON vote_weight_penalties (user_id, source_flag_id)
  WHERE source_flag_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vote_weight_penalties__flag
  ON vote_weight_penalties (source_flag_id)
  WHERE source_flag_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_weight_penalties__user_hostname_uniq
  ON vote_weight_penalties (user_id, source_hostname_id)
  WHERE source_hostname_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vote_weight_penalties__hostname
  ON vote_weight_penalties (source_hostname_id)
  WHERE source_hostname_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_weight_penalties__user_post_uniq
  ON vote_weight_penalties (user_id, source_post_id)
  WHERE source_post_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vote_weight_penalties__post
  ON vote_weight_penalties (source_post_id)
  WHERE source_post_id IS NOT NULL;

COMMENT ON TABLE vote_weight_penalties IS 'Penalties applied to users'' vote weights as a result of detected voting rings or manual moderation.';
COMMENT ON COLUMN vote_weight_penalties.user_id IS 'The penalized user.';
COMMENT ON COLUMN vote_weight_penalties.penalty_multiplier IS 'Multiplier applied to vote weight (0-1, where 1 means no penalty).';
COMMENT ON COLUMN vote_weight_penalties.reason IS 'Human-readable explanation of why the penalty was applied.';
COMMENT ON COLUMN vote_weight_penalties.source_flag_id IS 'The integrity flag that triggered this penalty, if auto-generated.';
COMMENT ON COLUMN vote_weight_penalties.source_hostname_id IS 'The blocked hostname that triggered this penalty (for initial block penalties). NULL for stacking attempt penalties.';
COMMENT ON COLUMN vote_weight_penalties.source_post_id IS 'The post that triggered this penalty (for referral_link_in_post penalties). NULL for other penalty types.';
COMMENT ON COLUMN vote_weight_penalties.revoked_at IS 'When the penalty was revoked.';
COMMENT ON COLUMN vote_weight_penalties.revoked_by_id IS 'Moderator who revoked the penalty.';
