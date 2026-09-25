-- migration-mode: online

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_communities__created_via_oauth_client_id
  ON communities (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_topics__created_via_oauth_client_id
  ON topics (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lists__created_via_oauth_client_id
  ON lists (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rss_feeds__created_via_oauth_client_id
  ON rss_feeds (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_reports__created_via_oauth_client_id
  ON moderation_reports (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_appeals__created_via_oauth_client_id
  ON moderation_appeals (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_applications__created_via_oauth_client_id
  ON community_applications (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_referral_program_links__created_via_oauth_client_id
  ON user_referral_program_links (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS posts__default_created_via_oauth_client_id_idx
  ON posts__default (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;
