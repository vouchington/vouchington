-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- Merged from: 0250-00-00-stories.sql, 0260-00-00-story-posts.sql, 0290-00-00-hn-discussions.sql

-- ==========================================================================
-- 0250-00-00-stories.sql
-- ============================================================================

-- ============================================================================
-- Stories
-- ============================================================================

CREATE TABLE IF NOT EXISTS stories (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  title TEXT,
  published_at TIMESTAMPTZ,
  cluster_reason TEXT,

  official_rss_feed_item_id UUID REFERENCES rss_feed_items(id) ON DELETE SET NULL,
  official_locked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,

  CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 500)
);

CREATE OR REPLACE TRIGGER trigger_stories_updated_at
BEFORE UPDATE ON stories
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_stories__id_desc
ON stories (id DESC)
WHERE deleted_at IS NULL;

-- Index for looking up stories by their official item
CREATE INDEX IF NOT EXISTS idx_stories__official_rss_feed_item_id
ON stories (official_rss_feed_item_id)
WHERE official_rss_feed_item_id IS NOT NULL;

COMMENT ON TABLE stories IS 'Groups of related RSS feed items covering the same news event.';
COMMENT ON COLUMN stories.title IS 'LLM-generated summary title for the story cluster.';
COMMENT ON COLUMN stories.published_at IS 'When the event actually occurred (agent-determined, not row creation time).';
COMMENT ON COLUMN stories.cluster_reason IS 'LLM-generated explanation of why the articles in this story were grouped together.';
COMMENT ON COLUMN stories.official_rss_feed_item_id IS 'The canonical/official item for this story (e.g. original press release).';
COMMENT ON COLUMN stories.official_locked_at IS 'When set by admin, prevents agents from overriding the official item selection.';

-- ==========================================================================
-- 0260-00-00-story-posts.sql
-- ============================================================================

-- Junction table linking story posts to stories
-- One post per story, with the user who initiated the story post creation
CREATE TABLE IF NOT EXISTS post__stories (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  initiated_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (post_id)
);

CREATE OR REPLACE TRIGGER trigger_post__stories_updated_at
BEFORE UPDATE ON post__stories
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- One post per story
CREATE UNIQUE INDEX IF NOT EXISTS idx_post__stories__story_id
ON post__stories (story_id);

COMMENT ON TABLE post__stories IS 'Junction table linking story posts to stories. One post per story.';
COMMENT ON COLUMN post__stories.post_id IS 'FK to the story post.';
COMMENT ON COLUMN post__stories.story_id IS 'FK to the story being discussed.';
COMMENT ON COLUMN post__stories.initiated_by_id IS 'The user who requested the story post creation.';

-- ==========================================================================
-- 0290-00-00-hn-discussions.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS hn_stories (
  hn_item_id BIGINT PRIMARY KEY,
  url_id UUID NOT NULL REFERENCES urls ON DELETE CASCADE,

  title TEXT,
  points INT,
  num_comments INT,
  hn_created_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_hn_stories_updated_at
BEFORE UPDATE ON hn_stories
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_hn_stories__url_id ON hn_stories (url_id);

COMMENT ON TABLE hn_stories IS 'Cached Hacker News top story metadata, synced periodically from the HN Firebase API.';
COMMENT ON COLUMN hn_stories.hn_item_id IS 'HN item ID. Story URL: https://news.ycombinator.com/item?id={hn_item_id}';
COMMENT ON COLUMN hn_stories.url_id IS 'FK to urls table for the story external URL.';
COMMENT ON COLUMN hn_stories.title IS 'Title of the HN submission.';
COMMENT ON COLUMN hn_stories.points IS 'Upvote score of the HN submission.';
COMMENT ON COLUMN hn_stories.num_comments IS 'Number of comments on the HN submission (descendants).';
COMMENT ON COLUMN hn_stories.hn_created_at IS 'When the HN submission was created (unix time from API).';

-- FK for rss_feed_items.story_id (column defined in 0080 without FK due to circular dependency with stories table)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_rss_feed_items_story_id'
      AND conrelid = 'rss_feed_items'::regclass
  ) THEN
    ALTER TABLE rss_feed_items ADD CONSTRAINT fk_rss_feed_items_story_id FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;


ALTER TABLE rss_feed_items VALIDATE CONSTRAINT fk_rss_feed_items_story_id;
