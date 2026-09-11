-- User playback position for podcast episodes.
-- Keyed by (user_id, rss_feed_item_id); one row per user per episode.
-- position_seconds is updated continuously while playing.
-- completed_at is set (once) when the episode ends.

CREATE TABLE IF NOT EXISTS podcast_playback_positions (
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rss_feed_item_id UUID NOT NULL REFERENCES rss_feed_items(id) ON DELETE CASCADE,
  position_seconds FLOAT NOT NULL DEFAULT 0,
  completed_at     TIMESTAMPTZ NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, rss_feed_item_id)
);

CREATE INDEX IF NOT EXISTS idx_podcast_playback_positions_rss_feed_item_id
ON podcast_playback_positions (rss_feed_item_id);

CREATE OR REPLACE TRIGGER trigger_podcast_playback_positions_updated_at
BEFORE UPDATE ON podcast_playback_positions
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE podcast_playback_positions IS 'Tracks per-user playback progress for podcast episodes. One row per (user, rss_feed_item) pair; position_seconds is upserted continuously.';
COMMENT ON COLUMN podcast_playback_positions.user_id IS 'The user whose playback position is being tracked.';
COMMENT ON COLUMN podcast_playback_positions.rss_feed_item_id IS 'The podcast episode (rss_feed_items row) being tracked.';
COMMENT ON COLUMN podcast_playback_positions.position_seconds IS 'Current playback offset in seconds. Updated on every periodic PUT.';
COMMENT ON COLUMN podcast_playback_positions.completed_at IS 'Timestamp when the episode was played to completion. NULL if not yet completed. Timestamp over boolean per schema convention.';
COMMENT ON COLUMN podcast_playback_positions.updated_at IS 'Updated automatically via trigger on every write.';
