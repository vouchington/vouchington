-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: added language detection columns to topics
-- edited-in-place: swapped 'english' to 'voucha_english' text search config (unaccent support)
-- edited-in-place: idx_topic_aliases__unlink_topic_id is now (unlink_topic_id, id) to serve id-ordered paging
-- Merged from: 0005-00-00-topics.sql, 0110-00-00-wikipedia-topic-recommendations.sql, 0160-00-00-review-snippet-categories.sql

-- ==========================================================================
-- 0005-00-00-topics.sql
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE topic_types AS ENUM (
  'topic',
  'rewards_program',
  'referral_program',
  'card',
  'rewards_program_status',
  'bank_account',
  'rss_feed',
  'fediverse_instance'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT uuidv7() REFERENCES retained_topic_identities (id) ON DELETE RESTRICT,
  created_via content_creation_channels NOT NULL,
  created_via_oauth_client_id UUID,
  CONSTRAINT topics_created_via_oauth_client_id_check CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp'))),

  topic_type topic_types NOT NULL DEFAULT 'topic',

  name TEXT NOT NULL, -- canonical name
  CHECK (char_length(name) <= 255),
  CHECK (name = TRIM(name)),
  slug TEXT NOT NULL, -- canonical slug
  CHECK (char_length(slug) <= 255),
  CHECK (slug = LOWER(slug)),
  CHECK (slug = TRIM(slug)),

  -- Trigger-maintained search cache projected from topic_aliases
  aliases TEXT[] NOT NULL DEFAULT '{}', -- used only for search purposes
  markdown TEXT NOT NULL DEFAULT '',

  -- Policy flags (see docs/requirements/content/TOPICS.md). Configuration toggles, not lifecycle state.
  is_noindexed BOOLEAN NOT NULL DEFAULT false, -- exclude this topic's pages from search-engine indexing
  should_allow_reviews BOOLEAN NOT NULL DEFAULT true, -- false for private individuals; blocks review creation + hides review UI

  votes_snapshot_xmax XID8,
  votes_snapshot_xip_count INTEGER,
  votes_score_up DOUBLE PRECISION NOT NULL DEFAULT 0 CONSTRAINT chk_topics_votes_score_up CHECK (votes_score_up >= 0),
  votes_score_none DOUBLE PRECISION NOT NULL DEFAULT 0 CONSTRAINT chk_topics_votes_score_none CHECK (votes_score_none >= 0),
  votes_score_down DOUBLE PRECISION NOT NULL DEFAULT 0 CONSTRAINT chk_topics_votes_score_down CHECK (votes_score_down >= 0),
  votes_count_up INT NOT NULL DEFAULT 0 CONSTRAINT chk_topics_votes_count_up CHECK (votes_count_up >= 0),
  votes_count_none INT NOT NULL DEFAULT 0 CONSTRAINT chk_topics_votes_count_none CHECK (votes_count_none >= 0),
  votes_count_down INT NOT NULL DEFAULT 0 CONSTRAINT chk_topics_votes_count_down CHECK (votes_count_down >= 0),
  votes_score_sort DOUBLE PRECISION GENERATED ALWAYS AS (fn_wilson_score_lower_bound(votes_score_up, votes_score_up + votes_score_none + votes_score_down)) STORED,
  votes_score_net DOUBLE PRECISION GENERATED ALWAYS AS (votes_score_up - votes_score_down) STORED,
  CONSTRAINT chk_topics_votes_snapshot_complete CHECK (
    (votes_snapshot_xmax IS NULL AND votes_snapshot_xip_count IS NULL)
    OR (votes_snapshot_xmax IS NOT NULL AND votes_snapshot_xip_count IS NOT NULL AND votes_snapshot_xip_count >= 0)
  ),

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  created_by_id UUID REFERENCES users ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID REFERENCES users ON DELETE SET NULL, -- the last person who updated it, used for authorship
  content_updated_at TIMESTAMPTZ, -- latest administrator-authored name or markdown revision
  content_updated_by_id UUID REFERENCES users ON DELETE SET NULL,
  CONSTRAINT chk_topics_content_updated_by_has_time
    CHECK (content_updated_by_id IS NULL OR content_updated_at IS NOT NULL),
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,
  merged_into_topic_id UUID REFERENCES topics ON DELETE RESTRICT,
  merged_at TIMESTAMPTZ,
  merged_by_id UUID REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  CONSTRAINT chk_topics_merged_into_not_self
    CHECK (merged_into_topic_id IS NULL OR merged_into_topic_id <> id),
  CONSTRAINT chk_topics_merge_state_complete
    CHECK (
    (merged_into_topic_id IS NULL AND merged_at IS NULL AND merged_by_id IS NULL)
    OR (merged_into_topic_id IS NOT NULL AND merged_at IS NOT NULL AND merged_by_id IS NOT NULL)
  ),

  hostname_id UUID REFERENCES url_hostnames ON DELETE RESTRICT,
  logo_image_id UUID REFERENCES images ON DELETE SET NULL,
  hero_image_id UUID REFERENCES images ON DELETE SET NULL,
  homepage_url_id UUID REFERENCES urls ON DELETE SET NULL,

  -- bedrock nova multimodal v1 embedding
  bedrock_nova_multimodal_v1_content_sha256 BYTEA NOT NULL,
  CHECK (OCTET_LENGTH(bedrock_nova_multimodal_v1_content_sha256) = 32),
  bedrock_nova_multimodal_v1_input_sha256 BYTEA,
  CHECK (bedrock_nova_multimodal_v1_input_sha256 IS NULL OR OCTET_LENGTH(bedrock_nova_multimodal_v1_input_sha256) = 32),
  bedrock_nova_multimodal_v1_embedding VECTOR(1024),
  bedrock_nova_multimodal_v1_embedding_created_at TIMESTAMPTZ,
  bedrock_nova_multimodal_v1_input_token_count INT,
  CHECK (bedrock_nova_multimodal_v1_input_token_count IS NULL OR bedrock_nova_multimodal_v1_input_token_count >= 0),

  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('voucha_english', COALESCE(name, '')), 'A') ||
    setweight(to_tsvector('voucha_english', COALESCE(slug, '')), 'A') ||
    setweight(to_tsvector('voucha_english', COALESCE(fn_immutable_array_to_string(aliases, ' '), '')), 'B') ||
    setweight(to_tsvector('voucha_english', COALESCE(markdown, '')), 'D')
  ) STORED,

  rewards_program_topic_id UUID,  -- FK to rewards_program_topics added below
  referral_program_topic_id UUID,  -- FK to referral_program_topics added below

  -- language detection
  lingua_rs_detected_language TEXT CHECK (lingua_rs_detected_language IS NULL OR (lingua_rs_detected_language = LOWER(lingua_rs_detected_language) AND LENGTH(lingua_rs_detected_language) <= 10)),
  lingua_rs_content_sha256 BYTEA CHECK (lingua_rs_content_sha256 IS NULL OR LENGTH(lingua_rs_content_sha256) = 32),
  lingua_rs_input_sha256 BYTEA CHECK (lingua_rs_input_sha256 IS NULL OR LENGTH(lingua_rs_input_sha256) = 32),
  lingua_rs_results JSONB,
  lingua_rs_detected_at TIMESTAMPTZ
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_register_retained_topic_identity
BEFORE INSERT ON topics
FOR EACH ROW EXECUTE FUNCTION fn_register_retained_identity('topic');

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_topics_updated_at
BEFORE UPDATE ON topics
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- A merge operation reserves both participants while its bounded pages run. The source's
-- redirect is written only by the final page, after every current reference has moved.
CREATE TYPE topic_merge_stages AS ENUM (
  'preflight',
  'aliases', 'subtype_create', 'subtypes', 'derived', 'classifier_cleanup', 'references', 'collisions', 'bookmarks', 'relations',
  'subtype_delete', 'vote_aggregation', 'finalize', 'effects', 'cleanup', 'cleanup_failed'
);

