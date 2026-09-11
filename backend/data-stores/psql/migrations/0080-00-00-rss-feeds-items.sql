-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: added declared_language to rss_feeds; added language detection columns to rss_feed_items
-- edited-in-place: added ignore_robots_txt to rss_feeds
-- edited-in-place: added unreliable_status_codes to rss_feeds
-- edited-in-place: added media:description to rss_feed_items.search_vector and skipped blank content fields
-- edited-in-place: swapped 'english' to 'voucha_english' text search config (unaccent support); added idx_rss_feeds__title_trgm
-- Merged from: 0015-00-00-rss-feeds.sql, 0360-00-00-rss-feed-source-management.sql, 0370-00-00-rss-feed-open-source-creation.sql, 0380-00-00-sanitize-rss-feed-item-dates.sql, 0420-00-00-explain-analyze-query-indexes.sql

-- ==========================================================================
-- 0015-00-00-rss-feeds.sql
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE rss_feed_content_types AS ENUM ('article', 'podcast', 'video', 'mixed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS rss_feeds (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  rss_feed_url_id UUID NOT NULL REFERENCES urls ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics ON DELETE RESTRICT, -- the owner of this feed
  title TEXT,
  CHECK (char_length(title) <= 255),
  CHECK (title = TRIM(title)),

  -- for pulling the feed
  last_modified_at TIMESTAMPTZ,
  etag TEXT,
  last_fetched_at TIMESTAMPTZ,

  -- canonical redirect chain: set when this feed is a 301/308 redirect to another feed
  canonical_rss_feed_id UUID REFERENCES rss_feeds ON DELETE SET NULL,
  CHECK (canonical_rss_feed_id IS NULL OR canonical_rss_feed_id != id),

  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('voucha_english', COALESCE(title, '')), 'A')
  ) STORED,

  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  feed_type rss_feed_content_types NOT NULL DEFAULT 'article',
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_discoverable BOOLEAN NOT NULL DEFAULT FALSE,
  declared_language TEXT CHECK (declared_language IS NULL OR (declared_language = LOWER(declared_language) AND LENGTH(declared_language) <= 10)),
  ignore_robots_txt BOOLEAN, -- whether robots.txt allow/disallow rules are ignored for this specific feed. NULL = inherit from hostname or global config
  unreliable_status_codes SMALLINT[] -- RSS fetch HTTP status codes that should retry instead of soft-deleting this feed. NULL = inherit from hostname; empty array = no override statuses
);

CREATE OR REPLACE TRIGGER trigger_rss_feeds_updated_at
BEFORE UPDATE ON rss_feeds
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- feeds must be unique by rss feed url
CREATE UNIQUE INDEX IF NOT EXISTS idx_rss_feeds__rss_feed_url_id
ON rss_feeds (rss_feed_url_id)
WHERE deleted_at IS NULL;

