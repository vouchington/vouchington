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

-- Project active URL blocks in one update per statement. Email blocks never change crawl policy.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_update_url_hostname_blocked_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  WITH affected AS MATERIALIZED (
    SELECT DISTINCT url_hostname_id AS id FROM inserted_blocks
    WHERE lifted_at IS NULL AND blocked_source <> 'email_blocklist'
  )
  UPDATE url_hostnames host SET is_blocked = TRUE
  FROM affected WHERE host.id = affected.id AND NOT host.is_blocked;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_update_url_hostname_blocked_after_insert
  AFTER INSERT ON url_hostname_blocks
  REFERENCING NEW TABLE AS inserted_blocks
  FOR EACH STATEMENT EXECUTE FUNCTION fn_update_url_hostname_blocked_after_insert();

CREATE OR REPLACE FUNCTION fn_update_url_hostname_blocked_after_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  WITH affected AS MATERIALIZED (
    SELECT url_hostname_id AS id FROM prior_blocks
    WHERE lifted_at IS NULL AND blocked_source <> 'email_blocklist'
    UNION
    SELECT url_hostname_id AS id FROM updated_blocks
    WHERE lifted_at IS NULL AND blocked_source <> 'email_blocklist'
  ), states AS MATERIALIZED (
    SELECT affected.id, EXISTS (
      SELECT 1 FROM url_hostname_blocks block
      WHERE block.url_hostname_id = affected.id
        AND block.lifted_at IS NULL AND block.blocked_source <> 'email_blocklist'
    ) AS is_blocked FROM affected
  )
  UPDATE url_hostnames host SET is_blocked = states.is_blocked
  FROM states WHERE host.id = states.id AND host.is_blocked IS DISTINCT FROM states.is_blocked;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_update_url_hostname_blocked_after_update
  AFTER UPDATE ON url_hostname_blocks
  REFERENCING OLD TABLE AS prior_blocks NEW TABLE AS updated_blocks
  FOR EACH STATEMENT EXECUTE FUNCTION fn_update_url_hostname_blocked_after_update();

CREATE OR REPLACE FUNCTION fn_update_url_hostname_blocked_after_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  WITH affected AS MATERIALIZED (
    SELECT DISTINCT url_hostname_id AS id FROM deleted_blocks
    WHERE lifted_at IS NULL AND blocked_source <> 'email_blocklist'
  ), states AS MATERIALIZED (
    SELECT affected.id, EXISTS (
      SELECT 1 FROM url_hostname_blocks block
      WHERE block.url_hostname_id = affected.id
        AND block.lifted_at IS NULL AND block.blocked_source <> 'email_blocklist'
    ) AS is_blocked FROM affected
  )
  UPDATE url_hostnames host SET is_blocked = states.is_blocked
  FROM states WHERE host.id = states.id AND host.is_blocked IS DISTINCT FROM states.is_blocked;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_update_url_hostname_blocked_after_delete
  AFTER DELETE ON url_hostname_blocks
  REFERENCING OLD TABLE AS deleted_blocks
  FOR EACH STATEMENT EXECUTE FUNCTION fn_update_url_hostname_blocked_after_delete();

CREATE OR REPLACE FUNCTION fn_update_domain_blocklist_hostname_block_source()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE url_hostname_blocks block
  SET blocked_source = CASE NEW.type
    WHEN 'email' THEN 'email_blocklist'::url_hostname_block_sources
    ELSE 'url_blocklist'::url_hostname_block_sources
  END
  WHERE block.domain_blocklist_source_id = NEW.id
    AND block.lifted_at IS NULL
    AND block.blocked_source IS DISTINCT FROM CASE NEW.type
      WHEN 'email' THEN 'email_blocklist'::url_hostname_block_sources
      ELSE 'url_blocklist'::url_hostname_block_sources
    END;
  IF NEW.type = 'url' THEN
    UPDATE url_hostnames host
    SET publicly_introduced_at = COALESCE(host.publicly_introduced_at, CURRENT_TIMESTAMP)
    FROM blocklisted_domains domain
    WHERE domain.source_id = NEW.id
      AND domain.url_hostname_id = host.id
      AND host.publicly_introduced_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_update_domain_blocklist_hostname_block_source
  AFTER UPDATE OF type ON domain_blocklist_sources
  FOR EACH ROW WHEN (OLD.type IS DISTINCT FROM NEW.type)
  EXECUTE FUNCTION fn_update_domain_blocklist_hostname_block_source();

COMMENT ON FUNCTION fn_update_url_hostname_blocked_after_insert() IS 'Project active URL blocks into hostname crawl policy once per insert statement.';
COMMENT ON FUNCTION fn_update_url_hostname_blocked_after_update() IS 'Recompute crawl policy for URL block changes once per update statement.';
COMMENT ON FUNCTION fn_update_url_hostname_blocked_after_delete() IS 'Recompute crawl policy for URL block removals once per delete statement.';
COMMENT ON FUNCTION fn_update_domain_blocklist_hostname_block_source() IS 'Keep projected block kinds aligned with the configured source type and permanently introduce URL-source domains to public hostname reads.';

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
