-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- Merged from: 0300-00-00-community-list-items.sql

-- ==========================================================================
-- 0300-00-00-community-list-items.sql
-- ============================================================================

-- Community list item types
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_list_item_types') THEN
    CREATE TYPE community_list_item_types AS ENUM ('topic', 'rss_feed', 'post', 'url_hostname', 'url');
  END IF;
END $$;

-- community_list_topics
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS community_list_topics (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  added_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  removed_at TIMESTAMPTZ,
  removed_by_id UUID REFERENCES users ON DELETE SET NULL
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_list_topics__unique ON community_list_topics (community_id, topic_id) WHERE removed_at IS NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_community_list_topics__community ON community_list_topics (community_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_community_list_topics__topic ON community_list_topics (topic_id);

COMMENT ON TABLE community_list_topics IS 'Topics curated into a community list by community leads.';
COMMENT ON COLUMN community_list_topics.community_id IS 'The community this list item belongs to.';
COMMENT ON COLUMN community_list_topics.topic_id IS 'The topic added to the list.';
COMMENT ON COLUMN community_list_topics.order_index IS 'Manual sort order within the list (lower = first).';
COMMENT ON COLUMN community_list_topics.added_by_id IS 'User who added this item to the list.';
COMMENT ON COLUMN community_list_topics.removed_at IS 'When set, the item has been removed from the list.';
COMMENT ON COLUMN community_list_topics.removed_by_id IS 'User who removed this item from the list.';

-- community_list_rss_feeds
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS community_list_rss_feeds (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  rss_feed_id UUID NOT NULL REFERENCES rss_feeds ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  added_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  removed_at TIMESTAMPTZ,
  removed_by_id UUID REFERENCES users ON DELETE SET NULL
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_list_rss_feeds__unique ON community_list_rss_feeds (community_id, rss_feed_id) WHERE removed_at IS NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_community_list_rss_feeds__community ON community_list_rss_feeds (community_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_community_list_rss_feeds__rss_feed ON community_list_rss_feeds (rss_feed_id);

COMMENT ON TABLE community_list_rss_feeds IS 'RSS feeds curated into a community list by community leads.';
COMMENT ON COLUMN community_list_rss_feeds.community_id IS 'The community this list item belongs to.';
COMMENT ON COLUMN community_list_rss_feeds.rss_feed_id IS 'The RSS feed added to the list.';
COMMENT ON COLUMN community_list_rss_feeds.order_index IS 'Manual sort order within the list (lower = first).';
COMMENT ON COLUMN community_list_rss_feeds.added_by_id IS 'User who added this item to the list.';
COMMENT ON COLUMN community_list_rss_feeds.removed_at IS 'When set, the item has been removed from the list.';
COMMENT ON COLUMN community_list_rss_feeds.removed_by_id IS 'User who removed this item from the list.';

-- community_list_posts
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS community_list_posts (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  added_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  removed_at TIMESTAMPTZ,
  removed_by_id UUID REFERENCES users ON DELETE SET NULL
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_list_posts__unique ON community_list_posts (community_id, post_id) WHERE removed_at IS NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_community_list_posts__community ON community_list_posts (community_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_community_list_posts__post ON community_list_posts (post_id);

COMMENT ON TABLE community_list_posts IS 'Posts curated into a community list by community leads.';
COMMENT ON COLUMN community_list_posts.community_id IS 'The community this list item belongs to.';
COMMENT ON COLUMN community_list_posts.post_id IS 'The post added to the list.';
COMMENT ON COLUMN community_list_posts.order_index IS 'Manual sort order within the list (lower = first).';
COMMENT ON COLUMN community_list_posts.added_by_id IS 'User who added this item to the list.';
COMMENT ON COLUMN community_list_posts.removed_at IS 'When set, the item has been removed from the list.';
COMMENT ON COLUMN community_list_posts.removed_by_id IS 'User who removed this item from the list.';

-- community_list_url_hostnames
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS community_list_url_hostnames (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  url_hostname_id UUID NOT NULL REFERENCES url_hostnames ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  added_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  removed_at TIMESTAMPTZ,
  removed_by_id UUID REFERENCES users ON DELETE SET NULL
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_list_url_hostnames__unique ON community_list_url_hostnames (community_id, url_hostname_id) WHERE removed_at IS NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_community_list_url_hostnames__community ON community_list_url_hostnames (community_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_community_list_url_hostnames__url_hostname ON community_list_url_hostnames (url_hostname_id);

COMMENT ON TABLE community_list_url_hostnames IS 'URL hostnames (domains) curated into a community list by community leads.';
COMMENT ON COLUMN community_list_url_hostnames.community_id IS 'The community this list item belongs to.';
COMMENT ON COLUMN community_list_url_hostnames.url_hostname_id IS 'The URL hostname added to the list.';
COMMENT ON COLUMN community_list_url_hostnames.order_index IS 'Manual sort order within the list (lower = first).';
COMMENT ON COLUMN community_list_url_hostnames.added_by_id IS 'User who added this item to the list.';
COMMENT ON COLUMN community_list_url_hostnames.removed_at IS 'When set, the item has been removed from the list.';
COMMENT ON COLUMN community_list_url_hostnames.removed_by_id IS 'User who removed this item from the list.';

-- community_list_urls
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS community_list_urls (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  url_id UUID NOT NULL REFERENCES urls ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  added_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  removed_at TIMESTAMPTZ,
  removed_by_id UUID REFERENCES users ON DELETE SET NULL
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_list_urls__unique ON community_list_urls (community_id, url_id) WHERE removed_at IS NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_community_list_urls__community ON community_list_urls (community_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_community_list_urls__url ON community_list_urls (url_id);

COMMENT ON TABLE community_list_urls IS 'URLs curated into a community list by community leads.';
COMMENT ON COLUMN community_list_urls.community_id IS 'The community this list item belongs to.';
COMMENT ON COLUMN community_list_urls.url_id IS 'The URL added to the list.';
COMMENT ON COLUMN community_list_urls.order_index IS 'Manual sort order within the list (lower = first).';
COMMENT ON COLUMN community_list_urls.added_by_id IS 'User who added this item to the list.';
COMMENT ON COLUMN community_list_urls.removed_at IS 'When set, the item has been removed from the list.';
COMMENT ON COLUMN community_list_urls.removed_by_id IS 'User who removed this item from the list.';
