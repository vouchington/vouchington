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

-- community_list_items__topics
CREATE TABLE IF NOT EXISTS community_list_items__topics (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  added_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  removed_at TIMESTAMPTZ,
  removed_by_id UUID REFERENCES users ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cli_topics__uniq ON community_list_items__topics (community_id, topic_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cli_topics__community ON community_list_items__topics (community_id);
CREATE INDEX IF NOT EXISTS idx_cli_topics__topic ON community_list_items__topics (topic_id);

COMMENT ON TABLE community_list_items__topics IS 'Topics curated into a community list by community leads.';
COMMENT ON COLUMN community_list_items__topics.community_id IS 'The community this list item belongs to.';
COMMENT ON COLUMN community_list_items__topics.topic_id IS 'The topic added to the list.';
COMMENT ON COLUMN community_list_items__topics.order_index IS 'Manual sort order within the list (lower = first).';
COMMENT ON COLUMN community_list_items__topics.added_by_id IS 'User who added this item to the list.';
COMMENT ON COLUMN community_list_items__topics.removed_at IS 'When set, the item has been removed from the list.';
COMMENT ON COLUMN community_list_items__topics.removed_by_id IS 'User who removed this item from the list.';

-- community_list_items__rss_feeds
CREATE TABLE IF NOT EXISTS community_list_items__rss_feeds (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  rss_feed_id UUID NOT NULL REFERENCES rss_feeds ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  added_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  removed_at TIMESTAMPTZ,
  removed_by_id UUID REFERENCES users ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cli_rss_feeds__uniq ON community_list_items__rss_feeds (community_id, rss_feed_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cli_rss_feeds__community ON community_list_items__rss_feeds (community_id);
CREATE INDEX IF NOT EXISTS idx_cli_rss_feeds__rss_feed ON community_list_items__rss_feeds (rss_feed_id);

COMMENT ON TABLE community_list_items__rss_feeds IS 'RSS feeds curated into a community list by community leads.';
COMMENT ON COLUMN community_list_items__rss_feeds.community_id IS 'The community this list item belongs to.';
COMMENT ON COLUMN community_list_items__rss_feeds.rss_feed_id IS 'The RSS feed added to the list.';
COMMENT ON COLUMN community_list_items__rss_feeds.order_index IS 'Manual sort order within the list (lower = first).';
COMMENT ON COLUMN community_list_items__rss_feeds.added_by_id IS 'User who added this item to the list.';
COMMENT ON COLUMN community_list_items__rss_feeds.removed_at IS 'When set, the item has been removed from the list.';
COMMENT ON COLUMN community_list_items__rss_feeds.removed_by_id IS 'User who removed this item from the list.';

-- community_list_items__posts
CREATE TABLE IF NOT EXISTS community_list_items__posts (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  added_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  removed_at TIMESTAMPTZ,
  removed_by_id UUID REFERENCES users ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cli_posts__uniq ON community_list_items__posts (community_id, post_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cli_posts__community ON community_list_items__posts (community_id);
CREATE INDEX IF NOT EXISTS idx_cli_posts__post ON community_list_items__posts (post_id);

COMMENT ON TABLE community_list_items__posts IS 'Posts curated into a community list by community leads.';
COMMENT ON COLUMN community_list_items__posts.community_id IS 'The community this list item belongs to.';
COMMENT ON COLUMN community_list_items__posts.post_id IS 'The post added to the list.';
COMMENT ON COLUMN community_list_items__posts.order_index IS 'Manual sort order within the list (lower = first).';
COMMENT ON COLUMN community_list_items__posts.added_by_id IS 'User who added this item to the list.';
COMMENT ON COLUMN community_list_items__posts.removed_at IS 'When set, the item has been removed from the list.';
COMMENT ON COLUMN community_list_items__posts.removed_by_id IS 'User who removed this item from the list.';

-- community_list_items__url_hostnames
CREATE TABLE IF NOT EXISTS community_list_items__url_hostnames (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  url_hostname_id UUID NOT NULL REFERENCES url_hostnames ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  added_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  removed_at TIMESTAMPTZ,
  removed_by_id UUID REFERENCES users ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cli_url_hostnames__uniq ON community_list_items__url_hostnames (community_id, url_hostname_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cli_url_hostnames__community ON community_list_items__url_hostnames (community_id);
CREATE INDEX IF NOT EXISTS idx_cli_url_hostnames__url_hostname ON community_list_items__url_hostnames (url_hostname_id);

COMMENT ON TABLE community_list_items__url_hostnames IS 'URL hostnames (domains) curated into a community list by community leads.';
COMMENT ON COLUMN community_list_items__url_hostnames.community_id IS 'The community this list item belongs to.';
COMMENT ON COLUMN community_list_items__url_hostnames.url_hostname_id IS 'The URL hostname added to the list.';
COMMENT ON COLUMN community_list_items__url_hostnames.order_index IS 'Manual sort order within the list (lower = first).';
COMMENT ON COLUMN community_list_items__url_hostnames.added_by_id IS 'User who added this item to the list.';
COMMENT ON COLUMN community_list_items__url_hostnames.removed_at IS 'When set, the item has been removed from the list.';
COMMENT ON COLUMN community_list_items__url_hostnames.removed_by_id IS 'User who removed this item from the list.';

-- community_list_items__urls
CREATE TABLE IF NOT EXISTS community_list_items__urls (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  url_id UUID NOT NULL REFERENCES urls ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  added_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  removed_at TIMESTAMPTZ,
  removed_by_id UUID REFERENCES users ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cli_urls__uniq ON community_list_items__urls (community_id, url_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cli_urls__community ON community_list_items__urls (community_id);
CREATE INDEX IF NOT EXISTS idx_cli_urls__url ON community_list_items__urls (url_id);

COMMENT ON TABLE community_list_items__urls IS 'URLs curated into a community list by community leads.';
COMMENT ON COLUMN community_list_items__urls.community_id IS 'The community this list item belongs to.';
COMMENT ON COLUMN community_list_items__urls.url_id IS 'The URL added to the list.';
COMMENT ON COLUMN community_list_items__urls.order_index IS 'Manual sort order within the list (lower = first).';
COMMENT ON COLUMN community_list_items__urls.added_by_id IS 'User who added this item to the list.';
COMMENT ON COLUMN community_list_items__urls.removed_at IS 'When set, the item has been removed from the list.';
COMMENT ON COLUMN community_list_items__urls.removed_by_id IS 'User who removed this item from the list.';