CREATE TABLE IF NOT EXISTS topic_merge_operations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  admission_position BIGINT GENERATED ALWAYS AS IDENTITY,
  source_topic_id UUID NOT NULL REFERENCES topics (id) ON DELETE RESTRICT,
  destination_topic_id UUID NOT NULL REFERENCES topics (id) ON DELETE RESTRICT,
  requested_by_id UUID NOT NULL REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  fence_token UUID NOT NULL DEFAULT uuidv7(),
  stage topic_merge_stages NOT NULL DEFAULT 'preflight',
  stage_table_position INTEGER NOT NULL DEFAULT 0 CHECK (stage_table_position >= 0),
  relation_column_position SMALLINT NOT NULL DEFAULT 0 CHECK (relation_column_position BETWEEN 0 AND 4),
  relation_phase SMALLINT NOT NULL DEFAULT 0 CHECK (relation_phase BETWEEN 0 AND 9),
  alias_phase SMALLINT NOT NULL DEFAULT 0 CHECK (alias_phase BETWEEN 0 AND 4),
  cursor_row_id UUID,
  cursor_subject_id UUID,
  cursor_object_id UUID,
  cursor_alias TEXT,
  cursor_country_position SMALLINT,
  generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  error_code TEXT,
  metric_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  metric_snapshot_xmax XID8,
  metric_snapshot_xip_count INTEGER,
  metric_rating_revision BIGINT,
  source_aliases_before JSONB NOT NULL DEFAULT '[]'::jsonb,
  destination_aliases_before JSONB NOT NULL DEFAULT '[]'::jsonb,
  destination_aliases_after JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT chk_topic_merge_operations_distinct_topics
    CHECK (source_topic_id <> destination_topic_id),
  CONSTRAINT chk_topic_merge_operations_terminal_state
    CHECK (num_nonnulls(completed_at, failed_at) <= 1),
  CONSTRAINT chk_topic_merge_operations_failed_error
    CHECK ((rejected_at IS NULL) = (error_code IS NULL)),
  CONSTRAINT chk_topic_merge_operations_failed_rejection
    CHECK (failed_at IS NULL OR rejected_at IS NOT NULL),
  CONSTRAINT chk_topic_merge_operations_metric_snapshot_complete
    CHECK ((metric_snapshot_xmax IS NULL AND metric_snapshot_xip_count IS NULL
        AND metric_rating_revision IS NULL)
      OR (metric_snapshot_xmax IS NOT NULL AND metric_snapshot_xip_count IS NOT NULL
        AND metric_snapshot_xip_count >= 0 AND metric_rating_revision IS NOT NULL
        AND metric_rating_revision >= 0)),
  CONSTRAINT uq_topic_merge_operations__admission_position UNIQUE (admission_position)
);

CREATE OR REPLACE TRIGGER trigger_topic_merge_operations_updated_at
BEFORE UPDATE ON topic_merge_operations
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_topic_merge_operations__source_topic_id
ON topic_merge_operations (source_topic_id, id);
CREATE INDEX IF NOT EXISTS idx_topic_merge_operations__destination_topic_id
ON topic_merge_operations (destination_topic_id, id);
CREATE INDEX IF NOT EXISTS idx_topic_merge_operations__requested_by_id
ON topic_merge_operations (requested_by_id);
CREATE INDEX IF NOT EXISTS idx_topic_merge_operations__active_source
ON topic_merge_operations (source_topic_id)
WHERE completed_at IS NULL AND failed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_topic_merge_operations__active_destination
ON topic_merge_operations (destination_topic_id)
WHERE completed_at IS NULL AND failed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_topic_merge_operations__active_recovery
ON topic_merge_operations (updated_at, id)
WHERE completed_at IS NULL AND failed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_topic_merge_operations__active_id
ON topic_merge_operations (id)
WHERE completed_at IS NULL AND failed_at IS NULL;
COMMENT ON TABLE topic_merge_operations IS 'Durable progress and participant reservation for one staged topic merge.';
COMMENT ON COLUMN topic_merge_operations.admission_position IS 'Commit-ordered merge priority assigned under the admission transaction lock; younger connected operations reject in preflight.';
COMMENT ON COLUMN topic_merge_operations.source_topic_id IS 'Topic whose current references move to the destination.';
COMMENT ON COLUMN topic_merge_operations.rejected_at IS 'When bounded preflight rejected the request; reservations release only after scratch cleanup reaches failed_at.';
COMMENT ON COLUMN topic_merge_operations.destination_topic_id IS 'Topic that receives current references.';
COMMENT ON COLUMN topic_merge_operations.requested_by_id IS 'Administrator who requested the merge.';
COMMENT ON COLUMN topic_merge_operations.fence_token IS 'Private capability for one worker transaction to mutate reserved participants.';
COMMENT ON COLUMN topic_merge_operations.stage IS 'Current ordered merge stage.';
COMMENT ON COLUMN topic_merge_operations.stage_table_position IS 'Position in the finite reviewed table inventory for the current stage.';
COMMENT ON COLUMN topic_merge_operations.relation_column_position IS 'Subject or object topic-FK pass for the current relation table.';
COMMENT ON COLUMN topic_merge_operations.relation_phase IS 'Discovery, votes, flags, or parent cleanup step for a voted relation group.';
COMMENT ON COLUMN topic_merge_operations.alias_phase IS 'Destination snapshot, source snapshot, move, slug, or revision step for aliases.';
COMMENT ON COLUMN topic_merge_operations.cursor_row_id IS 'Last processed UUID row key within the current stage and table.';
COMMENT ON COLUMN topic_merge_operations.cursor_subject_id IS 'Last processed relation subject key for a composite-key page.';
COMMENT ON COLUMN topic_merge_operations.cursor_object_id IS 'Last processed relation object key for a composite-key page.';
COMMENT ON COLUMN topic_merge_operations.cursor_country_position IS 'Last country-key comparison position for retailer preflight.';
COMMENT ON COLUMN topic_merge_operations.cursor_alias IS 'Last processed alias in lexical order.';
COMMENT ON COLUMN topic_merge_operations.generation IS 'Committed page generation used to reject stale continuation jobs.';
COMMENT ON COLUMN topic_merge_operations.started_at IS 'First page start time.';
COMMENT ON COLUMN topic_merge_operations.completed_at IS 'Time the source redirect and final state committed.';
COMMENT ON COLUMN topic_merge_operations.failed_at IS 'Preflight rejection time before any merge effects.';
COMMENT ON COLUMN topic_merge_operations.error_code IS 'Stable error code for a rejected preflight.';
COMMENT ON COLUMN topic_merge_operations.metric_stats IS 'Bounded page accumulation of destination vote, rating, and bookmark statistics.';
COMMENT ON COLUMN topic_merge_operations.metric_snapshot_xmax IS 'Upper transaction-ID boundary captured at the first post-reference metric page for vote projection ordering.';
COMMENT ON COLUMN topic_merge_operations.metric_snapshot_xip_count IS 'In-progress transaction count in the first metric-page snapshot; lower is newer at equal xmax.';
COMMENT ON COLUMN topic_merge_operations.metric_rating_revision IS 'Destination rating reconciliation revision captured with the first metric page; finalization restarts if it changed.';
COMMENT ON COLUMN topic_merge_operations.source_aliases_before IS 'Sorted source alias history document accumulated through bounded pages.';
COMMENT ON COLUMN topic_merge_operations.destination_aliases_before IS 'Sorted destination alias history document accumulated through bounded pages.';
COMMENT ON COLUMN topic_merge_operations.destination_aliases_after IS 'Sorted merged destination alias history document accumulated through bounded pages.';
COMMENT ON COLUMN topic_merge_operations.updated_at IS 'Last committed cursor or stage transition time for recovery.';


