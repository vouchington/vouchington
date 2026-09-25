-- Metadata-only change: the ACCESS EXCLUSIVE lock commits before 0726-00-10 validates the
-- constraints and 0726-00-11 builds the index online.
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

CREATE OR REPLACE TRIGGER moderation_appeals_content_provenance_immutable
  AFTER UPDATE ON moderation_appeals
  FOR EACH ROW
  WHEN (
    OLD.created_via IS DISTINCT FROM NEW.created_via
    OR OLD.created_via_oauth_client_id IS DISTINCT FROM NEW.created_via_oauth_client_id
  )
  EXECUTE FUNCTION fn_prevent_content_provenance_update();

COMMENT ON COLUMN moderation_appeals.created_via IS 'Immutable channel that created the row; NULL for rows written before content provenance tracking.';
COMMENT ON COLUMN moderation_appeals.created_via_oauth_client_id IS 'Immutable OAuth client that created the row through the API or MCP; NULL for session, API-key, and system writes.';