-- RI-usable index for the rss_feed_url_id FK (the unique index above is partial, so it isn't RI-usable)
CREATE INDEX IF NOT EXISTS idx_rss_feeds__rss_feed_url_id_bare
ON rss_feeds (rss_feed_url_id);

-- for finding feeds by topic
CREATE INDEX IF NOT EXISTS idx_rss_feeds__topic_id
ON rss_feeds (topic_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rss_feeds__topic_id__unique
ON rss_feeds (topic_id)
WHERE deleted_at IS NULL;

-- for searching feeds by text
CREATE INDEX IF NOT EXISTS idx_rss_feeds__search_vector
ON rss_feeds USING GIN (search_vector)
WHERE deleted_at IS NULL;

-- backs the LOWER(title) LIKE LOWER('%…%') substring fallback in searchRssFeeds; LOWER() defeats
-- a plain-column trigram index, so the expression itself must be indexed
CREATE INDEX IF NOT EXISTS idx_rss_feeds__title_trgm
ON rss_feeds USING GIN (LOWER(title) gin_trgm_ops)
WHERE deleted_at IS NULL;

-- for filtering feeds by type
CREATE INDEX IF NOT EXISTS idx_rss_feeds__feed_type
ON rss_feeds (feed_type)
WHERE deleted_at IS NULL;

-- for walking canonical redirect chains
CREATE INDEX IF NOT EXISTS idx_rss_feeds__canonical_rss_feed_id
ON rss_feeds (canonical_rss_feed_id)
WHERE canonical_rss_feed_id IS NOT NULL;

-- for fast feed-enabled checks without joining enablement_changes
CREATE INDEX IF NOT EXISTS idx_rss_feeds__is_enabled
ON rss_feeds (id)
WHERE is_enabled = TRUE AND deleted_at IS NULL;

-- for public feed queries that require both current-state gates
CREATE INDEX IF NOT EXISTS idx_rss_feeds__enabled__discoverable
ON rss_feeds (id)
WHERE is_enabled = TRUE AND is_discoverable = TRUE AND deleted_at IS NULL;

COMMENT ON TABLE rss_feeds IS 'RSS/Atom feeds associated with topics. Each topic has at most one active feed.';
COMMENT ON COLUMN rss_feeds.rss_feed_url_id IS 'The URL of the RSS/Atom feed.';
COMMENT ON COLUMN rss_feeds.topic_id IS 'The topic that owns this feed.';
COMMENT ON COLUMN rss_feeds.title IS 'Display title of the feed.';
COMMENT ON COLUMN rss_feeds.last_modified_at IS 'HTTP Last-Modified header from the last successful fetch.';
COMMENT ON COLUMN rss_feeds.etag IS 'HTTP ETag header from the last successful fetch.';
COMMENT ON COLUMN rss_feeds.last_fetched_at IS 'When the feed was last fetched (successful or not).';
COMMENT ON COLUMN rss_feeds.feed_type IS 'Content type of the feed: article, podcast, video, or mixed.';
COMMENT ON COLUMN rss_feeds.is_enabled IS 'Whether this feed is enabled for fetching. Denormalized from rss_feed_enablement_changes for query performance; kept in sync by trigger_sync_rss_feed_is_enabled.';
COMMENT ON COLUMN rss_feeds.is_discoverable IS 'Whether this feed is publicly discoverable. Denormalized from rss_feed_discoverability_changes for query performance; kept in sync by trigger_sync_rss_feed_is_discoverable.';
COMMENT ON COLUMN rss_feeds.canonical_rss_feed_id IS 'The canonical feed this feed permanently redirects to (HTTP 301/308). NULL if this is the canonical feed.';
COMMENT ON COLUMN rss_feeds.ignore_robots_txt IS 'Whether robots.txt allow/disallow rules are ignored for fetching this RSS feed. NULL = inherit from hostname then global DynamicConfig. TRUE = always ignore. FALSE = always enforce.';
COMMENT ON COLUMN rss_feeds.unreliable_status_codes IS 'RSS feed fetch HTTP status codes that should retry instead of soft-deleting this feed. NULL = inherit from hostname. Empty array = no unreliable statuses, overriding hostname defaults.';
COMMENT ON COLUMN rss_feeds.declared_language IS 'Feed-declared language from <language> or xml:lang element';

CREATE TABLE IF NOT EXISTS rss_feed_discoverability_changes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  rss_feed_id UUID NOT NULL REFERENCES rss_feeds ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  reason TEXT,
  CHECK (reason IS NULL OR char_length(reason) <= 1000),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);
CREATE INDEX IF NOT EXISTS idx_rss_feed_discoverability_changes__rss_feed_id__id
  ON rss_feed_discoverability_changes (rss_feed_id, id DESC);
COMMENT ON TABLE rss_feed_discoverability_changes IS 'Append-only audit log of discoverability state for RSS feeds. Current state is the latest row per rss_feed_id.';
COMMENT ON COLUMN rss_feed_discoverability_changes.rss_feed_id IS 'RSS feed whose public discoverability state changed.';
COMMENT ON COLUMN rss_feed_discoverability_changes.enabled IS 'Whether the feed is publicly discoverable after this change.';
COMMENT ON COLUMN rss_feed_discoverability_changes.reason IS 'Optional human- or system-readable reason for the discoverability change.';

CREATE TABLE IF NOT EXISTS rss_feed_enablement_changes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  rss_feed_id UUID NOT NULL REFERENCES rss_feeds ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  reason TEXT,
  CHECK (reason IS NULL OR char_length(reason) <= 1000),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);
CREATE INDEX IF NOT EXISTS idx_rss_feed_enablement_changes__rss_feed_id__id
  ON rss_feed_enablement_changes (rss_feed_id, id DESC);
COMMENT ON TABLE rss_feed_enablement_changes IS 'Append-only audit log of enablement state for RSS feeds. Current state is the latest row per rss_feed_id.';
COMMENT ON COLUMN rss_feed_enablement_changes.rss_feed_id IS 'RSS feed whose fetch enablement state changed.';
COMMENT ON COLUMN rss_feed_enablement_changes.enabled IS 'Whether the feed is enabled for fetching after this change.';
COMMENT ON COLUMN rss_feed_enablement_changes.reason IS 'Optional human- or system-readable reason for the enablement change.';

