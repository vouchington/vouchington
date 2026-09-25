-- 0726-00-11 built the matching posts__default index online, so this attaches it to the new
-- parent index instead of scanning the partition again.
CREATE INDEX IF NOT EXISTS idx_posts__created_via_oauth_client_id
  ON posts (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;
