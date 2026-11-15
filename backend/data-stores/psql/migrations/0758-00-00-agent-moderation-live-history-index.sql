-- Post moderation sidecars walk newest live results by post. The full post/id
-- index also contains soft-deleted history, which can make that page read an
-- arbitrarily long deleted tail before reaching its first visible result.
CREATE INDEX IF NOT EXISTS idx_agent_moderations__post_live_newest
  ON agent_moderations (post_id, id DESC) WHERE deleted_at IS NULL;
