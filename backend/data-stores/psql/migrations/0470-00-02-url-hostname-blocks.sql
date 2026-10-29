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
  relation_cleanup_root_block_id UUID,
  should_penalize_relation_creators BOOLEAN NOT NULL DEFAULT FALSE,
  relation_cleanup_progress INTEGER NOT NULL DEFAULT 0,
  relation_cleanup_stage url_hostname_block_cleanup_stages NOT NULL DEFAULT 'subdomains',
  relation_cleanup_resume_after TEXT,
  relation_cleanup_blocked_hostname_count INTEGER NOT NULL DEFAULT 0,
  relation_cleanup_soft_deleted_relation_count INTEGER NOT NULL DEFAULT 0,
  relation_cleanup_penalized_user_count INTEGER NOT NULL DEFAULT 0,
  relation_cleanup_completed_at TIMESTAMPTZ,
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

ALTER TABLE url_hostname_blocks
  ADD CONSTRAINT fk_url_hostname_blocks__relation_cleanup_root_block
  FOREIGN KEY (relation_cleanup_root_block_id) REFERENCES url_hostname_blocks(id)
  ON DELETE SET NULL NOT VALID;
ALTER TABLE url_hostname_blocks
  VALIDATE CONSTRAINT fk_url_hostname_blocks__relation_cleanup_root_block;

ALTER TABLE vote_weight_penalties
  ADD CONSTRAINT fk_vote_weight_penalties__source_hostname_block
  FOREIGN KEY (source_hostname_block_id) REFERENCES url_hostname_blocks(id)
  ON DELETE SET NULL NOT VALID;
ALTER TABLE vote_weight_penalties
  VALIDATE CONSTRAINT fk_vote_weight_penalties__source_hostname_block;

ALTER TABLE url_hostname_blocks
  ADD CONSTRAINT chk_url_hostname_blocks__relation_cleanup_progress
  CHECK (relation_cleanup_progress >= 0) NOT VALID;
ALTER TABLE url_hostname_blocks
  VALIDATE CONSTRAINT chk_url_hostname_blocks__relation_cleanup_progress;

ALTER TABLE url_hostname_blocks
  ADD CONSTRAINT chk_url_hostname_blocks__relation_cleanup_counts
  CHECK (
    relation_cleanup_blocked_hostname_count >= 0
    AND relation_cleanup_soft_deleted_relation_count >= 0
    AND relation_cleanup_penalized_user_count >= 0
  ) NOT VALID;
ALTER TABLE url_hostname_blocks
  VALIDATE CONSTRAINT chk_url_hostname_blocks__relation_cleanup_counts;

CREATE OR REPLACE TRIGGER trigger_url_hostname_blocks_updated_at
  BEFORE UPDATE ON url_hostname_blocks FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_url_hostname_blocks__hostname ON url_hostname_blocks (url_hostname_id) WHERE lifted_at IS NULL;

-- URL-source domains are streamed from blocklisted_domains; scan only independent hostname blocks.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_url_hostname_blocks__active_nonfeed
  ON url_hostname_blocks (url_hostname_id)
  WHERE lifted_at IS NULL AND blocked_source NOT IN ('url_blocklist', 'email_blocklist');

CREATE INDEX IF NOT EXISTS idx_url_hostname_blocks__relation_cleanup_root__hostname
  ON url_hostname_blocks (relation_cleanup_root_block_id, url_hostname_id)
  WHERE relation_cleanup_root_block_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_url_hostname_blocks__pending_relation_cleanup
  ON url_hostname_blocks (id)
  WHERE relation_cleanup_root_block_id = id AND relation_cleanup_completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vote_weight_penalties__hostname_block
  ON vote_weight_penalties (source_hostname_block_id, user_id)
  WHERE source_hostname_block_id IS NOT NULL;

CREATE UNIQUE INDEX idx_url_hostname_blocks__active_domain_source
  ON url_hostname_blocks (url_hostname_id, domain_blocklist_source_id)
  WHERE domain_blocklist_source_id IS NOT NULL AND lifted_at IS NULL;

CREATE INDEX idx_url_hostname_blocks__domain_blocklist_source_id
  ON url_hostname_blocks (domain_blocklist_source_id)
  WHERE domain_blocklist_source_id IS NOT NULL;

