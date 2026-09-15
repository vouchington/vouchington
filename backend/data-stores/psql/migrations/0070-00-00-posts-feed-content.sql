-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: added language detection columns (declared_language, lingua_rs_detected_language, detection sha/results)
-- edited-in-place: added is_baseline column to agents__moderators
-- edited-in-place: added link post type with url_id column
-- edited-in-place: folded idx_agent_moderations__flagged_prompt from 0430-00-00-automod-simulation-indexes
-- edited-in-place: migrated agent_models enum from gpt-5-nano/gpt-4o to gpt-5.4-nano (deprecation, see docs/overview/architecture/openai-cost-model.md)
-- edited-in-place: swapped 'english' to 'voucha_english' text search config (unaccent support)
-- edited-in-place: removed no-op stat_posts__root_parent_deleted extended statistics (measured; kept per-column ANALYZE)
-- Merged from: 0010-00-00-posts.sql, 0270-00-00-post-data-point-topics.sql

-- ==========================================================================
-- 0010-00-00-posts.sql
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE post_types AS ENUM (
  'discussion',
  'review',
  'data_point',
  'topic_recommendation',
  'comment',
  'story',
  'link',
  'article',
  'blog_post'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS posts (
  id UUID NOT NULL DEFAULT uuidv7(),
  post_type post_types NOT NULL,

  title TEXT NOT NULL DEFAULT '',
  CHECK (char_length(title) <= 255),
  CHECK (title = TRIM(title)),
  markdown TEXT NOT NULL DEFAULT '',
  ai_summary_markdown TEXT NOT NULL DEFAULT '',
  -- posts need some content
  CHECK ((title IS NOT NULL AND title <> '') OR (markdown IS NOT NULL AND markdown <> '') OR (ai_summary_markdown IS NOT NULL AND ai_summary_markdown <> '')),

  parent_id UUID REFERENCES posts ON DELETE CASCADE,
  CHECK (parent_id != id), -- a post cannot be its own parent
  CHECK (NOT (post_type = 'comment' AND parent_id IS NULL)), -- a comment must have a parent. In the future, a post could have a parent so we don't add a CHECK for that.
  CHECK (parent_id IS NULL OR id > parent_id), -- UUIDv7 partition pruning: child posts created after parent

  root_id UUID REFERENCES posts ON DELETE CASCADE, -- the root post in a comment thread
  CHECK (root_id != id), -- a post cannot be its own root
  CHECK (root_id IS NULL OR id > root_id), -- UUIDv7 partition pruning: descendants created after root

  broadcast broadcast_types NOT NULL DEFAULT 'everyone',
  privacy privacy_types NOT NULL DEFAULT 'public',
  CHECK (NOT (broadcast = 'everyone' AND privacy = 'private')),
  CHECK (post_type != 'comment' OR (broadcast = 'everyone' AND privacy = 'public')),
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,

  community_id UUID, -- community scope for comments; NULL = global. FK added in 0200-00-00-communities.sql

  votes_snapshot_xmax XID8,
  votes_snapshot_xip_count INTEGER,
  CONSTRAINT chk_posts_votes_snapshot_complete CHECK (
    (votes_snapshot_xmax IS NULL AND votes_snapshot_xip_count IS NULL)
    OR (votes_snapshot_xmax IS NOT NULL AND votes_snapshot_xip_count IS NOT NULL AND votes_snapshot_xip_count >= 0)
  ),

  -- post clearance (FK to post_clearance_changes added in 0270)
  latest_clearance_change_id UUID,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  in_review_at TIMESTAMPTZ,

  created_by_id UUID REFERENCES users ON DELETE CASCADE, -- not required in case of deletion
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID REFERENCES users ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,

  -- archive
  archived_at TIMESTAMPTZ,
  archived_by_id UUID REFERENCES users ON DELETE SET NULL,

  -- structured data (data point posts)
  data_point_vertical TEXT,
  structured_data JSONB,
  CONSTRAINT chk_structured_data_post_type CHECK (structured_data IS NULL OR post_type = 'data_point'),
  CONSTRAINT chk_data_point_vertical_consistency CHECK ((data_point_vertical IS NULL) = (structured_data IS NULL)),

  -- link post: single external URL (FK to urls created in 0050; ON DELETE RESTRICT because the
  -- biconditional CHECK below forbids a NULL url_id on link posts, so SET NULL would violate it)
  url_id UUID REFERENCES urls ON DELETE RESTRICT,
  -- biconditional: exactly link posts have a url_id and only link posts have one
  CONSTRAINT posts_link_url_id CHECK ((post_type = 'link') = (url_id IS NOT NULL)),

  -- story post constraints
  CONSTRAINT posts_story_no_markdown CHECK (post_type != 'story' OR markdown = ''),

  -- language
  declared_language TEXT CHECK (declared_language IS NULL OR (declared_language = LOWER(declared_language) AND LENGTH(declared_language) <= 10)),
  lingua_rs_detected_language TEXT CHECK (lingua_rs_detected_language IS NULL OR (lingua_rs_detected_language = LOWER(lingua_rs_detected_language) AND LENGTH(lingua_rs_detected_language) <= 10)),
  lingua_rs_content_sha256 BYTEA CHECK (lingua_rs_content_sha256 IS NULL OR LENGTH(lingua_rs_content_sha256) = 32),
  lingua_rs_input_sha256 BYTEA CHECK (lingua_rs_input_sha256 IS NULL OR LENGTH(lingua_rs_input_sha256) = 32),
  lingua_rs_results JSONB,
  lingua_rs_detected_at TIMESTAMPTZ,

  -- bedrock nova multimodal v1 embedding
  bedrock_nova_multimodal_v1_content_sha256 BYTEA NOT NULL,
  CHECK (OCTET_LENGTH(bedrock_nova_multimodal_v1_content_sha256) = 32),
  bedrock_nova_multimodal_v1_input_sha256 BYTEA,
  CHECK (bedrock_nova_multimodal_v1_input_sha256 IS NULL OR OCTET_LENGTH(bedrock_nova_multimodal_v1_input_sha256) = 32),
  bedrock_nova_multimodal_v1_embedding VECTOR(1024),
  bedrock_nova_multimodal_v1_embedding_created_at TIMESTAMPTZ,
  bedrock_nova_multimodal_v1_input_token_count INT,
  CHECK (bedrock_nova_multimodal_v1_input_token_count IS NULL OR bedrock_nova_multimodal_v1_input_token_count >= 0),
  ban_evasion_post_embedding_input_sha256 BYTEA,
  CHECK (ban_evasion_post_embedding_input_sha256 IS NULL OR OCTET_LENGTH(ban_evasion_post_embedding_input_sha256) = 32),

  -- llm moderation results
  llm_moderation_content_sha256 BYTEA NOT NULL,
  CHECK (OCTET_LENGTH(llm_moderation_content_sha256) = 32),

  -- full text search vector; trigger-maintained by fn_sync_posts_search_vector so
  -- unrelated updates (embeddings, moderation, language detection) skip the rebuild
  search_vector TSVECTOR,

  PRIMARY KEY (id)
) PARTITION BY RANGE (id);

-- Exact hashtag occurrences are independent from the election-backed category
-- relation so display casing is preserved without duplicating category votes.
CREATE TABLE IF NOT EXISTS post_topic_alias_sources (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  post_id UUID NOT NULL REFERENCES posts ON DELETE CASCADE,
  topic_alias_id UUID NOT NULL REFERENCES topic_aliases ON DELETE RESTRICT,
  contributor_id UUID NOT NULL REFERENCES users ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK (source IN ('title', 'markdown', 'explicit')),
  authored_token TEXT NOT NULL,
  CHECK (char_length(authored_token) <= 255),
  CHECK (authored_token = TRIM(authored_token)),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (post_id, topic_alias_id, source)
);

CREATE OR REPLACE TRIGGER trigger_post_topic_alias_sources_updated_at
BEFORE UPDATE ON post_topic_alias_sources
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS post_topic_alias_sources__topic_alias_id
ON post_topic_alias_sources (topic_alias_id, post_id DESC);

CREATE INDEX IF NOT EXISTS post_topic_alias_sources__contributor_id
ON post_topic_alias_sources (contributor_id);

COMMENT ON TABLE post_topic_alias_sources IS 'Exact authored post hashtag tokens, keyed by canonical topic alias.';
COMMENT ON COLUMN post_topic_alias_sources.post_id IS 'The post containing this hashtag occurrence.';
COMMENT ON COLUMN post_topic_alias_sources.topic_alias_id IS 'The canonical hashtag alias referenced by the authored token.';
COMMENT ON COLUMN post_topic_alias_sources.contributor_id IS 'The durable author identity used for hashtag contributor aggregation when a deleted account’s posts are reassigned to the tombstone user.';
COMMENT ON COLUMN post_topic_alias_sources.source IS 'Where the hashtag was authored: title, markdown, or an explicit category.';
COMMENT ON COLUMN post_topic_alias_sources.authored_token IS 'The exact authored hashtag token, including its original casing.';

-- Explicit topic categories are authored post metadata, independent of the
-- election-backed category relation and data-point structured-topic provenance.
CREATE TABLE IF NOT EXISTS post_explicit_topic_categories (
  post_id UUID NOT NULL REFERENCES posts ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, topic_id)
) PARTITION BY RANGE (post_id);

