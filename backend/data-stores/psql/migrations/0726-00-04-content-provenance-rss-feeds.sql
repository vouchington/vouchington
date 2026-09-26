-- Metadata-only change: the ACCESS EXCLUSIVE lock commits before 0726-00-10 validates the
-- constraints and 0726-00-11 builds the index online.

ALTER TABLE rss_feeds
  ADD CONSTRAINT rss_feeds_created_via_oauth_client_id_fkey
  FOREIGN KEY (created_via_oauth_client_id) REFERENCES oauth_clients(id) ON DELETE RESTRICT
  NOT VALID;


CREATE OR REPLACE TRIGGER rss_feeds_content_provenance_immutable
  AFTER UPDATE ON rss_feeds
  FOR EACH ROW
  WHEN (
    OLD.created_via IS DISTINCT FROM NEW.created_via
    OR OLD.created_via_oauth_client_id IS DISTINCT FROM NEW.created_via_oauth_client_id
  )
  EXECUTE FUNCTION fn_prevent_content_provenance_update();

COMMENT ON COLUMN rss_feeds.created_via IS 'Immutable channel that created the row; NULL for rows written before content provenance tracking.';
COMMENT ON COLUMN rss_feeds.created_via_oauth_client_id IS 'Immutable OAuth client that created the row through the API or MCP; NULL for session, API-key, and system writes.';
