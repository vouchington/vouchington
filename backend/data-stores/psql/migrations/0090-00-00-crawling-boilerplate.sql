-- Coalesced pre-launch domain baseline.
-- Merged from: 0130-00-00-url-boilerplate-removals.sql

-- ==========================================================================
-- 0130-00-00-url-boilerplate-removals.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS boilerplate_removals (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  hostname_id UUID NOT NULL REFERENCES url_hostnames ON DELETE CASCADE,
  parent_path TEXT NOT NULL,
  CHECK (LENGTH(TRIM(parent_path)) > 0 AND LENGTH(parent_path) <= 255),

  results JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trigger_boilerplate_removals_updated_at BEFORE UPDATE ON boilerplate_removals FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_boilerplate_removals__hostname_path ON boilerplate_removals (hostname_id, parent_path);

COMMENT ON TABLE boilerplate_removals IS 'Stores computed boilerplate removal results for a hostname and parent path combination.';
COMMENT ON COLUMN boilerplate_removals.hostname_id IS 'The hostname these removal rules apply to.';
COMMENT ON COLUMN boilerplate_removals.parent_path IS 'The URL parent path pattern for scoping removal rules.';
COMMENT ON COLUMN boilerplate_removals.results IS 'JSONB containing the computed boilerplate removal selectors and rules.';

CREATE TABLE IF NOT EXISTS boilerplate_removal_urls (
  boilerplate_removal_id UUID NOT NULL REFERENCES boilerplate_removals ON DELETE CASCADE,
  url_id UUID NOT NULL REFERENCES urls ON DELETE CASCADE,
  PRIMARY KEY (boilerplate_removal_id, url_id)
);

CREATE INDEX IF NOT EXISTS idx_boilerplate_removal_urls__url_id ON boilerplate_removal_urls (url_id);

COMMENT ON TABLE boilerplate_removal_urls IS 'Join table linking boilerplate removal rules to the specific URLs they were computed from.';
COMMENT ON COLUMN boilerplate_removal_urls.boilerplate_removal_id IS 'The boilerplate removal rule set.';
COMMENT ON COLUMN boilerplate_removal_urls.url_id IS 'A URL used to compute this boilerplate removal.';