-- Keep rss_feeds.is_enabled in sync with the latest rss_feed_enablement_changes row.
-- Reads the MAX-id row rather than trusting NEW.enabled to defend against out-of-order
-- transaction commits on the same feed.
CREATE OR REPLACE FUNCTION fn_sync_rss_feed_is_enabled()
RETURNS TRIGGER AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  -- Serialize concurrent triggers for the same feed: acquire a row-level lock on
  -- rss_feeds before re-reading the latest change, so whichever trigger holds the
  -- lock last wins and writes the correct (most-recently-committed) value.
  PERFORM id FROM rss_feeds WHERE id = NEW.rss_feed_id FOR UPDATE;
  SELECT enabled INTO v_enabled
  FROM rss_feed_enablement_changes
  WHERE rss_feed_id = NEW.rss_feed_id
  ORDER BY id DESC LIMIT 1;
  UPDATE rss_feeds SET is_enabled = v_enabled
  WHERE id = NEW.rss_feed_id AND is_enabled IS DISTINCT FROM v_enabled;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_sync_rss_feed_is_enabled
AFTER INSERT ON rss_feed_enablement_changes
FOR EACH ROW
EXECUTE FUNCTION fn_sync_rss_feed_is_enabled();

-- Keep rss_feeds.is_discoverable in sync with the latest
-- rss_feed_discoverability_changes row. The feed-row lock serializes concurrent
-- state changes before the trigger re-reads the latest UUIDv7 change.
CREATE OR REPLACE FUNCTION fn_sync_rss_feed_is_discoverable()
RETURNS TRIGGER AS $$
DECLARE
  v_is_discoverable BOOLEAN;
BEGIN
  PERFORM id FROM rss_feeds WHERE id = NEW.rss_feed_id FOR UPDATE;
  SELECT enabled INTO v_is_discoverable
  FROM rss_feed_discoverability_changes
  WHERE rss_feed_id = NEW.rss_feed_id
  ORDER BY id DESC LIMIT 1;
  UPDATE rss_feeds SET is_discoverable = v_is_discoverable
  WHERE id = NEW.rss_feed_id AND is_discoverable IS DISTINCT FROM v_is_discoverable;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_sync_rss_feed_is_discoverable
AFTER INSERT ON rss_feed_discoverability_changes
FOR EACH ROW
EXECUTE FUNCTION fn_sync_rss_feed_is_discoverable();

-------------------------------------------------------------------------------
-- rss_feed_items
-------------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE rss_feed_item_media_types AS ENUM ('article', 'audio', 'video');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS rss_feed_item_ids (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  -- GUID as defined by the RSS feed; unique per feed hostname.
  -- This remains unpartitioned so it can enforce global ingest deduplication.
  guid TEXT NOT NULL,
  CHECK (guid = TRIM(guid)),

  -- The hostname of the RSS feed URL; used with guid for deduplication.
  -- GUIDs are only unique per feed domain, not per item URL (item URLs can change).
  url_hostname_id UUID NOT NULL REFERENCES url_hostnames (id) ON DELETE CASCADE,
  UNIQUE (url_hostname_id, guid) INCLUDE (id)
);