CREATE OR REPLACE TRIGGER trigger_post_explicit_topic_categories_updated_at
BEFORE UPDATE ON post_explicit_topic_categories
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_post_explicit_topic_categories__topic_id
ON post_explicit_topic_categories (topic_id)
INCLUDE (post_id);

COMMENT ON TABLE post_explicit_topic_categories IS 'Explicit topic categories authored for a post, independent of relation votes and structured data-point topics.';
COMMENT ON COLUMN post_explicit_topic_categories.post_id IS 'The post with the explicit topic category.';
COMMENT ON COLUMN post_explicit_topic_categories.topic_id IS 'The explicitly selected topic.';

-- Recomputes search_vector only when title or markdown change, avoiding a full
-- tsvector rebuild on every unrelated post update.
CREATE OR REPLACE FUNCTION fn_sync_posts_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('voucha_english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('voucha_english', COALESCE(NEW.markdown, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_sync_posts_search_vector
BEFORE INSERT OR UPDATE OF title, markdown ON posts
FOR EACH ROW
EXECUTE FUNCTION fn_sync_posts_search_vector();

CREATE OR REPLACE TRIGGER trigger_posts_updated_at
BEFORE UPDATE OF
  post_type,
  title,
  markdown,
  ai_summary_markdown,
  parent_id,
  root_id,
  broadcast,
  privacy,
  is_anonymous,
  community_id,
  latest_clearance_change_id,
  approved_at,
  rejected_at,
  in_review_at,
  created_by_id,
  updated_by_id,
  deleted_at,
  deleted_by_id,
  archived_at,
  archived_by_id,
  data_point_vertical,
  structured_data,
  declared_language,
  bedrock_nova_multimodal_v1_input_sha256,
  bedrock_nova_multimodal_v1_embedding,
  bedrock_nova_multimodal_v1_embedding_created_at,
  bedrock_nova_multimodal_v1_input_token_count
ON posts
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- browsing latest posts (using id DESC since created_at is derived from id)
CREATE INDEX IF NOT EXISTS idx_posts__id__post_type
ON posts (id DESC, post_type)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_posts__broadcast__users
ON posts (id DESC)
WHERE deleted_at IS NULL AND broadcast = 'users';

-- searching posts by text
CREATE INDEX IF NOT EXISTS idx_posts__search_vector
ON posts USING GIN (search_vector)
WHERE deleted_at IS NULL;

-- searching posts by creator; bare so it also serves as the RI-usable index for created_by_id's FK
CREATE INDEX IF NOT EXISTS idx_posts__created_by_id
ON posts (created_by_id);

-- first-post and ban-evasion candidate lookups within a community
CREATE INDEX IF NOT EXISTS idx_posts__created_by_id__community_id__id
ON posts (created_by_id, community_id, id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_posts__created_by_id__is_anonymous
ON posts (created_by_id, is_anonymous)
WHERE deleted_at IS NULL;

-- RI-usable indexes for the SET NULL audit-column FKs (posts is a large-audit table)
CREATE INDEX IF NOT EXISTS idx_posts__updated_by_id
ON posts (updated_by_id)
WHERE updated_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts__deleted_by_id
ON posts (deleted_by_id)
WHERE deleted_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts__archived_by_id
ON posts (archived_by_id)
WHERE archived_by_id IS NOT NULL;

-- searching posts by parent, with id for comment tree queries (created_at is derived from id)
-- NOT filtered by deleted_at IS NOT NULL as that would break the comment tree structure
CREATE INDEX IF NOT EXISTS idx_posts__parent_id__id
ON posts (parent_id, id)
WHERE parent_id IS NOT NULL;

-- find comments in chronological order for a given root post (also the RI-usable index for root_id's FK)
CREATE INDEX IF NOT EXISTS idx_posts__root_id__id
ON posts (root_id, id)
WHERE root_id IS NOT NULL;

-- filter comments by root post and community scope, with id for sorted retrieval
CREATE INDEX IF NOT EXISTS idx_posts__root_id__community_id__id
ON posts (root_id, community_id, id)
WHERE root_id IS NOT NULL;

-- find existing embeddings by input hash
CREATE INDEX IF NOT EXISTS idx_posts__bedrock_nova_multimodal_v1_input_sha256
ON posts (bedrock_nova_multimodal_v1_input_sha256)
WHERE bedrock_nova_multimodal_v1_input_sha256 IS NOT NULL;

-- index embeddings for similarity search (vector_cosine_ops matches <=> queries)
CREATE INDEX IF NOT EXISTS idx_posts__bedrock_nova_multimodal_v1_embedding
ON posts USING hnsw (bedrock_nova_multimodal_v1_embedding vector_cosine_ops)
WHERE bedrock_nova_multimodal_v1_embedding IS NOT NULL;

-- find out of date embeddings
CREATE INDEX IF NOT EXISTS ids_posts__bedrock_nova_multimodal_v1_to_update
ON posts (id)
WHERE (
  bedrock_nova_multimodal_v1_input_sha256 IS NULL
  OR bedrock_nova_multimodal_v1_input_sha256 != bedrock_nova_multimodal_v1_content_sha256
);

CREATE INDEX IF NOT EXISTS idx_posts__ban_evasion_post_embedding_pending
ON posts (id)
WHERE community_id IS NOT NULL
  AND created_by_id IS NOT NULL
  AND deleted_at IS NULL
  AND bedrock_nova_multimodal_v1_embedding IS NOT NULL
  AND bedrock_nova_multimodal_v1_embedding_created_at IS NOT NULL
  AND bedrock_nova_multimodal_v1_input_sha256 = bedrock_nova_multimodal_v1_content_sha256
  AND (
    ban_evasion_post_embedding_input_sha256 IS NULL
    OR ban_evasion_post_embedding_input_sha256 != bedrock_nova_multimodal_v1_input_sha256
  );

-- find private posts by creator for privacy filtering
CREATE INDEX IF NOT EXISTS idx_posts__privacy_private ON posts (created_by_id, broadcast)
  WHERE privacy = 'private' AND deleted_at IS NULL;

-- find posts pending language detection
CREATE INDEX IF NOT EXISTS posts_lingua_rs_pending_idx
  ON posts (id)
  WHERE lingua_rs_input_sha256 IS NULL;

-- queries that filter to only archived posts (e.g. admin tooling, archival reports)
CREATE INDEX IF NOT EXISTS idx_posts__archived_at
ON posts (archived_at, id DESC)
WHERE deleted_at IS NULL AND archived_at IS NOT NULL;

-- GIN index for full JSONB queries on structured_data
CREATE INDEX IF NOT EXISTS idx_posts__structured_data
  ON posts USING GIN (structured_data jsonb_path_ops)
  WHERE structured_data IS NOT NULL AND deleted_at IS NULL;

-- filtering by vertical (most common filter)
CREATE INDEX IF NOT EXISTS idx_posts__data_point_vertical
  ON posts (data_point_vertical, id DESC)
  WHERE data_point_vertical IS NOT NULL AND deleted_at IS NULL;

-- expression index for querying by topic_id stored inside structured_data
CREATE INDEX IF NOT EXISTS idx_posts__structured_data__topic_id
  ON posts ((structured_data->>'topic_id'))
  WHERE structured_data IS NOT NULL AND deleted_at IS NULL;

-- expression index for querying by result (approved/denied/etc.) inside structured_data
CREATE INDEX IF NOT EXISTS idx_posts__structured_data__result
  ON posts ((structured_data->>'result'))
  WHERE structured_data IS NOT NULL AND deleted_at IS NULL;

-- root-post visibility lookups: privacy filter checks root post broadcast/creator for comments
CREATE INDEX IF NOT EXISTS idx_posts__root_post_visibility
  ON posts (id) INCLUDE (broadcast, created_by_id)
  WHERE deleted_at IS NULL;

-- RI-usable index for the url_id FK (ON DELETE RESTRICT — see column comment)
CREATE INDEX IF NOT EXISTS idx_posts__url_id
  ON posts (url_id)
  WHERE url_id IS NOT NULL;

-- link-post URL lookups: getPostIdsByUrlIds joins posts.url_id against resolved URL chains
CREATE INDEX IF NOT EXISTS idx_posts__url_id__link
  ON posts (url_id, id DESC)
  WHERE post_type = 'link' AND deleted_at IS NULL;

COMMENT ON TABLE posts IS 'User-generated posts: discussions, reviews, data points, recommendations, stories, and comments. RANGE-partitioned by id.';
COMMENT ON COLUMN posts.post_type IS 'Discriminator: discussion, review, data_point, topic_recommendation, comment, story, link, article, or blog_post.';
COMMENT ON COLUMN posts.url_id IS 'For link posts: the single external URL this post links. NULL for all other post types. Biconditional CHECK enforces mutual exclusivity.';
COMMENT ON COLUMN posts.title IS 'Post title (max 255 chars). At least one of title, markdown, or ai_summary_markdown must be non-empty.';
COMMENT ON COLUMN posts.markdown IS 'Post body in markdown format.';
COMMENT ON COLUMN posts.ai_summary_markdown IS 'AI-generated summary in markdown. Separate from user-authored markdown. Only administrators can update this via updatePost().';
COMMENT ON COLUMN posts.parent_id IS 'Parent post for threaded comments. NULL for top-level posts.';
COMMENT ON COLUMN posts.root_id IS 'Root post of a comment thread. NULL for top-level posts.';
COMMENT ON COLUMN posts.broadcast IS 'Audience for this post: everyone, users, followers, or mutual_followers.';
COMMENT ON COLUMN posts.privacy IS 'Visibility: public or private.';
COMMENT ON COLUMN posts.is_anonymous IS 'Whether the author''s identity is hidden from other users.';
COMMENT ON COLUMN posts.community_id IS 'Community scope for comments. NULL means global. FK to communities added in 0200-00-00-communities.sql.';
COMMENT ON COLUMN posts.votes_snapshot_xmax IS 'Upper transaction-ID boundary of the PostgreSQL snapshot used for the persisted vote-stat aggregate.';
COMMENT ON COLUMN posts.votes_snapshot_xip_count IS 'Number of transactions still in progress in that vote-stat snapshot; lower is newer when the snapshot xmax is equal.';
COMMENT ON COLUMN posts.archived_at IS 'Timestamp when this post was archived; NULL means not archived.';
COMMENT ON COLUMN posts.archived_by_id IS 'User who archived this post; NULL if not archived or user was deleted.';
COMMENT ON COLUMN posts.data_point_vertical IS 'Discriminator for the structured data point schema (credit_card, bank_account). NULL for non-data-point posts.';
COMMENT ON COLUMN posts.structured_data IS 'Structured JSONB payload for data point posts. Schema is determined by data_point_vertical.';
COMMENT ON COLUMN posts.latest_clearance_change_id IS 'Most recent clearance transition for this post. FK added after post_clearance_changes because the tables reference each other.';
COMMENT ON COLUMN posts.approved_at IS 'Set when the current derived clearance status is approved.';
COMMENT ON COLUMN posts.rejected_at IS 'Set when the current derived clearance status is rejected.';
COMMENT ON COLUMN posts.in_review_at IS 'Set when the current derived clearance status is in_review.';
COMMENT ON COLUMN posts.ban_evasion_post_embedding_input_sha256 IS 'Post embedding input SHA for which the post-embedding ban-evasion follow-up enqueue has been recorded.';
COMMENT ON COLUMN posts.declared_language IS 'User-declared ISO 639-1 language opt-in (default null)';

-- =============================================================================
-- post_review_topic_ratings
-- =============================================================================

CREATE TABLE IF NOT EXISTS post_review_topic_ratings (
  post_id UUID NOT NULL REFERENCES posts ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  order_index INT NOT NULL DEFAULT 0 CHECK (order_index >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, topic_id)
) PARTITION BY RANGE (post_id);

CREATE OR REPLACE TRIGGER trigger_post_review_topic_ratings_updated_at
BEFORE UPDATE ON post_review_topic_ratings
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_post_review_topic_ratings__topic_id
ON post_review_topic_ratings (topic_id)
INCLUDE (post_id, rating);

COMMENT ON TABLE post_review_topic_ratings IS 'Individual topic ratings within review posts. A review can rate multiple topics.';
COMMENT ON COLUMN post_review_topic_ratings.post_id IS 'The review post this rating belongs to.';
COMMENT ON COLUMN post_review_topic_ratings.topic_id IS 'The topic being rated.';
COMMENT ON COLUMN post_review_topic_ratings.rating IS 'Rating value from 1 to 5 stars.';
COMMENT ON COLUMN post_review_topic_ratings.order_index IS 'Display order of this rating within the review (0-based).';

-- =============================================================================
-- post_slugs
-- =============================================================================

-- all slugs associated with a post
-- the most recent one is canonical
CREATE TABLE IF NOT EXISTS post_slugs (
  post_id UUID NOT NULL REFERENCES posts ON DELETE CASCADE,

  slug TEXT PRIMARY KEY,
  CHECK (char_length(slug) <= 255),
  CHECK (slug = LOWER(slug)),
  CHECK (slug = TRIM(slug)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_post_slugs_updated_at
BEFORE UPDATE ON post_slugs
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- Supports latest-slug lookup by post:
-- WHERE post_id = ? ORDER BY created_at DESC LIMIT 1
-- INCLUDE (slug) keeps the lookup index-only when possible.
CREATE INDEX IF NOT EXISTS idx_post_slugs__post_id__created_at_desc
ON post_slugs (post_id, created_at DESC)
INCLUDE (slug);

COMMENT ON TABLE post_slugs IS 'URL slugs for posts. The most recently created slug is canonical; older slugs redirect.';
COMMENT ON COLUMN post_slugs.post_id IS 'The post this slug belongs to.';
COMMENT ON COLUMN post_slugs.slug IS 'URL-safe lowercase slug (primary key). Unique across all posts.';

-- =============================================================================
-- agents
-- =============================================================================

-- Generic agent system for LLM-powered agents (moderators, autotagger, etc.)

DO $$ BEGIN
  CREATE TYPE agent_types AS ENUM (
  'moderator',
  'autotagger',
  'storyteller',
  'recommender'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_models AS ENUM (
  'gpt-5.4-nano'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_model_providers AS ENUM (
  'openai'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  system_user_id UUID NOT NULL UNIQUE REFERENCES users ON DELETE CASCADE,
  agent_type agent_types NOT NULL,

  activated_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  CHECK (NOT (activated_at IS NOT NULL AND deactivated_at IS NOT NULL)),

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID REFERENCES users ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL
);

-- Index for finding active agents by type
CREATE INDEX IF NOT EXISTS idx_agents__active_by_type
ON agents (agent_type, activated_at DESC)
WHERE activated_at IS NOT NULL
  AND deactivated_at IS NULL
  AND deleted_at IS NULL;

-- Index for looking up by system_user_id
CREATE INDEX IF NOT EXISTS idx_agents__system_user_id
ON agents (system_user_id)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS agent_prompts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  prompt TEXT NOT NULL,

  agent_id UUID NOT NULL REFERENCES agents ON DELETE CASCADE,
  model_name agent_models NOT NULL,
  model_provider agent_model_providers NOT NULL,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID REFERENCES users ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,

  activated_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,

  CHECK (NOT (activated_at IS NOT NULL AND deactivated_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_agent_prompts__agent_id
ON agent_prompts (agent_id, activated_at DESC)
INCLUDE (prompt, model_name, model_provider)
WHERE deleted_at IS NULL;

-- RI-usable index for the agent_id FK (the index above carries a predicate, so it isn't RI-usable)
CREATE INDEX IF NOT EXISTS idx_agent_prompts__agent_id_bare
ON agent_prompts (agent_id);

COMMENT ON TABLE agents IS 'LLM-powered agents (moderators, autotaggers, etc.) that operate as system users.';
COMMENT ON COLUMN agents.system_user_id IS 'The user account this agent operates as. One-to-one.';
COMMENT ON COLUMN agents.agent_type IS 'Type of agent: moderator or autotagger.';
COMMENT ON COLUMN agents.activated_at IS 'When the agent was activated. NULL if currently deactivated.';
COMMENT ON COLUMN agents.deactivated_at IS 'When the agent was deactivated. NULL if currently active.';

COMMENT ON TABLE agent_prompts IS 'Versioned prompts for agents. Each prompt targets a specific model and can be activated/deactivated.';
COMMENT ON COLUMN agent_prompts.prompt IS 'The system prompt text sent to the LLM.';
COMMENT ON COLUMN agent_prompts.agent_id IS 'The agent this prompt belongs to.';
COMMENT ON COLUMN agent_prompts.model_name IS 'The LLM model name (e.g. gpt-5.4-nano).';
COMMENT ON COLUMN agent_prompts.model_provider IS 'The LLM provider (e.g. openai).';
COMMENT ON COLUMN agent_prompts.activated_at IS 'When this prompt version was activated. NULL if currently deactivated.';
COMMENT ON COLUMN agent_prompts.deactivated_at IS 'When this prompt version was deactivated. NULL if currently active.';

-- Trigger to update updated_at on agents
CREATE TRIGGER trigger_agents_updated_at
BEFORE UPDATE ON agents
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- Trigger to update updated_at on agent_prompts
CREATE TRIGGER trigger_agent_prompts_updated_at
BEFORE UPDATE ON agent_prompts
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- Extension table for moderator-specific configuration
DO $$ BEGIN
  CREATE TYPE moderator_on_flag_action AS ENUM ('none', 'review_queue');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS agents__moderators (
  agent_id UUID PRIMARY KEY REFERENCES agents ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE CHECK (slug = LOWER(slug) AND TRIM(slug) = slug),
  on_flag_action moderator_on_flag_action NOT NULL DEFAULT 'review_queue',
  is_baseline BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agents__moderators__slug ON agents__moderators (slug);

CREATE TRIGGER trigger_agents__moderators_updated_at
BEFORE UPDATE ON agents__moderators
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE agents__moderators IS 'Moderator-specific configuration extending the agents table.';
COMMENT ON COLUMN agents__moderators.agent_id IS 'The agent this moderator config extends (PK, 1:1 with agents).';
COMMENT ON COLUMN agents__moderators.slug IS 'Unique lowercase identifier for this moderator (e.g. spam-filter).';
COMMENT ON COLUMN agents__moderators.on_flag_action IS 'Action taken when a moderator flags content: none (log only) or review_queue (move to review queue).';
COMMENT ON COLUMN agents__moderators.is_baseline IS 'When true, this moderator runs on every approved post regardless of community opt-in (baseline safety net).';

-- =============================================================================
-- agent_moderations
-- =============================================================================

-- Agent moderation results using the generic agents system

CREATE TABLE IF NOT EXISTS agent_moderations (
  post_id UUID NOT NULL REFERENCES posts ON DELETE CASCADE,
  prompt_id UUID NOT NULL REFERENCES agent_prompts ON DELETE CASCADE,
  input_sha256 BYTEA NOT NULL CHECK (octet_length(input_sha256) = 32),
  agent_id UUID NOT NULL REFERENCES agents ON DELETE CASCADE,

  id UUID NOT NULL DEFAULT uuidv7(), -- stable identifier for vote table FK
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,

  -- results
  results JSONB NOT NULL,
  flagged BOOLEAN NOT NULL,

  votes_snapshot_xmax XID8,
  votes_snapshot_xip_count INTEGER,
  CONSTRAINT chk_agent_moderations_votes_snapshot_complete CHECK (
    (votes_snapshot_xmax IS NULL AND votes_snapshot_xip_count IS NULL)
    OR (votes_snapshot_xmax IS NOT NULL AND votes_snapshot_xip_count IS NOT NULL AND votes_snapshot_xip_count >= 0)
  ),

  -- Aggregate-only transparency projection. These source-row-local stamps
  -- make delete and FK-cascade maintenance independent of parent visibility.
  moderation_transparency_category TEXT,
  moderation_transparency_community_id UUID,
  CONSTRAINT chk_agent_moderations__transparency_projection CHECK (
    (moderation_transparency_category IS NULL AND moderation_transparency_community_id IS NULL)
    OR (moderation_transparency_category = 'agent_moderation')
    OR (moderation_transparency_category = 'community_ai' AND moderation_transparency_community_id IS NOT NULL)
  ),

  PRIMARY KEY (post_id, input_sha256, prompt_id)
) PARTITION BY RANGE (post_id);

-- unique index on (post_id, id) for vote table FK reference
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_moderations__post_id__id ON agent_moderations (post_id, id);

-- index on id alone for election lookup by id (getAgentModerationElectionById)
CREATE INDEX IF NOT EXISTS idx_agent_moderations__id ON agent_moderations (id)
WHERE deleted_at IS NULL;

-- RI-usable index for the prompt_id FK
CREATE INDEX IF NOT EXISTS idx_agent_moderations__prompt_id ON agent_moderations (prompt_id);

-- bare so it also serves as the RI-usable index for agent_id's FK
CREATE INDEX IF NOT EXISTS idx_agent_moderations__agent_id ON agent_moderations (agent_id, post_id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_moderations__flagged_agent ON agent_moderations (agent_id, flagged, post_id DESC)
WHERE deleted_at IS NULL AND flagged = TRUE;

CREATE INDEX IF NOT EXISTS idx_agent_moderations__lookup ON agent_moderations (post_id, prompt_id, input_sha256)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_moderations__flagged_prompt
  ON agent_moderations (prompt_id, post_id DESC)
  WHERE deleted_at IS NULL AND flagged = TRUE;

CREATE INDEX IF NOT EXISTS idx_agent_moderations__transparency_global
  ON agent_moderations (id)
  WHERE moderation_transparency_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_moderations__transparency_community
  ON agent_moderations (moderation_transparency_community_id, id)
  WHERE moderation_transparency_category = 'community_ai';

COMMENT ON TABLE agent_moderations IS 'LLM moderation results for posts. Keyed by (post, content hash, prompt). RANGE-partitioned by post_id.';
COMMENT ON COLUMN agent_moderations.post_id IS 'The post that was moderated.';
COMMENT ON COLUMN agent_moderations.prompt_id IS 'The agent prompt version used for this moderation.';
COMMENT ON COLUMN agent_moderations.input_sha256 IS 'SHA-256 of the content that was moderated, for deduplication.';
COMMENT ON COLUMN agent_moderations.agent_id IS 'The agent that performed the moderation.';
COMMENT ON COLUMN agent_moderations.results IS 'Raw JSONB moderation results from the LLM.';
COMMENT ON COLUMN agent_moderations.votes_snapshot_xmax IS 'Upper transaction-ID boundary of the PostgreSQL snapshot used for the persisted vote-stat aggregate.';
COMMENT ON COLUMN agent_moderations.votes_snapshot_xip_count IS 'Number of transactions still in progress in that vote-stat snapshot; lower is newer when the snapshot xmax is equal.';
COMMENT ON COLUMN agent_moderations.moderation_transparency_category IS 'Immutable event-time aggregate category; NULL when the event was not eligible for paid transparency.';
COMMENT ON COLUMN agent_moderations.moderation_transparency_community_id IS 'Immutable event-time post or community-prompt scope snapshot; intentionally has no FK so delete cascades can decrement the prior aggregate.';

-- Prime per-column planner statistics for the columns getPostMetricsByAnyBatch filters `posts` on
-- (backend/services/posts/metrics-batch.mts). Those predicates are estimated from per-column stats --
-- null_frac for `deleted_at IS NULL`, n_distinct/MCVs for `root_id` / `parent_id` equality -- which
-- autoanalyze maintains in production; this ANALYZE just primes them for the freshly loaded table.
-- A `dependencies` extended-statistics object (stat_posts__root_parent_deleted) previously sat here
-- and was removed as a measured no-op for this query: `dependencies` only engages when two of its
-- columns appear as ANDed equality-to-constant, whereas the batch predicates are
-- column-to-outer-reference, `IS NULL`, and `OR`; and on a RANGE-partitioned table like `posts` a
-- parent-level object is not consulted once the plan scans individual partitions. See
-- .agents/skills/postgres-node-performance-tuning/SKILL.md#extended-statistics-create-statistics.
ANALYZE posts (root_id, parent_id, deleted_at);
COMMENT ON COLUMN agent_moderations.flagged IS 'Whether the moderation flagged this content as problematic.';

-- ==========================================================================
-- 0270-00-00-post-data-point-topics.sql
-- ============================================================================

-- =============================================================================
-- post_data_point_topics
-- =============================================================================
-- Structured relationship between data point posts and their subject topics.
-- Analogous to post_review_topic_ratings for reviews — captures which topics
-- a data point is specifically "for" (e.g., "Approved for Chase Sapphire Preferred").

CREATE TABLE IF NOT EXISTS post_data_point_topics (
  post_id UUID NOT NULL REFERENCES posts ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0 CHECK (order_index >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, topic_id)
) PARTITION BY RANGE (post_id);

CREATE OR REPLACE TRIGGER trigger_post_data_point_topics_updated_at
BEFORE UPDATE ON post_data_point_topics
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_post_data_point_topics__topic_id
ON post_data_point_topics (topic_id)
INCLUDE (post_id);

COMMENT ON TABLE post_data_point_topics IS 'Subject topics for data point posts. A data point can be about multiple topics (e.g., approved for a specific credit card).';
COMMENT ON COLUMN post_data_point_topics.post_id IS 'The data point post this topic belongs to.';
COMMENT ON COLUMN post_data_point_topics.topic_id IS 'The topic this data point is about.';
COMMENT ON COLUMN post_data_point_topics.order_index IS 'Display order of this topic within the data point (0-based).';

-- ==========================================================================
-- 0140-00-00-post-images.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS post_images (
  post_id UUID NOT NULL REFERENCES posts ON DELETE CASCADE,
  image_id UUID NOT NULL REFERENCES images ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  CHECK (order_index >= 0),
  caption TEXT NOT NULL DEFAULT '',
  CHECK (char_length(caption) <= 1000),
  CHECK (caption = TRIM(caption)),
  PRIMARY KEY (post_id, image_id)
);

CREATE INDEX IF NOT EXISTS idx_post_images__post_id__order_index
  ON post_images (post_id, order_index);

CREATE INDEX IF NOT EXISTS idx_post_images__image_id
  ON post_images (image_id);

COMMENT ON TABLE post_images IS 'Associates images with posts in a specified display order with optional captions.';
COMMENT ON COLUMN post_images.post_id IS 'The post this image is attached to.';
COMMENT ON COLUMN post_images.image_id IS 'The image entity.';
COMMENT ON COLUMN post_images.order_index IS 'Zero-based display order of the image within the post.';
COMMENT ON COLUMN post_images.caption IS 'Optional caption text for the image.';
