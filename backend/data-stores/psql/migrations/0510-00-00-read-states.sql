-- Read state tracking: per-user markers for rss_feed_items and posts.
-- edited-in-place: pre-launch, never deployed to production

CREATE TABLE IF NOT EXISTS rss_feed_item_read_states (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rss_feed_item_id UUID NOT NULL REFERENCES rss_feed_items (id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rss_feed_item_id)
) PARTITION BY RANGE (user_id);

CREATE TABLE IF NOT EXISTS post_read_states (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
) PARTITION BY RANGE (user_id);

COMMENT ON TABLE rss_feed_item_read_states IS 'Tracks which RSS feed items a user has marked as read.';
COMMENT ON COLUMN rss_feed_item_read_states.user_id IS 'The user who marked this item as read.';
COMMENT ON COLUMN rss_feed_item_read_states.rss_feed_item_id IS 'The RSS feed item marked as read.';
COMMENT ON COLUMN rss_feed_item_read_states.read_at IS 'Timestamp when the item was marked as read.';

COMMENT ON TABLE post_read_states IS 'Tracks which posts a user has marked as read.';
COMMENT ON COLUMN post_read_states.user_id IS 'The user who marked this post as read.';
COMMENT ON COLUMN post_read_states.post_id IS 'The post marked as read.';
COMMENT ON COLUMN post_read_states.read_at IS 'Timestamp when the post was marked as read.';

CREATE INDEX IF NOT EXISTS rss_feed_item_read_states__rss_feed_item_id ON rss_feed_item_read_states (rss_feed_item_id);
CREATE INDEX IF NOT EXISTS post_read_states__post_id ON post_read_states (post_id);