CREATE TABLE IF NOT EXISTS rss_feed_items (
  -- Shared with rss_feed_item_ids; the identity row is inserted first.
  id UUID PRIMARY KEY REFERENCES rss_feed_item_ids (id) ON DELETE CASCADE,

  url_id UUID NOT NULL REFERENCES urls ON DELETE CASCADE, -- as defined by the RSS feed
  data JSONB NOT NULL, -- dump of the data

  -- bedrock nova multimodal v1 embedding
  bedrock_nova_multimodal_v1_content_sha256 BYTEA NOT NULL,
  CHECK (OCTET_LENGTH(bedrock_nova_multimodal_v1_content_sha256) = 32),
  bedrock_nova_multimodal_v1_input_sha256 BYTEA,
  CHECK (bedrock_nova_multimodal_v1_input_sha256 IS NULL OR OCTET_LENGTH(bedrock_nova_multimodal_v1_input_sha256) = 32),
  bedrock_nova_multimodal_v1_embedding VECTOR(1024),
  bedrock_nova_multimodal_v1_embedding_created_at TIMESTAMPTZ,
  bedrock_nova_multimodal_v1_input_token_count INT,
  CHECK (bedrock_nova_multimodal_v1_input_token_count IS NULL OR bedrock_nova_multimodal_v1_input_token_count >= 0),

  -- full text search vector; trigger-maintained by fn_sync_rss_feed_items_search_vector so
  -- unrelated updates (embeddings, language detection) skip the tsvector rebuild
  search_vector TSVECTOR,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  media_type rss_feed_item_media_types NOT NULL DEFAULT 'article',
  enclosure_url TEXT,
  CHECK (enclosure_url IS NULL OR char_length(enclosure_url) <= 2048),
  enclosure_type TEXT,
  CHECK (enclosure_type IS NULL OR char_length(enclosure_type) <= 255),
  enclosure_length BIGINT,
  CHECK (enclosure_length IS NULL OR enclosure_length >= 0),
  duration_seconds INT,
  CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  thumbnail_url TEXT,
  CHECK (thumbnail_url IS NULL OR char_length(thumbnail_url) <= 2048),
  video_id TEXT,
  CHECK (video_id IS NULL OR char_length(video_id) <= 255),
  video_platform TEXT,
  CHECK (video_platform IS NULL OR char_length(video_platform) <= 64),

  -- language detection
  lingua_rs_detected_language TEXT CHECK (lingua_rs_detected_language IS NULL OR (lingua_rs_detected_language = LOWER(lingua_rs_detected_language) AND LENGTH(lingua_rs_detected_language) <= 10)),
  lingua_rs_content_sha256 BYTEA CHECK (lingua_rs_content_sha256 IS NULL OR LENGTH(lingua_rs_content_sha256) = 32),
  lingua_rs_input_sha256 BYTEA CHECK (lingua_rs_input_sha256 IS NULL OR LENGTH(lingua_rs_input_sha256) = 32),
  lingua_rs_results JSONB,
  lingua_rs_detected_at TIMESTAMPTZ,

  -- story clustering (FK added later when stories table exists)
  story_id UUID,
  story_locked_at TIMESTAMPTZ,

  votes_snapshot_xmax XID8,
  votes_snapshot_xip_count INTEGER,
  CONSTRAINT chk_rss_feed_items_votes_snapshot_complete CHECK (
    (votes_snapshot_xmax IS NULL AND votes_snapshot_xip_count IS NULL)
    OR (votes_snapshot_xmax IS NOT NULL AND votes_snapshot_xip_count IS NOT NULL AND votes_snapshot_xip_count >= 0)
  ),

  -- for sorting: prevents publishers from continuously bumping items
  -- earliest of isoDate, pubDate, and fetch time (missing feed dates treated as infinity)
  published_at TIMESTAMPTZ GENERATED ALWAYS AS (
    LEAST(
      COALESCE(fn_text_to_timestamptz(data->>'isoDate'), 'infinity'::timestamptz),
      COALESCE(fn_text_to_timestamptz(data->>'pubDate'), 'infinity'::timestamptz),
      uuid_extract_timestamp(id)
    )
  ) STORED
) PARTITION BY RANGE (id);

CREATE TABLE IF NOT EXISTS rss_feed_items_default
PARTITION OF rss_feed_items DEFAULT;

