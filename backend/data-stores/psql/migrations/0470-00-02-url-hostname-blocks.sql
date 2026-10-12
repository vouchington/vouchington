-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS url_hostname_blocks (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  url_hostname_id UUID NOT NULL REFERENCES url_hostnames ON DELETE CASCADE,
  blocked_by_id UUID REFERENCES users ON DELETE SET NULL,
  blocked_source url_hostname_block_sources NOT NULL DEFAULT 'admin',
  domain_blocklist_source_id BIGINT,
  reason TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  lifted_at TIMESTAMPTZ,
  lifted_by_id UUID REFERENCES users ON DELETE SET NULL,
  CONSTRAINT chk_url_hostname_blocks__domain_source CHECK (
    (blocked_source IN ('url_blocklist', 'email_blocklist')) =
      (domain_blocklist_source_id IS NOT NULL)
  )
);
ALTER TABLE url_hostname_blocks
  ADD CONSTRAINT fk_url_hostname_blocks__domain_blocklist_source
  FOREIGN KEY (domain_blocklist_source_id) REFERENCES domain_blocklist_sources(id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE url_hostname_blocks VALIDATE CONSTRAINT fk_url_hostname_blocks__domain_blocklist_source;

CREATE OR REPLACE TRIGGER trigger_url_hostname_blocks_updated_at
  BEFORE UPDATE ON url_hostname_blocks FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_url_hostname_blocks__hostname ON url_hostname_blocks (url_hostname_id) WHERE lifted_at IS NULL;

CREATE UNIQUE INDEX idx_url_hostname_blocks__active_domain_source
  ON url_hostname_blocks (url_hostname_id, domain_blocklist_source_id)
  WHERE domain_blocklist_source_id IS NOT NULL AND lifted_at IS NULL;

CREATE INDEX idx_url_hostname_blocks__domain_blocklist_source_id
  ON url_hostname_blocks (domain_blocklist_source_id)
  WHERE domain_blocklist_source_id IS NOT NULL;

-- Trigger: keep url_hostnames.blocked in sync with active block history rows.
-- A hostname is blocked iff at least one url_hostname_blocks row exists with lifted_at IS NULL.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_project_url_hostname_blocked()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE url_hostnames
  SET is_blocked = EXISTS (
    SELECT 1 FROM url_hostname_blocks
    WHERE url_hostname_id = COALESCE(NEW.url_hostname_id, OLD.url_hostname_id)
      AND lifted_at IS NULL
      AND blocked_source <> 'email_blocklist'
  )
  WHERE id = COALESCE(NEW.url_hostname_id, OLD.url_hostname_id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_sync_url_hostname_blocked
  AFTER INSERT OR UPDATE OF lifted_at OR DELETE
  ON url_hostname_blocks
  FOR EACH ROW EXECUTE FUNCTION fn_project_url_hostname_blocked();

COMMENT ON TABLE url_hostname_blocks IS 'Append-only history of hostname blocks. url_hostnames.blocked is trigger-maintained from this table and must not be written directly in app code. Canonical insert-then-cancel pattern. See community_bans for reference.';
COMMENT ON COLUMN url_hostname_blocks.url_hostname_id IS 'The blocked hostname.';
COMMENT ON COLUMN url_hostname_blocks.blocked_by_id IS 'Admin who issued the block.';
COMMENT ON COLUMN url_hostname_blocks.blocked_source IS 'Who initiated the block: admin, google_web_risk, parent_hostname, etc.';
COMMENT ON COLUMN url_hostname_blocks.domain_blocklist_source_id IS 'External blacklist source for projected URL or email domain blocks.';
COMMENT ON COLUMN url_hostname_blocks.lifted_at IS 'When the block was lifted. NULL means still active.';
COMMENT ON COLUMN url_hostname_blocks.reason IS 'Optional reason for the block.';
COMMENT ON COLUMN url_hostname_blocks.lifted_by_id IS 'Who lifted the block.';

-- Current indexes for fresh schema bootstrap.
CREATE INDEX IF NOT EXISTS idx_url_hostname_blocks__url_hostname_id
  ON url_hostname_blocks (url_hostname_id)
  WHERE url_hostname_id IS NOT NULL;

-- The input domain is resolved to url_hostname_id before blocklisted_domains is written.
-- Transition-table triggers keep source history synchronized without text-key joins.
CREATE OR REPLACE FUNCTION fn_create_domain_blocklist_hostname_blocks()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO url_hostname_blocks (
    url_hostname_id, domain_blocklist_source_id, blocked_source
  )
  SELECT inserted.url_hostname_id, inserted.source_id,
    CASE source.type
      WHEN 'email' THEN 'email_blocklist'::url_hostname_block_sources
      ELSE 'url_blocklist'::url_hostname_block_sources
    END
  FROM inserted_domains inserted
  JOIN domain_blocklist_sources source ON source.id = inserted.source_id
  ORDER BY inserted.url_hostname_id, inserted.source_id
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_create_domain_blocklist_hostname_blocks
  AFTER INSERT ON blocklisted_domains
  REFERENCING NEW TABLE AS inserted_domains
  FOR EACH STATEMENT EXECUTE FUNCTION fn_create_domain_blocklist_hostname_blocks();

CREATE OR REPLACE FUNCTION fn_project_domain_blocklist_hostname_block_lifts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE url_hostname_blocks block
  SET lifted_at = CURRENT_TIMESTAMP
  FROM deleted_domains deleted
  WHERE block.url_hostname_id = deleted.url_hostname_id
    AND block.domain_blocklist_source_id = deleted.source_id
    AND block.lifted_at IS NULL;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_project_domain_blocklist_hostname_block_lifts
  AFTER DELETE ON blocklisted_domains
  REFERENCING OLD TABLE AS deleted_domains
  FOR EACH STATEMENT EXECUTE FUNCTION fn_project_domain_blocklist_hostname_block_lifts();
