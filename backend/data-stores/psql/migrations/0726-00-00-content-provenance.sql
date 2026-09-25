-- Content provenance expand stage. Each user-content table gets its columns in its own migration
-- (0726-00-01 through 0726-00-09) so no transaction holds ACCESS EXCLUSIVE on more than one table.
-- Validation (0726-00-10) and the online indexes (0726-00-11 and 0726-00-12) follow.
DO $$ BEGIN
  CREATE TYPE content_creation_channels AS ENUM ('web', 'swift', 'dotnet', 'api', 'mcp', 'system');
EXCEPTION WHEN duplicate_object THEN
  IF enum_range(NULL::content_creation_channels)::TEXT[]
    IS DISTINCT FROM ARRAY['web', 'swift', 'dotnet', 'api', 'mcp', 'system'] THEN
    RAISE EXCEPTION 'content_creation_channels exists with different labels';
  END IF;
END $$;

COMMENT ON TYPE content_creation_channels IS 'Channel that created a row: a first-party client (web, swift, dotnet), a credentialed agent path (api, mcp), or a platform job (system).';

CREATE OR REPLACE FUNCTION fn_prevent_content_provenance_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.created_via IS DISTINCT FROM OLD.created_via
    OR NEW.created_via_oauth_client_id IS DISTINCT FROM OLD.created_via_oauth_client_id THEN
    RAISE EXCEPTION 'content provenance is immutable';
  END IF;
  RETURN NULL;
END $$;

ALTER TABLE oauth_clients
  ADD COLUMN IF NOT EXISTS metadata_url TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by_id UUID;

-- A Client ID Metadata Document URL: HTTPS, a lowercase host with an optional port, and a path,
-- with no userinfo, fragment, whitespace, control characters or dot segments. Writers canonicalize
-- the URL before storing it, so the unique index sees one spelling per document.
ALTER TABLE oauth_clients
  ADD CONSTRAINT oauth_clients_metadata_url_check
  CHECK (
    metadata_url IS NULL
    OR (
      char_length(metadata_url) <= 2048
      AND metadata_url ~ '^https://[a-z0-9.-]+(:[0-9]{1,5})?/[^#[:space:][:cntrl:]]*$'
      AND metadata_url !~ '/\.\.?(/|\?|$)'
    )
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