-- Recomputes search_vector only when data changes, avoiding a full tsvector
-- rebuild on every unrelated item update (embeddings, language detection).
CREATE OR REPLACE FUNCTION fn_sync_rss_feed_items_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('voucha_english', COALESCE(NEW.data->>'title', '')), 'A') ||
    setweight(to_tsvector('voucha_english',
      COALESCE(NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(NEW.data->>'content:encodedSnippet', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''), '') || ' ' ||
      COALESCE(NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(NEW.data->>'content:encoded', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''), '') || ' ' ||
      COALESCE(NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(NEW.data->>'contentSnippet', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''), '') || ' ' ||
      COALESCE(NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(NEW.data->>'content', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''), '') || ' ' ||
      COALESCE(NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(NEW.data->>'description', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''), '') || ' ' ||
      COALESCE(NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(NEW.data->>'summary', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''), '') || ' ' ||
      COALESCE(NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(NEW.data->>'media:description', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''), '')
    ), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_sync_rss_feed_items_search_vector
BEFORE INSERT OR UPDATE OF data ON rss_feed_items
FOR EACH ROW
EXECUTE FUNCTION fn_sync_rss_feed_items_search_vector();

CREATE OR REPLACE TRIGGER trigger_rss_feed_items_updated_at
BEFORE UPDATE ON rss_feed_items
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- for searching items by text
CREATE INDEX IF NOT EXISTS idx_rss_feed_items__search_vector
ON rss_feed_items
USING GIN (search_vector)
WHERE deleted_at IS NULL;

-- stable feed pagination (id is UUIDv7, monotonically increasing)
CREATE INDEX IF NOT EXISTS idx_rss_feed_items__published_at__id
ON rss_feed_items (published_at DESC, id DESC)
WHERE deleted_at IS NULL;

-- find existing embeddings by input hash
CREATE INDEX IF NOT EXISTS idx_rss_feed_items__bedrock_nova_multimodal_v1_input_sha256
ON rss_feed_items (bedrock_nova_multimodal_v1_input_sha256)
WHERE bedrock_nova_multimodal_v1_input_sha256 IS NOT NULL;

-- index embeddings for similarity search (vector_cosine_ops matches <=> queries)
CREATE INDEX IF NOT EXISTS idx_rss_feed_items__bedrock_nova_multimodal_v1_embedding
ON rss_feed_items USING hnsw (bedrock_nova_multimodal_v1_embedding vector_cosine_ops)
WHERE bedrock_nova_multimodal_v1_embedding IS NOT NULL;

-- similar-item candidates by published_at window
CREATE INDEX IF NOT EXISTS idx_rss_feed_items__embedding_candidates__published_at__id
ON rss_feed_items (published_at DESC, id DESC)
WHERE deleted_at IS NULL
  AND bedrock_nova_multimodal_v1_embedding IS NOT NULL;

-- find out of date embeddings
CREATE INDEX IF NOT EXISTS idx_rss_feed_items__bedrock_nova_multimodal_v1_to_update
ON rss_feed_items (id)
WHERE (
  bedrock_nova_multimodal_v1_input_sha256 IS NULL
  OR (bedrock_nova_multimodal_v1_input_sha256 != bedrock_nova_multimodal_v1_content_sha256)
);

-- for filtering by media type
CREATE INDEX IF NOT EXISTS idx_rss_feed_items__media_type__pub
ON rss_feed_items (media_type, published_at DESC, id DESC)
WHERE deleted_at IS NULL;

-- for looking up items by url
CREATE INDEX IF NOT EXISTS idx_rss_feed_items__url_id
ON rss_feed_items (url_id);

-- for finding items in a story
CREATE INDEX IF NOT EXISTS idx_rss_feed_items__story_id
ON rss_feed_items (story_id)
WHERE story_id IS NOT NULL AND deleted_at IS NULL;

-- RI-usable index for the story_id FK (the index above also filters deleted_at, so it isn't RI-usable)
CREATE INDEX IF NOT EXISTS idx_rss_feed_items__story_id__ri
ON rss_feed_items (story_id)
WHERE story_id IS NOT NULL;

-- find rss feed items pending language detection
CREATE INDEX IF NOT EXISTS rss_feed_items_lingua_rs_pending_idx
  ON rss_feed_items (id)
  WHERE lingua_rs_input_sha256 IS NULL;

-------------------------------------------------------------------------------
-- rss_feed_item_category_rejections
-------------------------------------------------------------------------------

-- Category strings an admin has marked as too vague to map to a topic.
-- A rejected category is hidden from the unmapped-category work queue.
CREATE TABLE IF NOT EXISTS rss_feed_item_category_rejections (
  category_text TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_by_id UUID REFERENCES users ON DELETE SET NULL
);

COMMENT ON TABLE rss_feed_item_category_rejections IS 'Category strings marked by admins as too vague to map to a topic (e.g. "news"). Hidden from the unmapped-category triage queue.';
COMMENT ON COLUMN rss_feed_item_category_rejections.category_text IS 'Normalized (trimmed, lowercased) category text — matches rss_feed_item_categories.category_text. Primary key.';

COMMENT ON TABLE rss_feed_item_ids IS 'RSS feed item identity lookup. Unique per (url_hostname_id, guid): same GUID on same feed domain = same item, regardless of which feed URL discovered it.';
COMMENT ON COLUMN rss_feed_item_ids.guid IS 'The GUID/ID as defined by the RSS feed, for deduplication within the same hostname.';
COMMENT ON COLUMN rss_feed_item_ids.url_hostname_id IS 'The hostname of the RSS feed URL. Combined with guid for dedup: GUIDs are unique per domain, not globally.';
COMMENT ON TABLE rss_feed_items IS 'Partitioned RSS feed item content keyed by rss_feed_item_ids.id.';
COMMENT ON COLUMN rss_feed_items.url_id IS 'The canonical URL for this feed item.';
COMMENT ON COLUMN rss_feed_items.data IS 'Raw JSONB dump of the parsed feed item data.';
COMMENT ON COLUMN rss_feed_items.media_type IS 'Content type: article, audio, or video.';
COMMENT ON COLUMN rss_feed_items.enclosure_url IS 'URL of the media enclosure (podcast audio, video file).';
COMMENT ON COLUMN rss_feed_items.enclosure_type IS 'MIME type of the enclosure (e.g. audio/mpeg).';
COMMENT ON COLUMN rss_feed_items.enclosure_length IS 'File size of the enclosure in bytes.';
COMMENT ON COLUMN rss_feed_items.duration_seconds IS 'Duration of audio/video content in seconds.';
COMMENT ON COLUMN rss_feed_items.thumbnail_url IS 'URL of a thumbnail image for the item.';
COMMENT ON COLUMN rss_feed_items.video_id IS 'Platform-specific video identifier (e.g. YouTube video ID).';
COMMENT ON COLUMN rss_feed_items.video_platform IS 'Video hosting platform name (e.g. youtube).';
COMMENT ON COLUMN rss_feed_items.published_at IS 'Computed publication timestamp: earliest of feed dates and fetch time.';
COMMENT ON COLUMN rss_feed_items.story_id IS 'FK to the story this item belongs to.';
COMMENT ON COLUMN rss_feed_items.story_locked_at IS 'When set by admin, auto-clustering will not override the story assignment.';
COMMENT ON COLUMN rss_feed_items.votes_snapshot_xmax IS 'Upper transaction-ID boundary of the PostgreSQL snapshot used for the persisted vote-stat aggregate.';
COMMENT ON COLUMN rss_feed_items.votes_snapshot_xip_count IS 'Number of transactions still in progress in that vote-stat snapshot; lower is newer when the snapshot xmax is equal.';

-------------------------------------------------------------------------------
-- rss_feed_item_sources
-------------------------------------------------------------------------------

-- Tracks which RSS feeds contain which items (many-to-many).
-- Same item (same hostname+guid) can appear in multiple feeds from the same domain.
CREATE TABLE IF NOT EXISTS rss_feed_item_sources (
  rss_feed_id UUID NOT NULL REFERENCES rss_feeds ON DELETE CASCADE,
  rss_feed_item_id UUID NOT NULL REFERENCES rss_feed_items ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rss_feed_id, rss_feed_item_id)
);

COMMENT ON TABLE rss_feed_item_sources IS 'Join table: which RSS feeds contain which items. An item (unique per hostname+guid) can appear in multiple feeds from the same domain.';
COMMENT ON COLUMN rss_feed_item_sources.rss_feed_id IS 'The RSS feed that contains this item.';
COMMENT ON COLUMN rss_feed_item_sources.rss_feed_item_id IS 'The RSS feed item.';
COMMENT ON COLUMN rss_feed_item_sources.created_at IS 'When this feed-to-item association was first observed (during crawl).';

-------------------------------------------------------------------------------
-- rss_feed_item_categories
-------------------------------------------------------------------------------

-- feed item categories --> internal topics
-- Categories belong to the item, not to a specific feed-item pair.
CREATE TABLE IF NOT EXISTS rss_feed_item_categories (
  rss_feed_item_id UUID NOT NULL REFERENCES rss_feed_items ON DELETE CASCADE,
  category_text TEXT NOT NULL, -- the category text from the RSS feed
  topic_id UUID REFERENCES topics ON DELETE SET NULL, -- the internal topic, stored here for lookup
  topic_alias_id UUID REFERENCES topic_aliases ON DELETE RESTRICT, -- valid canonical hashtag, if any

  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (rss_feed_item_id, category_text)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rss_feed_item_categories__item_category_lower
ON rss_feed_item_categories (rss_feed_item_id, (LOWER(category_text)));

CREATE OR REPLACE TRIGGER trigger_rss_feed_item_categories_updated_at
BEFORE UPDATE ON rss_feed_item_categories
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- for searching items by topic
CREATE INDEX IF NOT EXISTS idx_rss_feed_item_categories__topic_id
ON rss_feed_item_categories (topic_id, rss_feed_item_id DESC)
WHERE topic_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rss_feed_item_categories__topic_alias_id
ON rss_feed_item_categories (topic_alias_id, rss_feed_item_id DESC)
WHERE topic_alias_id IS NOT NULL;

-- for updating and joining
CREATE INDEX IF NOT EXISTS idx_rss_feed_item_categories__category_text
ON rss_feed_item_categories (LOWER(category_text));

CREATE INDEX IF NOT EXISTS idx_rss_feed_item_categories__unmapped_category_text
ON rss_feed_item_categories (LOWER(category_text))
WHERE topic_id IS NULL;

-- Incrementally refreshed aggregate for count-ranked admin triage. Keeping this
-- in the same transaction as category writes avoids stale queue results.
CREATE TABLE IF NOT EXISTS rss_feed_item_unmapped_category_counts (
  category_text TEXT PRIMARY KEY,
  item_count BIGINT NOT NULL CHECK (item_count > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION fn_refresh_rss_feed_item_unmapped_category_count()
RETURNS TRIGGER AS $$
DECLARE
  current_item_count BIGINT;
BEGIN
  IF TG_OP != 'INSERT' AND OLD.topic_id IS NULL THEN
    SELECT item_count INTO current_item_count
    FROM rss_feed_item_unmapped_category_counts
    WHERE category_text = LOWER(OLD.category_text)
    FOR UPDATE;

    IF current_item_count = 1 THEN
      DELETE FROM rss_feed_item_unmapped_category_counts
      WHERE category_text = LOWER(OLD.category_text);
    ELSIF current_item_count > 1 THEN
      UPDATE rss_feed_item_unmapped_category_counts
      SET item_count = item_count - 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE category_text = LOWER(OLD.category_text);
    END IF;
  END IF;

  IF TG_OP != 'DELETE' AND NEW.topic_id IS NULL THEN
    INSERT INTO rss_feed_item_unmapped_category_counts (category_text, item_count)
    VALUES (LOWER(NEW.category_text), 1)
    ON CONFLICT (category_text) DO UPDATE
    SET item_count = rss_feed_item_unmapped_category_counts.item_count + 1,
        updated_at = CURRENT_TIMESTAMP;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_refresh_rss_feed_item_unmapped_category_count
AFTER INSERT OR DELETE OR UPDATE OF category_text, topic_id ON rss_feed_item_categories
FOR EACH ROW
EXECUTE FUNCTION fn_refresh_rss_feed_item_unmapped_category_count();

COMMENT ON TABLE rss_feed_item_categories IS 'Maps RSS feed item categories to internal topics. Categories belong to the item, not to a specific feed.';
COMMENT ON COLUMN rss_feed_item_categories.rss_feed_item_id IS 'The RSS feed item these categories belong to.';
COMMENT ON COLUMN rss_feed_item_categories.category_text IS 'The first authored category text from the RSS feed; identity is case-insensitive per item.';
COMMENT ON COLUMN rss_feed_item_categories.topic_id IS 'The mapped internal topic. NULL if not yet mapped.';
COMMENT ON COLUMN rss_feed_item_categories.topic_alias_id IS 'The valid canonical hashtag alias. NULL for non-hashtag RSS labels.';
COMMENT ON TABLE rss_feed_item_unmapped_category_counts IS 'Transactionally refreshed counts of normalized RSS item category strings whose topic_id is NULL.';
COMMENT ON COLUMN rss_feed_item_unmapped_category_counts.category_text IS 'Lowercase RSS category text with no current topic mapping.';
COMMENT ON COLUMN rss_feed_item_unmapped_category_counts.item_count IS 'Number of RSS feed items currently carrying this unmapped category.';
COMMENT ON COLUMN rss_feed_item_unmapped_category_counts.updated_at IS 'When this category count last changed.';

-- Durable outbox for complete category snapshots. The crawler commits this row with the item/source
-- write, so a post-commit queue enqueue failure cannot strand category state indefinitely.
CREATE TABLE IF NOT EXISTS rss_feed_item_category_snapshot_reconciliations (
  rss_feed_item_id UUID PRIMARY KEY REFERENCES rss_feed_items ON DELETE CASCADE,
  categories JSONB NOT NULL,
  generation BIGINT NOT NULL DEFAULT 1 CHECK (generation > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (jsonb_typeof(categories) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_rss_feed_item_category_snapshot_reconciliations__updated_at
ON rss_feed_item_category_snapshot_reconciliations (updated_at, rss_feed_item_id);

COMMENT ON TABLE rss_feed_item_category_snapshot_reconciliations IS 'One coalesced durable desired category snapshot per RSS item; exact-generation acknowledgement deletes successfully reconciled work.';
COMMENT ON COLUMN rss_feed_item_category_snapshot_reconciliations.rss_feed_item_id IS 'RSS feed item whose complete category snapshot must be reconciled.';
COMMENT ON COLUMN rss_feed_item_category_snapshot_reconciliations.categories IS 'Normalized desired RSS category strings, including an empty array when all categories were removed.';
COMMENT ON COLUMN rss_feed_item_category_snapshot_reconciliations.generation IS 'Monotonic per-item generation fence; stale workers cannot acknowledge newer snapshots.';
COMMENT ON COLUMN rss_feed_item_category_snapshot_reconciliations.created_at IS 'When this item first entered the durable category snapshot backlog.';
COMMENT ON COLUMN rss_feed_item_category_snapshot_reconciliations.updated_at IS 'When this item category snapshot was most recently replaced.';

-------------------------------------------------------------------------------
-- rss_feed_crawls
-------------------------------------------------------------------------------

-- Crawl history per feed: response code and optional feed payload (partitioned monthly by id)
CREATE TABLE IF NOT EXISTS rss_feed_crawls (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  rss_feed_id UUID NOT NULL REFERENCES rss_feeds ON DELETE CASCADE,
  CHECK (id > rss_feed_id), -- UUIDv7 partition pruning: crawls created after feed
  response_code SMALLINT NOT NULL,
  feed_data JSONB,
  feed_data_sha256 BYTEA,
  redirect_url_id UUID REFERENCES urls ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (feed_data_sha256 IS NULL OR OCTET_LENGTH(feed_data_sha256) = 32)
) PARTITION BY RANGE (id);

CREATE INDEX IF NOT EXISTS idx_rss_feed_crawls__rss_feed_id
ON rss_feed_crawls (rss_feed_id, id DESC);

-- RI-usable index for the redirect_url_id FK
CREATE INDEX IF NOT EXISTS idx_rss_feed_crawls__redirect_url_id
ON rss_feed_crawls (redirect_url_id)
WHERE redirect_url_id IS NOT NULL;

COMMENT ON TABLE rss_feed_crawls IS 'Append-only crawl history per RSS feed. Monthly RANGE-partitioned by id for retention.';
COMMENT ON COLUMN rss_feed_crawls.rss_feed_id IS 'The feed that was crawled.';
COMMENT ON COLUMN rss_feed_crawls.response_code IS 'HTTP response status code from the crawl.';
COMMENT ON COLUMN rss_feed_crawls.feed_data IS 'Raw JSONB feed payload, if the response was successful.';
COMMENT ON COLUMN rss_feed_crawls.feed_data_sha256 IS 'SHA-256 of the feed payload, for change detection.';
COMMENT ON COLUMN rss_feed_crawls.redirect_url_id IS 'The URL this crawl redirected to, if a 3xx redirect was received.';

-- ==========================================================================
-- 0360-00-00-rss-feed-source-management.sql
-- ============================================================================

-- Allow multiple hostnames per topic by replacing the one-to-one unique index with a non-unique one.
-- Topics now support a primary hostname (topics.hostname_id) plus additional hostnames,
-- all tracked via url_hostnames.topic_id. The UNIQUE constraint allowed only one hostname
-- per topic; removing it enables the one-to-many relationship.

CREATE INDEX IF NOT EXISTS idx_url_hostnames__topic_id
ON url_hostnames (topic_id)
WHERE topic_id IS NOT NULL;

COMMENT ON COLUMN url_hostnames.topic_id IS
  'The topic that owns this hostname (primary or additional domain). Many hostnames may share the same topic_id; the primary is identified by topics.hostname_id.';

-- ==========================================================================
-- 0370-00-00-rss-feed-open-source-creation.sql
-- ============================================================================


CREATE INDEX IF NOT EXISTS idx_topics__hostname_id
ON topics (hostname_id)
WHERE hostname_id IS NOT NULL;

COMMENT ON COLUMN topics.hostname_id IS 'Primary hostname for this topic. For rss_feed topics, multiple topics may share the same hostname (e.g. a news feed and podcast from the same domain).';

COMMENT ON COLUMN rss_feeds.created_by_id IS 'User who created this RSS feed, used for auto-follow and auto-vote side effects.';

-- ==========================================================================
-- 0420-00-00-explain-analyze-query-indexes.sql
-- ============================================================================

-- Indexes added from EXPLAIN ANALYZE review.

-- RSS item search often starts from rss_feed_items ordered by published_at and
-- checks whether each item belongs to one of a small set of source feeds.
CREATE INDEX IF NOT EXISTS idx_rss_feed_item_sources__item_feed
ON rss_feed_item_sources (rss_feed_item_id, rss_feed_id);