CREATE TABLE IF NOT EXISTS topic_merge_parent_ancestors (
  operation_id UUID NOT NULL REFERENCES topic_merge_operations (id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics (id) ON DELETE RESTRICT,
  depth INTEGER NOT NULL CHECK (depth >= 0),
  cursor_object_id UUID,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (operation_id, topic_id)
);
CREATE INDEX IF NOT EXISTS idx_topic_merge_parent_ancestors__topic_id
ON topic_merge_parent_ancestors (topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_merge_parent_ancestors__pending
ON topic_merge_parent_ancestors (operation_id, topic_id) WHERE completed_at IS NULL;
COMMENT ON TABLE topic_merge_parent_ancestors IS 'Frozen ancestor frontier for bounded preflight of the contracted topic parent graph.';
COMMENT ON COLUMN topic_merge_parent_ancestors.operation_id IS 'Merge operation that reserves this ancestor.';
COMMENT ON COLUMN topic_merge_parent_ancestors.topic_id IS 'Ancestor whose outgoing parent edges remain frozen until operation settlement.';
COMMENT ON COLUMN topic_merge_parent_ancestors.depth IS 'Greatest reached ancestry depth for overflow detection.';
COMMENT ON COLUMN topic_merge_parent_ancestors.cursor_object_id IS 'Keyset comparison position in outgoing parent edges; never joined.';
COMMENT ON COLUMN topic_merge_parent_ancestors.completed_at IS 'Time the current depth expansion finished.';

CREATE TABLE IF NOT EXISTS topic_merge_metric_users (
  operation_id UUID NOT NULL REFERENCES topic_merge_operations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  original_vote_topic_id UUID REFERENCES topics (id) ON DELETE RESTRICT,
  cursor_topic_vote_id UUID,
  topic_vote_score SMALLINT,
  topic_vote_score_is_neutral BOOLEAN NOT NULL DEFAULT FALSE,
  topic_vote_score_is_semantic BOOLEAN NOT NULL DEFAULT FALSE,
  cursor_review_post_id UUID,
  review_rating SMALLINT CHECK (review_rating BETWEEN 1 AND 5),
  PRIMARY KEY (operation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_merge_metric_users__user_id
ON topic_merge_metric_users (user_id);
CREATE INDEX IF NOT EXISTS idx_topic_merge_metric_users__original_vote_topic_id
ON topic_merge_metric_users (original_vote_topic_id);

COMMENT ON TABLE topic_merge_metric_users IS 'Frozen voter collision ownership and current per-user vote and review candidates accumulated through bounded merge pages.';
COMMENT ON COLUMN topic_merge_metric_users.operation_id IS 'Owning topic merge operation.';
COMMENT ON COLUMN topic_merge_metric_users.user_id IS 'Voter or review author whose current signal is accumulated.';
COMMENT ON COLUMN topic_merge_metric_users.original_vote_topic_id IS 'Frozen winner of the voter collision before any source ballot history is moved; null for review-only users.';
COMMENT ON COLUMN topic_merge_metric_users.cursor_topic_vote_id IS 'Ordering marker for the latest topic vote seen on a page.';
COMMENT ON COLUMN topic_merge_metric_users.topic_vote_score IS 'Latest topic vote score for the user.';
COMMENT ON COLUMN topic_merge_metric_users.topic_vote_score_is_neutral IS 'Whether the latest zero score explicitly records a neutral vote.';
COMMENT ON COLUMN topic_merge_metric_users.topic_vote_score_is_semantic IS 'Whether the latest score uses semantic policy.';
COMMENT ON COLUMN topic_merge_metric_users.cursor_review_post_id IS 'Ordering marker for the latest eligible review seen on a page.';
COMMENT ON COLUMN topic_merge_metric_users.review_rating IS 'Rating from the latest eligible review.';

-- search topics by name
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__name__text_pattern_ops
ON topics (LOWER(name) text_pattern_ops);

-- unique index on slug
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics__slug
ON topics (slug);

-- search topics by slug
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__slug__text_pattern_ops
ON topics (slug text_pattern_ops);

-- unique index on name
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics__name
ON topics (LOWER(name));

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__hostname_id
ON topics (hostname_id)
WHERE hostname_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__created_by_id
ON topics (created_by_id)
WHERE created_by_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__updated_by_id
ON topics (updated_by_id)
WHERE updated_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics__content_updated_by_id
ON topics (content_updated_by_id)
WHERE content_updated_by_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__deleted_by_id
ON topics (deleted_by_id)
WHERE deleted_by_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__merged_by_id
ON topics (merged_by_id)
WHERE merged_by_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__homepage_url_id
ON topics (homepage_url_id)
WHERE homepage_url_id IS NOT NULL;

ALTER TABLE url_hostnames
ADD CONSTRAINT fk_url_hostnames_topic_id FOREIGN KEY (topic_id) REFERENCES topics ON DELETE RESTRICT NOT VALID;

ALTER TABLE url_hostnames VALIDATE CONSTRAINT fk_url_hostnames_topic_id;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_url_hostnames__topic_id
ON url_hostnames (topic_id)
WHERE topic_id IS NOT NULL;

COMMENT ON COLUMN url_hostnames.topic_id IS 'The topic associated with this hostname (e.g. the company''s topic page).';

-- text search
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__search_vector
ON topics USING GIN (search_vector)
WHERE deleted_at IS NULL;

-- find existing embeddings by input hash
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__bedrock_nova_multimodal_v1_input_sha256
ON topics (bedrock_nova_multimodal_v1_input_sha256)
WHERE bedrock_nova_multimodal_v1_input_sha256 IS NOT NULL;

-- index embeddings for similarity search (vector_cosine_ops matches <=> queries)
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__bedrock_nova_multimodal_v1_embedding
ON topics USING hnsw (bedrock_nova_multimodal_v1_embedding vector_cosine_ops)
WHERE bedrock_nova_multimodal_v1_embedding IS NOT NULL;

-- find out of date embeddings
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__bedrock_nova_multimodal_v1_to_update
ON topics (id)
WHERE (
  bedrock_nova_multimodal_v1_input_sha256 IS NULL
  OR (bedrock_nova_multimodal_v1_input_sha256 != bedrock_nova_multimodal_v1_content_sha256)
);

-- GIN trigram indexes to support ILIKE '%query%' substring searches
-- (text_pattern_ops B-tree indexes only help prefix matches; pg_trgm is installed)
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__name_trgm
ON topics USING GIN (name gin_trgm_ops)
WHERE deleted_at IS NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__slug_trgm
ON topics USING GIN (slug gin_trgm_ops)
WHERE deleted_at IS NULL;

-- find topics pending language detection
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__lingua_rs_pending
  ON topics (id)
  WHERE lingua_rs_input_sha256 IS NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__hero_image_id
ON topics (hero_image_id)
WHERE hero_image_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__logo_image_id
ON topics (logo_image_id)
WHERE logo_image_id IS NOT NULL;

COMMENT ON TABLE topics IS 'Core content entities: topics, rewards programs, cards, etc. Polymorphic via topic_type.';
COMMENT ON COLUMN topics.topic_type IS 'Discriminator for topic subtype (topic, rewards_program, referral_program, card, rewards_program_status, bank_account, rss_feed, fediverse_instance). Every value must have functional behavior; see docs/requirements/content/TOPICS.md.';
COMMENT ON COLUMN topics.is_noindexed IS 'When true, exclude this topic''s pages from search-engine indexing.';
COMMENT ON COLUMN topics.should_allow_reviews IS 'When false, reviews cannot be created for this topic and review UI is hidden (e.g. private individuals). Replaced the former person topic type.';
COMMENT ON COLUMN topics.name IS 'Canonical display name for this topic.';
COMMENT ON COLUMN topics.slug IS 'URL-safe lowercase slug. Unique.';
COMMENT ON COLUMN topics.aliases IS 'Alternative names for search purposes. Projected by fn_project_topic_aliases from linked topic_aliases.';
COMMENT ON COLUMN topics.markdown IS 'Topic description in markdown format.';
COMMENT ON COLUMN topics.content_updated_at IS 'Timestamp of the latest administrator-authored name or markdown revision, retained independently of revision history.';
COMMENT ON COLUMN topics.content_updated_by_id IS 'Administrator who authored the latest name or markdown revision; cleared when that user is deleted.';
COMMENT ON COLUMN topics.votes_snapshot_xmax IS 'Upper transaction-ID boundary of the PostgreSQL snapshot used for the persisted vote-stat aggregate.';
COMMENT ON COLUMN topics.votes_snapshot_xip_count IS 'Number of transactions still in progress in that vote-stat snapshot; lower is newer when the snapshot xmax is equal.';
COMMENT ON COLUMN topics.merged_into_topic_id IS 'Destination topic after an admin alias/redirect merge.';
COMMENT ON COLUMN topics.merged_at IS 'Timestamp when this source topic was merged into another topic.';
COMMENT ON COLUMN topics.merged_by_id IS 'Administrator who merged this source topic into another topic.';
COMMENT ON COLUMN topics.hostname_id IS 'Associated hostname for this topic (e.g. the company''s website). Multiple topics may share a hostname.';
COMMENT ON COLUMN topics.logo_image_id IS 'Reference to the topic''s logo image.';
COMMENT ON COLUMN topics.hero_image_id IS 'Hero/banner image for the topic, displayed prominently on the topic page.';
COMMENT ON COLUMN topics.homepage_url_id IS 'The official homepage URL for this topic (used for retailers and brands).';

--------------------------------------------------------------------------------
-- topic_metrics
--------------------------------------------------------------------------------

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS topic_metrics (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- we weight the 1s and 5s higher than 2-4s because they are more important
  ratings__score__sort DOUBLE PRECISION GENERATED ALWAYS AS (fn_wilson_score_lower_bound(
    ratings__score__4 * 1 + ratings__score__5 * 2,
    ratings__score__1 * 2 + ratings__score__2 * 1 + ratings__score__3 * 1 + ratings__score__4 * 1 + ratings__score__5 * 2)
  ) STORED,

  ratings__score__1 DOUBLE PRECISION DEFAULT 0,
  ratings__score__2 DOUBLE PRECISION DEFAULT 0,
  ratings__score__3 DOUBLE PRECISION DEFAULT 0,
  ratings__score__4 DOUBLE PRECISION DEFAULT 0,
  ratings__score__5 DOUBLE PRECISION DEFAULT 0,

  ratings__count__1 INT DEFAULT 0,
  ratings__count__2 INT DEFAULT 0,
  ratings__count__3 INT DEFAULT 0,
  ratings__count__4 INT DEFAULT 0,
  ratings__count__5 INT DEFAULT 0,

  ratings__updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ratings__revision BIGINT NOT NULL DEFAULT 0 CHECK (ratings__revision >= 0),

  bookmarks__follow_count INT DEFAULT 0,
  bookmarks__updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_topic_metrics_updated_at
BEFORE UPDATE ON topic_metrics
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- sorting by best ratings
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topic_metrics__ratings__score__sort
ON topic_metrics (ratings__score__sort DESC, topic_id);

COMMENT ON TABLE topic_metrics IS 'Aggregated metrics for topics: rating distributions and bookmark counts.';
COMMENT ON COLUMN topic_metrics.topic_id IS 'The topic these metrics belong to (PK, 1:1 with topics).';
COMMENT ON COLUMN topic_metrics.ratings__score__sort IS 'Wilson score lower bound for sorting. Generated from weighted rating scores.';
COMMENT ON COLUMN topic_metrics.ratings__score__1 IS 'Weighted score sum for 1-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__score__2 IS 'Weighted score sum for 2-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__score__3 IS 'Weighted score sum for 3-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__score__4 IS 'Weighted score sum for 4-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__score__5 IS 'Weighted score sum for 5-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__count__1 IS 'Number of 1-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__count__2 IS 'Number of 2-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__count__3 IS 'Number of 3-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__count__4 IS 'Number of 4-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__count__5 IS 'Number of 5-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__updated_at IS 'When the rating metrics were last recalculated.';
COMMENT ON COLUMN topic_metrics.ratings__revision IS 'Monotonic reconciliation fence advanced by every completed rating refresh and merge rating write.';
COMMENT ON COLUMN topic_metrics.bookmarks__follow_count IS 'Number of users who bookmarked/follow this topic.';
COMMENT ON COLUMN topic_metrics.bookmarks__updated_at IS 'When the bookmark count was last recalculated.';

-- Function to auto-create topic_metrics row when topic is created

-- Trigger to create topic_metrics after topic insert
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_create_topic_metrics
AFTER INSERT ON topics
FOR EACH ROW
EXECUTE FUNCTION fn_create_metrics('topic_metrics', 'topic_id');

--------------------------------------------------------------------------------
-- rewards_program_topics
--------------------------------------------------------------------------------

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS rewards_program_topics (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,

  company_topic_id UUID REFERENCES topics ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_rewards_program_topics_updated_at
BEFORE UPDATE ON rewards_program_topics
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_rewards_program_topics__company_topic_id__topic_id
ON rewards_program_topics (company_topic_id, topic_id)
WHERE company_topic_id IS NOT NULL;

COMMENT ON TABLE rewards_program_topics IS 'Extension table for topics of type rewards_program. Links program to its parent company.';
COMMENT ON COLUMN rewards_program_topics.topic_id IS 'The topic that is a rewards program (PK, 1:1 with topics).';
COMMENT ON COLUMN rewards_program_topics.company_topic_id IS 'The company topic that operates this rewards program.';

--------------------------------------------------------------------------------
-- referral_program_topics
--------------------------------------------------------------------------------

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS referral_program_topics (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,

  -- the company that owns this referral program
  company_topic_id UUID REFERENCES topics ON DELETE CASCADE,

  enabled_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  disabled_at TIMESTAMPTZ,
  CHECK (NOT (enabled_at IS NOT NULL AND disabled_at IS NOT NULL)),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_referral_program_topics_updated_at
BEFORE UPDATE ON referral_program_topics
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_referral_program_topics__company_topic_id__topic_id
ON referral_program_topics (company_topic_id, topic_id)
WHERE company_topic_id IS NOT NULL;

COMMENT ON TABLE referral_program_topics IS 'Extension table for topics of type referral_program. Links program to company.';
COMMENT ON COLUMN referral_program_topics.topic_id IS 'The topic that is a referral program (PK, 1:1 with topics).';
COMMENT ON COLUMN referral_program_topics.company_topic_id IS 'The company topic that operates this referral program.';
COMMENT ON COLUMN referral_program_topics.enabled_at IS 'When the program was enabled. NULL if currently disabled.';
COMMENT ON COLUMN referral_program_topics.disabled_at IS 'When the program was disabled. NULL if currently enabled.';

--------------------------------------------------------------------------------
-- topics: add rewards_program_topic_id and referral_program_topic_id
-- (defined here because the referenced extension tables must exist first)
--------------------------------------------------------------------------------

ALTER TABLE topics ADD CONSTRAINT fk_topics_rewards_program_topic_id FOREIGN KEY (rewards_program_topic_id) REFERENCES rewards_program_topics ON DELETE SET NULL NOT VALID;
ALTER TABLE topics ADD CONSTRAINT fk_topics_referral_program_topic_id FOREIGN KEY (referral_program_topic_id) REFERENCES referral_program_topics ON DELETE SET NULL NOT VALID;

ALTER TABLE topics VALIDATE CONSTRAINT fk_topics_rewards_program_topic_id;
ALTER TABLE topics VALIDATE CONSTRAINT fk_topics_referral_program_topic_id;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__rewards_program_topic_id__id
ON topics (rewards_program_topic_id, id)
WHERE rewards_program_topic_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__referral_program_topic_id__id
ON topics (referral_program_topic_id, id)
WHERE referral_program_topic_id IS NOT NULL;

COMMENT ON COLUMN topics.rewards_program_topic_id IS 'The rewards program this topic is associated with. Any topic type can link to a rewards program.';
COMMENT ON COLUMN topics.referral_program_topic_id IS 'The referral program this topic is associated with. Any topic type can link to a referral program.';

--------------------------------------------------------------------------------
-- card_topics
--------------------------------------------------------------------------------

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS card_topics (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,

  -- the bank that issues this card, e.g. Chase, Citi, etc.
  bank_topic_id UUID REFERENCES topics ON DELETE CASCADE,
  -- the brand of the card, e.g. Marriott, Hilton, etc.
  brand_topic_id UUID REFERENCES topics ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  annual_fee_minor_units BIGINT,
  CHECK (annual_fee_minor_units BETWEEN 0 AND 9007199254740991),
  currency_code currency_codes REFERENCES currencies(code) ON DELETE RESTRICT,
  CHECK ((annual_fee_minor_units IS NULL) = (currency_code IS NULL))
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_card_topics_updated_at
BEFORE UPDATE ON card_topics
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_card_topics__bank_topic_id__topic_id
ON card_topics (bank_topic_id, topic_id)
WHERE bank_topic_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_card_topics__brand_topic_id__topic_id
ON card_topics (brand_topic_id, topic_id)
WHERE brand_topic_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_card_topics__currency_code
ON card_topics (currency_code)
WHERE currency_code IS NOT NULL;

COMMENT ON TABLE card_topics IS 'Extension table for topics of type card (credit/debit cards).';
COMMENT ON COLUMN card_topics.topic_id IS 'The topic that is a card (PK, 1:1 with topics).';
COMMENT ON COLUMN card_topics.bank_topic_id IS 'The issuing bank topic (e.g. Chase, Citi).';
COMMENT ON COLUMN card_topics.brand_topic_id IS 'The co-brand topic (e.g. Marriott, Hilton).';
COMMENT ON COLUMN card_topics.annual_fee_minor_units IS 'Annual fee in the currency minor unit. NULL if unknown.';
COMMENT ON COLUMN card_topics.currency_code IS 'Currency for the annual fee. NULL when the fee is unknown.';

--------------------------------------------------------------------------------
-- rewards_program_status_topics
--------------------------------------------------------------------------------

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS rewards_program_status_topics (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,

  -- if set, this points to the lifetime version of this status
  -- e.g. if this is "Hyatt Globalist", this will point to "Hyatt Lifetime Globalist"
  lifetime_version_id UUID REFERENCES rewards_program_status_topics ON DELETE CASCADE,

  -- order_index ASC for lowest tier to highest tier
  order_index SMALLINT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_rewards_program_status_topics_updated_at
BEFORE UPDATE ON rewards_program_status_topics
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- only one lifetime version per rewards program status
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_rewards_program_status_topics__lifetime_version_id
ON rewards_program_status_topics (lifetime_version_id)
WHERE lifetime_version_id IS NOT NULL;

COMMENT ON TABLE rewards_program_status_topics IS 'Extension table for topics of type rewards_program_status (e.g. Marriott Platinum Elite).';
COMMENT ON COLUMN rewards_program_status_topics.topic_id IS 'The topic that is a rewards program status (PK, 1:1 with topics).';
COMMENT ON COLUMN rewards_program_status_topics.lifetime_version_id IS 'Points to the lifetime version of this status (e.g. Hyatt Lifetime Globalist).';
COMMENT ON COLUMN rewards_program_status_topics.order_index IS 'Sort order: lowest tier = 0, ascending for higher tiers.';

--------------------------------------------------------------------------------
-- spending_category_topics
--------------------------------------------------------------------------------

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS spending_category_topics (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,

  -- e.g. Restaurants (Foreign Transaction)
  is_foreign_transaction BOOLEAN NOT NULL DEFAULT FALSE,

  -- the default spending frequency type for this spending category
  default_spending_frequency spending_frequencies NOT NULL DEFAULT 'monthly',

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_spending_category_topics_updated_at
BEFORE UPDATE ON spending_category_topics
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE spending_category_topics IS 'Extension table for spending category topics (e.g. Restaurants, Gas, Travel).';
COMMENT ON COLUMN spending_category_topics.topic_id IS 'The topic that is a spending category (PK, 1:1 with topics).';
COMMENT ON COLUMN spending_category_topics.is_foreign_transaction IS 'Whether this category applies to foreign transactions.';
COMMENT ON COLUMN spending_category_topics.default_spending_frequency IS 'Default frequency for spending in this category (monthly or annually).';

--------------------------------------------------------------------------------
-- topic_aliases
--------------------------------------------------------------------------------

-- An alias may be unlinked while it is used as a standalone hashtag. Application
-- validation owns hashtag grammar so the grammar can evolve without a schema change.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS topic_aliases (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  topic_id UUID REFERENCES topics ON DELETE RESTRICT,
  -- Set together when an administrator accepts an unlink. topic_id is cleared immediately so
  -- readers treat the alias as unlinked; unlink_topic_id keeps the detached topic until the
  -- bounded jobs finish. A hashtag row stays after those timestamps are cleared.
  unlink_requested_at TIMESTAMPTZ,
  unlink_topic_id UUID REFERENCES topics ON DELETE RESTRICT,
  alias TEXT NOT NULL,
  CHECK (char_length(alias) <= 255),
  CHECK (alias = LOWER(alias)),
  CHECK (alias = TRIM(alias)),
  CHECK ((unlink_requested_at IS NULL) = (unlink_topic_id IS NULL)),

  search_vector TSVECTOR GENERATED ALWAYS AS (setweight(to_tsvector('voucha_english', alias), 'A')) STORED,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID REFERENCES users ON DELETE SET NULL,

  UNIQUE (alias)
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_topic_aliases_updated_at
BEFORE UPDATE ON topic_aliases
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_project_topic_aliases() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  affected_topic_ids UUID[];
  affected_topic_id UUID;
  removed_aliases TEXT[];
  added_aliases TEXT[];
BEGIN
  -- The operation accumulates the exact final projection in its alias history document.
  -- Its private transaction capability is checked against the durable reservation.
  IF EXISTS (
    SELECT 1 FROM topic_merge_operations operation
    WHERE operation.id::TEXT = current_setting('voucha.topic_merge_operation_id', TRUE)
      AND operation.fence_token::TEXT = current_setting('voucha.topic_merge_fence_token', TRUE)
      AND operation.completed_at IS NULL AND operation.failed_at IS NULL
  ) THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT ARRAY_AGG(DISTINCT topic_id) INTO affected_topic_ids FROM new_aliases;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT ARRAY_AGG(DISTINCT topic_id) INTO affected_topic_ids FROM old_aliases;
  ELSE
    SELECT ARRAY_AGG(DISTINCT topic_id) INTO affected_topic_ids FROM (
      SELECT topic_id FROM new_aliases UNION SELECT topic_id FROM old_aliases
    ) affected;
  END IF;
  -- Serialize each parent and apply only this statement's transition rows. Re-reading every
  -- destination alias after each bounded merge page would make the merge quadratic.
  FOR affected_topic_id IN
    SELECT id FROM topics WHERE id = ANY(affected_topic_ids) ORDER BY id FOR NO KEY UPDATE
  LOOP
    removed_aliases := '{}'::TEXT[];
    added_aliases := '{}'::TEXT[];
    IF TG_OP <> 'INSERT' THEN
      SELECT COALESCE(ARRAY_AGG(alias), '{}'::TEXT[]) INTO removed_aliases
      FROM old_aliases WHERE topic_id = affected_topic_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT COALESCE(ARRAY_AGG(alias), '{}'::TEXT[]) INTO added_aliases
      FROM new_aliases WHERE topic_id = affected_topic_id;
    END IF;
    UPDATE topics SET aliases = ARRAY(
      SELECT alias FROM (
        SELECT existing.alias FROM UNNEST(topics.aliases) AS existing(alias)
        WHERE existing.alias <> ALL(removed_aliases)
        UNION
        SELECT added.alias FROM UNNEST(added_aliases) AS added(alias)
      ) next_aliases ORDER BY alias
    ) WHERE id = affected_topic_id;
  END LOOP;
  RETURN NULL;
END;
$$;
COMMENT ON FUNCTION fn_project_topic_aliases() IS 'Applies bounded alias transition rows to each affected topic search cache in lexical order.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_topic_aliases_project_insert
AFTER INSERT ON topic_aliases REFERENCING NEW TABLE AS new_aliases
FOR EACH STATEMENT EXECUTE FUNCTION fn_project_topic_aliases();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_topic_aliases_project_update
AFTER UPDATE ON topic_aliases REFERENCING NEW TABLE AS new_aliases OLD TABLE AS old_aliases
FOR EACH STATEMENT EXECUTE FUNCTION fn_project_topic_aliases();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_topic_aliases_project_delete
AFTER DELETE ON topic_aliases REFERENCING OLD TABLE AS old_aliases
FOR EACH STATEMENT EXECUTE FUNCTION fn_project_topic_aliases();

-- finding aliases by topic
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topic_aliases__topic_id
ON topic_aliases (topic_id, alias)
WHERE topic_id IS NOT NULL;

-- search by prefix for searching aliases
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topic_aliases__alias__text_pattern_ops
ON topic_aliases (LOWER(alias) text_pattern_ops);

-- full text search for aliases
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topic_aliases__search_vector
ON topic_aliases USING GIN (search_vector);

-- indexes for foreign keys
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topic_aliases__created_by_id
ON topic_aliases (created_by_id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topic_aliases__updated_by_id
ON topic_aliases (updated_by_id);

-- Resumes an accepted unlink without scanning aliases that are not pending.
CREATE INDEX IF NOT EXISTS idx_topic_aliases__unlink_requested
ON topic_aliases (id)
WHERE unlink_requested_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topic_aliases__unlink_topic_id
ON topic_aliases (unlink_topic_id, id)
WHERE unlink_topic_id IS NOT NULL;

COMMENT ON TABLE topic_aliases IS 'Topic aliases and standalone hashtags. Linked aliases are synced to topics.aliases.';

CREATE TABLE IF NOT EXISTS topic_merge_operation_aliases (
  operation_id UUID NOT NULL REFERENCES topic_merge_operations (id) ON DELETE CASCADE,
  alias_id UUID NOT NULL REFERENCES topic_aliases (id) ON DELETE RESTRICT,
  PRIMARY KEY (operation_id, alias_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_merge_operation_aliases__alias_id
ON topic_merge_operation_aliases (alias_id);


COMMENT ON TABLE topic_merge_operation_aliases IS 'Concrete alias identities moved by a merge, retained for bounded post-commit cache invalidation.';
COMMENT ON COLUMN topic_merge_operation_aliases.operation_id IS 'Merge operation that moved this alias.';
COMMENT ON COLUMN topic_merge_operation_aliases.alias_id IS 'Alias identity whose cache keys need invalidation.';
COMMENT ON COLUMN topic_aliases.topic_id IS 'The linked topic. NULL identifies a standalone hashtag or an alias whose unlink has been accepted.';
COMMENT ON COLUMN topic_aliases.unlink_requested_at IS 'When an administrator accepted unlinking. NULL means the alias is not waiting on bounded deletion.';
COMMENT ON COLUMN topic_aliases.unlink_topic_id IS 'Topic detached by the accepted unlink. NULL exactly when unlink_requested_at is NULL.';
COMMENT ON COLUMN topic_aliases.alias IS 'Lowercase canonical alias or hashtag lookup key. Unique globally.';

-- Durable, coalesced work for category mappings changed by a linked alias. This intentionally has
-- no foreign key: a linked alias DELETE must leave a tombstone for asynchronous cleanup.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TYPE topic_alias_category_reconciliation_phases AS ENUM (
  'rss_item_categories', 'rss_item_text_categories', 'rss_feed_text_categories', 'completed'
);

CREATE TABLE IF NOT EXISTS topic_alias_category_mapping_reconciliations (
  topic_alias_id UUID PRIMARY KEY,
  alias TEXT NOT NULL,
  generation BIGINT NOT NULL DEFAULT 1 CHECK (generation > 0),
  unlink_requested_at TIMESTAMPTZ,
  phase topic_alias_category_reconciliation_phases NOT NULL DEFAULT 'rss_item_categories',
  sweep_upper_bound_item_id UUID,
  sweep_upper_bound_feed_id UUID,
  cursor_item_id UUID,
  cursor_category_identity_id UUID,
  cursor_feed_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_topic_alias_category_mapping_reconciliations_updated_at
BEFORE UPDATE ON topic_alias_category_mapping_reconciliations
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topic_alias_category_mapping_reconciliations__updated_at
ON topic_alias_category_mapping_reconciliations (updated_at, topic_alias_id)
WHERE unlink_requested_at IS NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_project_mark_topic_alias_category_mapping_dirty()
RETURNS TRIGGER AS $$
DECLARE
  dirty_alias_id UUID;
  dirty_alias TEXT;
  dirty_unlink_requested_at TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.topic_id IS NULL THEN
      RETURN NEW;
    END IF;
    dirty_alias_id := NEW.id;
    dirty_alias := NEW.alias;
    dirty_unlink_requested_at := NEW.unlink_requested_at;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.topic_id IS NOT DISTINCT FROM OLD.topic_id
      AND NEW.unlink_requested_at IS NOT DISTINCT FROM OLD.unlink_requested_at THEN
      RETURN NEW;
    END IF;
    dirty_alias_id := NEW.id;
    dirty_alias := NEW.alias;
    dirty_unlink_requested_at := NEW.unlink_requested_at;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.topic_id IS NULL AND OLD.unlink_requested_at IS NULL THEN
      RETURN OLD;
    END IF;
    dirty_alias_id := OLD.id;
    dirty_alias := OLD.alias;
    dirty_unlink_requested_at := NULL;
  END IF;

  INSERT INTO topic_alias_category_mapping_reconciliations
    (topic_alias_id, alias, unlink_requested_at)
  VALUES (dirty_alias_id, dirty_alias, dirty_unlink_requested_at)
  ON CONFLICT (topic_alias_id) DO UPDATE
  SET alias = EXCLUDED.alias,
      unlink_requested_at = EXCLUDED.unlink_requested_at,
      generation = topic_alias_category_mapping_reconciliations.generation + 1,
      phase = 'rss_item_categories',
      sweep_upper_bound_item_id = NULL,
      sweep_upper_bound_feed_id = NULL,
      cursor_item_id = NULL,
      cursor_category_identity_id = NULL,
      cursor_feed_id = NULL;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_topic_aliases_mark_category_mapping_dirty
AFTER INSERT OR UPDATE OF topic_id, unlink_requested_at OR DELETE ON topic_aliases
FOR EACH ROW
EXECUTE FUNCTION fn_project_mark_topic_alias_category_mapping_dirty();

COMMENT ON TABLE topic_alias_category_mapping_reconciliations IS 'Coalesced cleanup/backfill work for linked topic aliases; delete tombstones have no FK by design.';
COMMENT ON COLUMN topic_alias_category_mapping_reconciliations.topic_alias_id IS 'Alias transition identity; the primary key coalesces pending work for the same alias.';
COMMENT ON COLUMN topic_alias_category_mapping_reconciliations.alias IS 'Canonical alias retained without a foreign key so delete tombstones can clear stale category mappings.';
COMMENT ON COLUMN topic_alias_category_mapping_reconciliations.generation IS 'Monotonic transition generation used to prevent stale workers from acknowledging newer alias ownership changes.';
COMMENT ON COLUMN topic_alias_category_mapping_reconciliations.unlink_requested_at IS 'Copied alias unlink request timestamp while the dedicated unlink phase owns category cleanup; NULL is selectable work.';
COMMENT ON COLUMN topic_alias_category_mapping_reconciliations.phase IS 'Raw category stream for this alias generation: authored item, text item, text feed, or complete.';
COMMENT ON COLUMN topic_alias_category_mapping_reconciliations.sweep_upper_bound_item_id IS 'Fixed highest item ID admitted by this generation; the nil UUID means there were no items.';
COMMENT ON COLUMN topic_alias_category_mapping_reconciliations.sweep_upper_bound_feed_id IS 'Fixed highest feed ID admitted by this generation; the nil UUID means there were no feeds.';
COMMENT ON COLUMN topic_alias_category_mapping_reconciliations.cursor_item_id IS 'Last raw item key scanned by this generation; the cursor may outlive the item and keeps empty pages progressing.';
COMMENT ON COLUMN topic_alias_category_mapping_reconciliations.cursor_category_identity_id IS 'Category identity tie breaker within the last raw item key scanned; a deleted identity does not prevent progress.';
COMMENT ON COLUMN topic_alias_category_mapping_reconciliations.cursor_feed_id IS 'Last raw feed key scanned by this generation; the cursor may outlive the feed and keeps empty pages progressing.';

--------------------------------------------------------------------------------
-- retailer_topics
--------------------------------------------------------------------------------

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS retailer_topics (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_retailer_topics_updated_at
BEFORE UPDATE ON retailer_topics
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE retailer_topics IS 'Extension table for topics of type retailer, representing a store or marketplace that sells products.';
COMMENT ON COLUMN retailer_topics.topic_id IS 'The topic representing this retailer.';

--------------------------------------------------------------------------------
-- fediverse_instance_topics
--------------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE fediverse_integration_statuses AS ENUM (
  'pending',
  'approved',
  'blocked'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- NodeInfo-derived classification for topics of type fediverse_instance. `integration_status`
-- is declared here but trigger-maintained from an append-only allowlist-decision history table
-- added by a later migration (see docs/overview/architecture/fediverse-federation.md) — do not
-- write to it directly.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS fediverse_instance_topics (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,

  software TEXT,
  protocol TEXT,
  nodeinfo_software_version TEXT,
  total_users INTEGER,
  monthly_active_users INTEGER,
  is_open_for_registrations BOOLEAN,
  nodeinfo_raw JSONB,

  integration_status fediverse_integration_statuses NOT NULL DEFAULT 'pending',

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_fediverse_instance_topics_updated_at
BEFORE UPDATE ON fediverse_instance_topics
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE fediverse_instance_topics IS 'Extension table for topics of type fediverse_instance. NodeInfo-derived classification plus admin allowlist state for a federated server.';
COMMENT ON COLUMN fediverse_instance_topics.topic_id IS 'The topic that is a fediverse instance (PK, 1:1 with topics).';
COMMENT ON COLUMN fediverse_instance_topics.software IS 'NodeInfo software.name (e.g. mastodon, lemmy, peertube). NULL until classified.';
COMMENT ON COLUMN fediverse_instance_topics.protocol IS 'Primary federation protocol reported by NodeInfo (e.g. activitypub). NULL until classified.';
COMMENT ON COLUMN fediverse_instance_topics.nodeinfo_software_version IS 'NodeInfo software.version string. NULL until classified.';
COMMENT ON COLUMN fediverse_instance_topics.total_users IS 'NodeInfo usage.users.total. NULL until classified or unreported.';
COMMENT ON COLUMN fediverse_instance_topics.monthly_active_users IS 'NodeInfo usage.users.activeMonth. NULL until classified or unreported.';
COMMENT ON COLUMN fediverse_instance_topics.is_open_for_registrations IS 'NodeInfo openRegistrations flag. NULL until classified.';
COMMENT ON COLUMN fediverse_instance_topics.nodeinfo_raw IS 'Full NodeInfo 2.0 document as fetched, for fields not individually modeled.';
COMMENT ON COLUMN fediverse_instance_topics.integration_status IS 'Admin allowlist decision (pending, approved, blocked). Trigger-maintained from an append-only decision history table.';

-- Only one active (non-deleted, non-merged) fediverse_instance topic per hostname.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics__fediverse_instance__hostname_id
ON topics (hostname_id)
WHERE topic_type = 'fediverse_instance' AND deleted_at IS NULL AND merged_into_topic_id IS NULL;

--------------------------------------------------------------------------------
-- fediverse_instance_integration_changes
--------------------------------------------------------------------------------

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS fediverse_instance_integration_changes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  topic_id UUID NOT NULL REFERENCES topics ON DELETE CASCADE,
  change_type fediverse_integration_statuses NOT NULL,
  changed_by_id UUID REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  reason TEXT,
  CHECK (reason IS NULL OR char_length(reason) <= 1000),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_fediverse_instance_integration_changes__topic_id__id
  ON fediverse_instance_integration_changes (topic_id, id DESC);
COMMENT ON TABLE fediverse_instance_integration_changes IS 'Append-only audit log of admin allowlist decisions for fediverse_instance topics. Current state is the latest row per topic_id.';
COMMENT ON COLUMN fediverse_instance_integration_changes.topic_id IS 'The fediverse_instance topic whose admin allowlist state changed.';
COMMENT ON COLUMN fediverse_instance_integration_changes.change_type IS 'The allowlist decision (pending, approved, blocked) after this change.';
COMMENT ON COLUMN fediverse_instance_integration_changes.changed_by_id IS 'Admin user who made this allowlist decision.';
COMMENT ON COLUMN fediverse_instance_integration_changes.reason IS 'Optional human-readable reason for the allowlist decision.';

-- Keep fediverse_instance_topics.integration_status in sync with the latest
-- fediverse_instance_integration_changes row. Reads the MAX-id row rather than
-- trusting NEW.integration_status to defend against out-of-order transaction
-- commits on the same topic.

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_sync_fediverse_instance_integration_status
AFTER INSERT ON fediverse_instance_integration_changes
FOR EACH ROW
EXECUTE FUNCTION fn_project_latest_change('fediverse_instance_topics', 'topic_id', 'topic_id', 'integration_status', 'change_type');

-- ==========================================================================
-- 0160-00-00-review-snippet-categories.sql
-- ============================================================================

-- Review Snippet Categories - seed 20 canonical category topics
-- Categories are used to map topics to schema.org types for Google Review Snippets

-- 1. Insert category topics
-- Using digest() from pgcrypto extension (already installed for embeddings)
INSERT INTO topics (created_via, id, name, slug, bedrock_nova_multimodal_v1_content_sha256)
VALUES
  ('system', uuidv7(), 'Voucha', 'voucha', digest('Voucha' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Books', 'books', digest('Books' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Courses', 'courses', digest('Courses' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Events', 'events', digest('Events' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Local Businesses', 'local-businesses', digest('Local Businesses' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Movies', 'movies', digest('Movies' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Products', 'products', digest('Products' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Software Products', 'software-products', digest('Software Products' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Hardware Products', 'hardware-products', digest('Hardware Products' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Recipes', 'recipes', digest('Recipes' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Creative Work Seasons', 'creative-work-seasons', digest('Creative Work Seasons' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'TV Show Seasons', 'tv-show-seasons', digest('TV Show Seasons' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Creative Work Series', 'creative-work-series', digest('Creative Work Series' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'TV Shows', 'tv-shows', digest('TV Shows' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Creative Work Episodes', 'creative-work-episodes', digest('Creative Work Episodes' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'TV Show Episodes', 'tv-show-episodes', digest('TV Show Episodes' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Games', 'games', digest('Games' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Songs', 'songs', digest('Songs' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Playlists', 'playlists', digest('Playlists' || E'\n\n', 'sha256')),
  ('system', uuidv7(), 'Organizations', 'organizations', digest('Organizations' || E'\n\n', 'sha256'))
ON CONFLICT DO NOTHING;

-- Every active topic's current slug is an alias. Runtime creates and slug updates maintain this;
-- this seed closes the same invariant for bootstrap topics and a staging reset.
INSERT INTO topic_aliases (topic_id, alias)
SELECT id, slug
FROM topics
WHERE deleted_at IS NULL
  AND merged_into_topic_id IS NULL
ON CONFLICT (alias) DO UPDATE
SET topic_id = EXCLUDED.topic_id
WHERE topic_aliases.topic_id IS NULL OR topic_aliases.topic_id = EXCLUDED.topic_id;



-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_topics__created_via_oauth_client_id
  ON topics (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

-- 2. Insert singular aliases
-- Extract topic IDs from the topics we just inserted
INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'book' FROM topics t WHERE t.slug = 'books' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'course' FROM topics t WHERE t.slug = 'courses' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'event' FROM topics t WHERE t.slug = 'events' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'local business' FROM topics t WHERE t.slug = 'local-businesses' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'movie' FROM topics t WHERE t.slug = 'movies' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'product' FROM topics t WHERE t.slug = 'products' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'software product' FROM topics t WHERE t.slug = 'software-products' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'hardware product' FROM topics t WHERE t.slug = 'hardware-products' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'recipe' FROM topics t WHERE t.slug = 'recipes' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'creative work season' FROM topics t WHERE t.slug = 'creative-work-seasons' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'tv show season' FROM topics t WHERE t.slug = 'tv-show-seasons' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'creative work series' FROM topics t WHERE t.slug = 'creative-work-series' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'tv series' FROM topics t WHERE t.slug = 'tv-shows' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'creative work episode' FROM topics t WHERE t.slug = 'creative-work-episodes' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'tv show episode' FROM topics t WHERE t.slug = 'tv-show-episodes' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'game' FROM topics t WHERE t.slug = 'games' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'song' FROM topics t WHERE t.slug = 'songs' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'playlist' FROM topics t WHERE t.slug = 'playlists' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'organization' FROM topics t WHERE t.slug = 'organizations' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

UPDATE topics topic
SET aliases = COALESCE(
  (SELECT ARRAY_AGG(alias ORDER BY alias) FROM topic_aliases WHERE topic_id = topic.id),
  '{}'::TEXT[]
)
WHERE topic.deleted_at IS NULL
  AND topic.merged_into_topic_id IS NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_ensure_fediverse_instance_integration_changes_actor BEFORE INSERT ON fediverse_instance_integration_changes FOR EACH ROW EXECUTE FUNCTION fn_ensure_retained_actor_identity('changed_by_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_fediverse_instance_integration_changes_append_only BEFORE UPDATE OR DELETE ON fediverse_instance_integration_changes FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_fediverse_instance_integration_changes__changed_by_id ON fediverse_instance_integration_changes(changed_by_id) WHERE changed_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics__merged_into_topic_id__id ON topics(merged_into_topic_id,id) WHERE merged_into_topic_id IS NOT NULL;