CREATE INDEX idx_url_hostname_blocks__feed_retention
  ON url_hostname_blocks (lifted_at, id)
  WHERE lifted_at IS NOT NULL AND domain_blocklist_source_id IS NOT NULL;
CREATE INDEX idx_url_hostname_blocks__other_retention
  ON url_hostname_blocks (lifted_at, id)
  WHERE lifted_at IS NOT NULL AND domain_blocklist_source_id IS NULL;

-- Project active URL blocks in one update per statement. Email blocks never change crawl policy.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_update_url_hostname_blocked_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Lock every affected hostname even when it is already blocked. A concurrent
  -- source removal must wait, then evaluate the remaining blocks in a fresh
  -- READ COMMITTED statement.
  PERFORM host.id FROM url_hostnames host
  JOIN (
    SELECT DISTINCT url_hostname_id AS id FROM inserted_blocks
    WHERE lifted_at IS NULL AND blocked_source <> 'email_blocklist'
  ) affected ON affected.id = host.id
  ORDER BY host.id FOR UPDATE OF host;

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
  PERFORM host.id FROM url_hostnames host
  JOIN (WITH prior_active AS (
    SELECT DISTINCT url_hostname_id AS id FROM prior_blocks
    WHERE lifted_at IS NULL AND blocked_source <> 'email_blocklist'
  ), updated_active AS (
    SELECT DISTINCT url_hostname_id AS id FROM updated_blocks
    WHERE lifted_at IS NULL AND blocked_source <> 'email_blocklist'
  )
    (SELECT id FROM prior_active EXCEPT SELECT id FROM updated_active)
    UNION
    (SELECT id FROM updated_active EXCEPT SELECT id FROM prior_active)
  ) affected ON affected.id = host.id
  ORDER BY host.id FOR UPDATE OF host;

  WITH prior_active AS MATERIALIZED (
    SELECT DISTINCT url_hostname_id AS id FROM prior_blocks
    WHERE lifted_at IS NULL AND blocked_source <> 'email_blocklist'
  ), updated_active AS MATERIALIZED (
    SELECT DISTINCT url_hostname_id AS id FROM updated_blocks
    WHERE lifted_at IS NULL AND blocked_source <> 'email_blocklist'
  ), affected AS MATERIALIZED (
    (SELECT id FROM prior_active EXCEPT SELECT id FROM updated_active)
    UNION
    (SELECT id FROM updated_active EXCEPT SELECT id FROM prior_active)
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
  PERFORM host.id FROM url_hostnames host
  JOIN (
    SELECT DISTINCT url_hostname_id AS id FROM deleted_blocks
    WHERE lifted_at IS NULL AND blocked_source <> 'email_blocklist'
  ) affected ON affected.id = host.id
  ORDER BY host.id FOR UPDATE OF host;

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
COMMENT ON COLUMN url_hostname_blocks.relation_cleanup_root_block_id IS 'First owning staff or provider block whose bounded cleanup operation owns this hostname; self-reference marks the operation root.';
COMMENT ON COLUMN url_hostname_blocks.should_penalize_relation_creators IS 'Immutable creator-penalty intent captured when the cleanup root is first created.';
COMMENT ON COLUMN url_hostname_blocks.relation_cleanup_progress IS 'Monotonic generation used to fence and identify bounded cleanup continuation jobs.';
COMMENT ON COLUMN url_hostname_blocks.relation_cleanup_stage IS 'Stage the bounded cleanup operation is in; descendants may attach to a root only while it is still projecting subdomains.';
COMMENT ON COLUMN url_hostname_blocks.relation_cleanup_resume_after IS 'Keyset position (reversed hostname or user id) at which a lost continuation job resumes the current stage.';
COMMENT ON COLUMN url_hostname_blocks.relation_cleanup_blocked_hostname_count IS 'Durable total of hostnames first assigned to this bounded cleanup operation.';
COMMENT ON COLUMN url_hostname_blocks.relation_cleanup_soft_deleted_relation_count IS 'Durable total of relations soft-deleted by this bounded cleanup operation.';
COMMENT ON COLUMN url_hostname_blocks.relation_cleanup_penalized_user_count IS 'Durable total of distinct creator penalties inserted by this bounded cleanup operation.';
COMMENT ON COLUMN url_hostname_blocks.relation_cleanup_completed_at IS 'When every hostname, URL, relation, and penalty page owned by this root finished processing.';

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
