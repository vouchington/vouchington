-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_clients__metadata_url
  ON oauth_clients (metadata_url);

CREATE INDEX IF NOT EXISTS idx_oauth_clients__verified_by_id
  ON oauth_clients (verified_by_id)
  WHERE verified_by_id IS NOT NULL;

COMMENT ON COLUMN oauth_clients.metadata_url IS 'HTTPS URL of the Client ID Metadata Document, or a local HTTP first-party native client document URL; NULL for dynamically registered clients.';
COMMENT ON COLUMN oauth_clients.verified_at IS 'When staff verified a dynamically registered client, so its client_name may appear on public content provenance labels; NULL means unverified.';
COMMENT ON COLUMN oauth_clients.verified_by_id IS 'Staff user who verified the client; NULL when unverified or when that user was deleted.';
