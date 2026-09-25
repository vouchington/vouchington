DO $$ BEGIN
  CREATE TYPE content_creation_channels AS ENUM ('web', 'swift', 'dotnet', 'api', 'mcp', 'system');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE content_creation_channels IS 'Channel that created a row: a first-party client (web, swift, dotnet), a credentialed agent path (api, mcp), or a platform job (system).';

CREATE OR REPLACE FUNCTION fn_prevent_content_provenance_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.created_via IS DISTINCT FROM OLD.created_via
    OR NEW.created_via_oauth_client_id IS DISTINCT FROM OLD.created_via_oauth_client_id THEN
    RAISE EXCEPTION 'content provenance is immutable';
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS created_via content_creation_channels,
  ADD COLUMN IF NOT EXISTS created_via_oauth_client_id UUID;

ALTER TABLE posts
  ADD CONSTRAINT posts_created_via_oauth_client_id_fkey
  FOREIGN KEY (created_via_oauth_client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE posts
  ADD CONSTRAINT posts_created_via_oauth_client_id_check
  CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp')))
  NOT VALID;

ALTER TABLE posts
  VALIDATE CONSTRAINT posts_created_via_oauth_client_id_fkey;

ALTER TABLE posts
  VALIDATE CONSTRAINT posts_created_via_oauth_client_id_check;

CREATE INDEX IF NOT EXISTS idx_posts__created_via_oauth_client_id
  ON posts (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE TRIGGER posts_content_provenance_immutable
  BEFORE UPDATE OF created_via, created_via_oauth_client_id ON posts
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_content_provenance_update();

COMMENT ON COLUMN posts.created_via IS 'Immutable channel that created the row; NULL for rows written before content provenance tracking.';
COMMENT ON COLUMN posts.created_via_oauth_client_id IS 'Immutable OAuth client that created the row through the API or MCP; NULL for session, API-key, and system writes.';

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS created_via content_creation_channels,
  ADD COLUMN IF NOT EXISTS created_via_oauth_client_id UUID;

ALTER TABLE communities
  ADD CONSTRAINT communities_created_via_oauth_client_id_fkey
  FOREIGN KEY (created_via_oauth_client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE communities
  ADD CONSTRAINT communities_created_via_oauth_client_id_check
  CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp')))
  NOT VALID;

ALTER TABLE communities
  VALIDATE CONSTRAINT communities_created_via_oauth_client_id_fkey;

ALTER TABLE communities
  VALIDATE CONSTRAINT communities_created_via_oauth_client_id_check;

CREATE INDEX IF NOT EXISTS idx_communities__created_via_oauth_client_id
  ON communities (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE TRIGGER communities_content_provenance_immutable
  BEFORE UPDATE OF created_via, created_via_oauth_client_id ON communities
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_content_provenance_update();

COMMENT ON COLUMN communities.created_via IS 'Immutable channel that created the row; NULL for rows written before content provenance tracking.';
COMMENT ON COLUMN communities.created_via_oauth_client_id IS 'Immutable OAuth client that created the row through the API or MCP; NULL for session, API-key, and system writes.';

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS created_via content_creation_channels,
  ADD COLUMN IF NOT EXISTS created_via_oauth_client_id UUID;

ALTER TABLE topics
  ADD CONSTRAINT topics_created_via_oauth_client_id_fkey
  FOREIGN KEY (created_via_oauth_client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE topics
  ADD CONSTRAINT topics_created_via_oauth_client_id_check
  CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp')))
  NOT VALID;

ALTER TABLE topics
  VALIDATE CONSTRAINT topics_created_via_oauth_client_id_fkey;

ALTER TABLE topics
  VALIDATE CONSTRAINT topics_created_via_oauth_client_id_check;

CREATE INDEX IF NOT EXISTS idx_topics__created_via_oauth_client_id
  ON topics (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE TRIGGER topics_content_provenance_immutable
  BEFORE UPDATE OF created_via, created_via_oauth_client_id ON topics
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_content_provenance_update();

COMMENT ON COLUMN topics.created_via IS 'Immutable channel that created the row; NULL for rows written before content provenance tracking.';
COMMENT ON COLUMN topics.created_via_oauth_client_id IS 'Immutable OAuth client that created the row through the API or MCP; NULL for session, API-key, and system writes.';

ALTER TABLE lists
  ADD COLUMN IF NOT EXISTS created_via content_creation_channels,
  ADD COLUMN IF NOT EXISTS created_via_oauth_client_id UUID;

ALTER TABLE lists
  ADD CONSTRAINT lists_created_via_oauth_client_id_fkey
  FOREIGN KEY (created_via_oauth_client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE lists
  ADD CONSTRAINT lists_created_via_oauth_client_id_check
  CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp')))
  NOT VALID;

ALTER TABLE lists
  VALIDATE CONSTRAINT lists_created_via_oauth_client_id_fkey;

ALTER TABLE lists
  VALIDATE CONSTRAINT lists_created_via_oauth_client_id_check;

CREATE INDEX IF NOT EXISTS idx_lists__created_via_oauth_client_id
  ON lists (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE TRIGGER lists_content_provenance_immutable
  BEFORE UPDATE OF created_via, created_via_oauth_client_id ON lists
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_content_provenance_update();

COMMENT ON COLUMN lists.created_via IS 'Immutable channel that created the row; NULL for rows written before content provenance tracking.';
COMMENT ON COLUMN lists.created_via_oauth_client_id IS 'Immutable OAuth client that created the row through the API or MCP; NULL for session, API-key, and system writes.';

ALTER TABLE rss_feeds
  ADD COLUMN IF NOT EXISTS created_via content_creation_channels,
  ADD COLUMN IF NOT EXISTS created_via_oauth_client_id UUID;

ALTER TABLE rss_feeds
  ADD CONSTRAINT rss_feeds_created_via_oauth_client_id_fkey
  FOREIGN KEY (created_via_oauth_client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE rss_feeds
  ADD CONSTRAINT rss_feeds_created_via_oauth_client_id_check
  CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp')))
  NOT VALID;

ALTER TABLE rss_feeds
  VALIDATE CONSTRAINT rss_feeds_created_via_oauth_client_id_fkey;

ALTER TABLE rss_feeds
  VALIDATE CONSTRAINT rss_feeds_created_via_oauth_client_id_check;

CREATE INDEX IF NOT EXISTS idx_rss_feeds__created_via_oauth_client_id
  ON rss_feeds (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE TRIGGER rss_feeds_content_provenance_immutable
  BEFORE UPDATE OF created_via, created_via_oauth_client_id ON rss_feeds
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_content_provenance_update();

COMMENT ON COLUMN rss_feeds.created_via IS 'Immutable channel that created the row; NULL for rows written before content provenance tracking.';
COMMENT ON COLUMN rss_feeds.created_via_oauth_client_id IS 'Immutable OAuth client that created the row through the API or MCP; NULL for session, API-key, and system writes.';

ALTER TABLE moderation_reports
  ADD COLUMN IF NOT EXISTS created_via content_creation_channels,
  ADD COLUMN IF NOT EXISTS created_via_oauth_client_id UUID;

ALTER TABLE moderation_reports
  ADD CONSTRAINT moderation_reports_created_via_oauth_client_id_fkey
  FOREIGN KEY (created_via_oauth_client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE moderation_reports
  ADD CONSTRAINT moderation_reports_created_via_oauth_client_id_check
  CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp')))
  NOT VALID;

ALTER TABLE moderation_reports
  VALIDATE CONSTRAINT moderation_reports_created_via_oauth_client_id_fkey;

ALTER TABLE moderation_reports
  VALIDATE CONSTRAINT moderation_reports_created_via_oauth_client_id_check;

CREATE INDEX IF NOT EXISTS idx_moderation_reports__created_via_oauth_client_id
  ON moderation_reports (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE TRIGGER moderation_reports_content_provenance_immutable
  BEFORE UPDATE OF created_via, created_via_oauth_client_id ON moderation_reports
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_content_provenance_update();

COMMENT ON COLUMN moderation_reports.created_via IS 'Immutable channel that created the row; NULL for rows written before content provenance tracking.';
COMMENT ON COLUMN moderation_reports.created_via_oauth_client_id IS 'Immutable OAuth client that created the row through the API or MCP; NULL for session, API-key, and system writes.';

ALTER TABLE moderation_appeals
  ADD COLUMN IF NOT EXISTS created_via content_creation_channels,
  ADD COLUMN IF NOT EXISTS created_via_oauth_client_id UUID;

ALTER TABLE moderation_appeals
  ADD CONSTRAINT moderation_appeals_created_via_oauth_client_id_fkey
  FOREIGN KEY (created_via_oauth_client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE moderation_appeals
  ADD CONSTRAINT moderation_appeals_created_via_oauth_client_id_check
  CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp')))
  NOT VALID;

ALTER TABLE moderation_appeals
  VALIDATE CONSTRAINT moderation_appeals_created_via_oauth_client_id_fkey;

ALTER TABLE moderation_appeals
  VALIDATE CONSTRAINT moderation_appeals_created_via_oauth_client_id_check;

CREATE INDEX IF NOT EXISTS idx_moderation_appeals__created_via_oauth_client_id
  ON moderation_appeals (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE TRIGGER moderation_appeals_content_provenance_immutable
  BEFORE UPDATE OF created_via, created_via_oauth_client_id ON moderation_appeals
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_content_provenance_update();

COMMENT ON COLUMN moderation_appeals.created_via IS 'Immutable channel that created the row; NULL for rows written before content provenance tracking.';
COMMENT ON COLUMN moderation_appeals.created_via_oauth_client_id IS 'Immutable OAuth client that created the row through the API or MCP; NULL for session, API-key, and system writes.';

ALTER TABLE community_applications
  ADD COLUMN IF NOT EXISTS created_via content_creation_channels,
  ADD COLUMN IF NOT EXISTS created_via_oauth_client_id UUID;

ALTER TABLE community_applications
  ADD CONSTRAINT community_applications_created_via_oauth_client_id_fkey
  FOREIGN KEY (created_via_oauth_client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE community_applications
  ADD CONSTRAINT community_applications_created_via_oauth_client_id_check
  CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp')))
  NOT VALID;

ALTER TABLE community_applications
  VALIDATE CONSTRAINT community_applications_created_via_oauth_client_id_fkey;

ALTER TABLE community_applications
  VALIDATE CONSTRAINT community_applications_created_via_oauth_client_id_check;

CREATE INDEX IF NOT EXISTS idx_community_applications__created_via_oauth_client_id
  ON community_applications (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE TRIGGER community_applications_content_provenance_immutable
  BEFORE UPDATE OF created_via, created_via_oauth_client_id ON community_applications
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_content_provenance_update();

COMMENT ON COLUMN community_applications.created_via IS 'Immutable channel that created the row; NULL for rows written before content provenance tracking.';
COMMENT ON COLUMN community_applications.created_via_oauth_client_id IS 'Immutable OAuth client that created the row through the API or MCP; NULL for session, API-key, and system writes.';

ALTER TABLE user_referral_program_links
  ADD COLUMN IF NOT EXISTS created_via content_creation_channels,
  ADD COLUMN IF NOT EXISTS created_via_oauth_client_id UUID;

ALTER TABLE user_referral_program_links
  ADD CONSTRAINT user_referral_program_links_created_via_oauth_client_id_fkey
  FOREIGN KEY (created_via_oauth_client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE user_referral_program_links
  ADD CONSTRAINT user_referral_program_links_created_via_oauth_client_id_check
  CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp')))
  NOT VALID;

ALTER TABLE user_referral_program_links
  VALIDATE CONSTRAINT user_referral_program_links_created_via_oauth_client_id_fkey;

ALTER TABLE user_referral_program_links
  VALIDATE CONSTRAINT user_referral_program_links_created_via_oauth_client_id_check;

CREATE INDEX IF NOT EXISTS idx_user_referral_program_links__created_via_oauth_client_id
  ON user_referral_program_links (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;

CREATE TRIGGER user_referral_program_links_content_provenance_immutable
  BEFORE UPDATE OF created_via, created_via_oauth_client_id ON user_referral_program_links
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_content_provenance_update();

COMMENT ON COLUMN user_referral_program_links.created_via IS 'Immutable channel that created the row; NULL for rows written before content provenance tracking.';
COMMENT ON COLUMN user_referral_program_links.created_via_oauth_client_id IS 'Immutable OAuth client that created the row through the API or MCP; NULL for session, API-key, and system writes.';

ALTER TABLE oauth_clients
  ADD COLUMN IF NOT EXISTS metadata_url TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by_id UUID;

ALTER TABLE oauth_clients
  ADD CONSTRAINT oauth_clients_metadata_url_check
  CHECK (
    metadata_url IS NULL
    OR (char_length(metadata_url) <= 2048 AND metadata_url ~ '^https://[^/?#@]+/[^#]*$')
  )
  NOT VALID;

ALTER TABLE oauth_clients
  ADD CONSTRAINT oauth_clients_verified_by_id_fkey
  FOREIGN KEY (verified_by_id) REFERENCES users(id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE oauth_clients
  ADD CONSTRAINT oauth_clients_verified_by_id_check
  CHECK (verified_by_id IS NULL OR verified_at IS NOT NULL)
  NOT VALID;

ALTER TABLE oauth_clients
  VALIDATE CONSTRAINT oauth_clients_metadata_url_check;

ALTER TABLE oauth_clients
  VALIDATE CONSTRAINT oauth_clients_verified_by_id_fkey;

ALTER TABLE oauth_clients
  VALIDATE CONSTRAINT oauth_clients_verified_by_id_check;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_clients__metadata_url
  ON oauth_clients (metadata_url);

CREATE INDEX IF NOT EXISTS idx_oauth_clients__verified_by_id
  ON oauth_clients (verified_by_id)
  WHERE verified_by_id IS NOT NULL;

COMMENT ON COLUMN oauth_clients.metadata_url IS 'HTTPS URL of the Client ID Metadata Document for a client identified by URL; NULL for clients registered through dynamic client registration.';
COMMENT ON COLUMN oauth_clients.verified_at IS 'When staff verified a dynamically registered client, so its client_name may appear on public content provenance labels; NULL means unverified.';
COMMENT ON COLUMN oauth_clients.verified_by_id IS 'Staff user who verified the client; NULL when unverified or when that user was deleted.';
