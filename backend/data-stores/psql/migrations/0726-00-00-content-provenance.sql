CREATE OR REPLACE FUNCTION fn_prevent_content_provenance_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.created_via IS DISTINCT FROM OLD.created_via
    OR NEW.created_via_oauth_client_id IS DISTINCT FROM OLD.created_via_oauth_client_id THEN
    RAISE EXCEPTION 'content provenance is immutable';
  END IF;
  RETURN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_clients__metadata_url
  ON oauth_clients (metadata_url);

CREATE INDEX IF NOT EXISTS idx_oauth_clients__verified_by_id
  ON oauth_clients (verified_by_id)
  WHERE verified_by_id IS NOT NULL;

COMMENT ON COLUMN oauth_clients.metadata_url IS 'HTTPS URL of the Client ID Metadata Document for a client identified by URL; NULL for clients registered through dynamic client registration.';
COMMENT ON COLUMN oauth_clients.verified_at IS 'When staff verified a dynamically registered client, so its client_name may appear on public content provenance labels; NULL means unverified.';
COMMENT ON COLUMN oauth_clients.verified_by_id IS 'Staff user who verified the client; NULL when unverified or when that user was deleted.';
