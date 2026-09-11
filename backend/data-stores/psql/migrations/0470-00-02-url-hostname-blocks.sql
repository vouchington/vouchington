-- edited-in-place: pre-launch, never deployed to production
CREATE TABLE IF NOT EXISTS url_hostname_blocks (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  url_hostname_id UUID NOT NULL REFERENCES url_hostnames ON DELETE CASCADE,
  blocked_by_id UUID REFERENCES users ON DELETE SET NULL,
  blocked_source TEXT NOT NULL DEFAULT 'admin',
  reason TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  lifted_at TIMESTAMPTZ,
  lifted_by_id UUID REFERENCES users ON DELETE SET NULL
);

CREATE OR REPLACE TRIGGER trigger_url_hostname_blocks_updated_at
  BEFORE UPDATE ON url_hostname_blocks FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_url_hostname_blocks__hostname ON url_hostname_blocks (url_hostname_id) WHERE lifted_at IS NULL;

-- Trigger: keep url_hostnames.blocked in sync with active block history rows.
-- A hostname is blocked iff at least one url_hostname_blocks row exists with lifted_at IS NULL.
CREATE OR REPLACE FUNCTION fn_sync_url_hostname_blocked()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE url_hostnames
  SET blocked = EXISTS (
    SELECT 1 FROM url_hostname_blocks
    WHERE url_hostname_id = COALESCE(NEW.url_hostname_id, OLD.url_hostname_id)
      AND lifted_at IS NULL
  )
  WHERE id = COALESCE(NEW.url_hostname_id, OLD.url_hostname_id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_sync_url_hostname_blocked
  AFTER INSERT OR UPDATE OF lifted_at OR DELETE
  ON url_hostname_blocks
  FOR EACH ROW EXECUTE FUNCTION fn_sync_url_hostname_blocked();

COMMENT ON TABLE url_hostname_blocks IS 'Append-only history of hostname blocks. url_hostnames.blocked is trigger-maintained from this table and must not be written directly in app code. Canonical insert-then-cancel pattern. See community_bans for reference.';
COMMENT ON COLUMN url_hostname_blocks.url_hostname_id IS 'The blocked hostname.';
COMMENT ON COLUMN url_hostname_blocks.blocked_by_id IS 'Admin who issued the block.';
COMMENT ON COLUMN url_hostname_blocks.blocked_source IS 'Who initiated the block: admin, google_web_risk, parent_hostname, etc.';
COMMENT ON COLUMN url_hostname_blocks.lifted_at IS 'When the block was lifted. NULL means still active.';
COMMENT ON COLUMN url_hostname_blocks.reason IS 'Optional reason for the block.';
COMMENT ON COLUMN url_hostname_blocks.lifted_by_id IS 'Who lifted the block.';
