-- Feed-level podcast metadata and Apple category mapping.
-- edited-in-place: pre-launch, never deployed to production
-- podcast_shows: 1:1 extension table for rss_feeds rows with feed_type='podcast'.
-- rss_feed_categories: feed-level Apple itunes:category → internal topics (mirrors item-level rss_feed_item_categories).

DO $$ BEGIN
  CREATE TYPE podcast_itunes_types AS ENUM ('episodic', 'serial');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-------------------------------------------------------------------------------
-- rss_feed_categories
-------------------------------------------------------------------------------

-- feed-level Apple itunes:category text → internal topic mapping
-- Mirrors rss_feed_item_categories but keyed by feed, not item.
CREATE TABLE IF NOT EXISTS rss_feed_categories (
  rss_feed_id UUID NOT NULL REFERENCES rss_feeds ON DELETE CASCADE,
  category_text TEXT NOT NULL, -- normalized (trimmed, lowercased) Apple itunes:category text
  topic_id UUID REFERENCES topics ON DELETE SET NULL, -- the mapped internal topic; NULL if not yet mapped

  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (rss_feed_id, category_text)
);

CREATE OR REPLACE TRIGGER trigger_rss_feed_categories_updated_at
BEFORE UPDATE ON rss_feed_categories
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- for /podcasts/[category] hub filter: list feeds in a category
CREATE INDEX IF NOT EXISTS idx_rss_feed_categories__topic_id
ON rss_feed_categories (topic_id, rss_feed_id DESC)
WHERE topic_id IS NOT NULL;

-- for category-text filtering and joins (text is already normalized to lowercase before storage)
CREATE INDEX IF NOT EXISTS idx_rss_feed_categories__category_text
ON rss_feed_categories (category_text);

COMMENT ON TABLE rss_feed_categories IS 'Maps feed-level Apple itunes:category values to internal topics. One row per (feed, category_text) pair.';
COMMENT ON COLUMN rss_feed_categories.rss_feed_id IS 'The RSS feed (podcast show) these categories belong to.';
COMMENT ON COLUMN rss_feed_categories.category_text IS 'Normalized (trimmed, lowercased) Apple itunes:category text from the feed.';
COMMENT ON COLUMN rss_feed_categories.topic_id IS 'The mapped internal topic. NULL if not yet mapped by the autotagger.';

-------------------------------------------------------------------------------
-- podcast_shows
-------------------------------------------------------------------------------

-- 1:1 extension table for rss_feeds rows with feed_type='podcast'.
-- Stores feed-level itunes namespace metadata that only applies to podcasts,
-- keeping rss_feeds clean of mostly-NULL columns for article/video feeds.
CREATE TABLE IF NOT EXISTS podcast_shows (
  rss_feed_id UUID PRIMARY KEY REFERENCES rss_feeds ON DELETE CASCADE,

  itunes_author TEXT,
  CHECK (itunes_author IS NULL OR char_length(itunes_author) <= 255),
  CHECK (itunes_author IS NULL OR itunes_author = TRIM(itunes_author)),

  itunes_owner_name TEXT,
  CHECK (itunes_owner_name IS NULL OR char_length(itunes_owner_name) <= 255),

  itunes_owner_email TEXT,
  CHECK (itunes_owner_email IS NULL OR char_length(itunes_owner_email) <= 320),

  -- Raw itunes:image href; proxied to /sideload/ at API-response time so key rotation needs no backfill.
  cover_art_url TEXT,
  CHECK (cover_art_url IS NULL OR char_length(cover_art_url) <= 2048),

  is_explicit BOOLEAN NOT NULL DEFAULT FALSE,

  -- 'episodic' or 'serial' per Apple Podcasts spec.
  itunes_type podcast_itunes_types,

  -- Normalized plain-text description extracted from the channel <description>.
  -- HTML tags stripped, whitespace collapsed, capped at 4000 chars.
  description TEXT,
  CHECK (description IS NULL OR char_length(description) <= 4000),
  CHECK (description IS NULL OR description = TRIM(description)),

  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_podcast_shows_updated_at
BEFORE UPDATE ON podcast_shows
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE podcast_shows IS '1:1 extension table for rss_feeds rows with feed_type=''podcast''. Stores feed-level iTunes namespace metadata.';
COMMENT ON COLUMN podcast_shows.rss_feed_id IS 'The RSS feed (podcast show) this metadata belongs to.';
COMMENT ON COLUMN podcast_shows.itunes_author IS 'The <itunes:author> value from the feed channel.';
COMMENT ON COLUMN podcast_shows.itunes_owner_name IS 'The <itunes:owner><itunes:name> value.';
COMMENT ON COLUMN podcast_shows.itunes_owner_email IS 'The <itunes:owner><itunes:email> value.';
COMMENT ON COLUMN podcast_shows.cover_art_url IS 'Raw <itunes:image href> value. Proxied to /sideload/ at API-response time.';
COMMENT ON COLUMN podcast_shows.is_explicit IS 'Whether the <itunes:explicit> flag is set.';
COMMENT ON COLUMN podcast_shows.itunes_type IS 'The <itunes:type> value: ''episodic'' or ''serial''.';
COMMENT ON COLUMN podcast_shows.description IS 'Normalized plain-text channel <description>. HTML stripped, whitespace collapsed, capped at 4000 chars.';
