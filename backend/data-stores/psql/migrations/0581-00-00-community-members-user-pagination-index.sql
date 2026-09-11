-- migration-mode: online

-- Fixed migration 0140 originally created a bare user_id index in migrated environments.
-- Build the replacement composite index in-place before dropping the stale shape.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_members__user_id_id
  ON community_members (user_id, id);
DROP INDEX CONCURRENTLY IF EXISTS idx_community_members__user_id;
