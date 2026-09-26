-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- Merged from: 0080-00-00-referral-links.sql

-- ==========================================================================
-- 0080-00-00-referral-links.sql
-- ============================================================================

-- NOTE: users can have multiple links for the same referral program.
-- we just show one
CREATE TABLE IF NOT EXISTS user_referral_program_links (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  created_via content_creation_channels,
  created_via_oauth_client_id UUID,
  CONSTRAINT user_referral_program_links_created_via_oauth_client_id_check CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp'))),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  referral_program_id UUID NOT NULL REFERENCES topics__referral_programs ON DELETE CASCADE,
  url_id UUID NOT NULL REFERENCES urls ON DELETE CASCADE,

  label TEXT CHECK (char_length(label) <= 255),

  activated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deactivated_at TIMESTAMPTZ,
  CHECK (NOT (activated_at IS NOT NULL AND deactivated_at IS NOT NULL)),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,

  consecutive_crawl_failures SMALLINT NOT NULL DEFAULT 0,
  last_crawl_failure_at TIMESTAMPTZ,
  last_crawl_success_at TIMESTAMPTZ,
  last_crawl_id UUID,

  -- self-referential: NULL for a normal, manually-added link; set for an unfurled
  -- per-card child. ON DELETE CASCADE means hard-deleting a parent hard-deletes its
  -- children too (soft-delete cascade is handled in application code).
  parent_link_id UUID REFERENCES user_referral_program_links(id) ON DELETE CASCADE,

  -- unfurl intent/outcome, set only on a parent link (NULL on children)
  unfurl_requested_at TIMESTAMPTZ,
  unfurl_completed_at TIMESTAMPTZ,
  unfurl_failed_at TIMESTAMPTZ,
  unfurl_last_error TEXT CHECK (char_length(unfurl_last_error) <= 1000),

  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL
);

CREATE OR REPLACE TRIGGER trigger_user_referral_program_links_updated_at
BEFORE UPDATE ON user_referral_program_links
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- for searching a referral program's links
CREATE INDEX IF NOT EXISTS idx_user_referral_program_links__referral_program_id__user_id
ON user_referral_program_links (referral_program_id, user_id)
WHERE activated_at IS NOT NULL
  AND deleted_at IS NULL;

-- for looking up links by URL
CREATE INDEX IF NOT EXISTS idx_user_referral_program_links__url_id
ON user_referral_program_links (url_id)
WHERE deleted_at IS NULL;

-- unique constraint to prevent duplicate links per user/program/url
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_referral_program_links__unique
ON user_referral_program_links (user_id, referral_program_id, url_id)
WHERE deleted_at IS NULL;

-- referential-integrity-usable leading index for the parent_link_id FK: cascade/RESTRICT
-- checks must see soft-deleted children too, so this one carries no deleted_at predicate.
CREATE INDEX IF NOT EXISTS idx_user_referral_program_links__parent_link_id
ON user_referral_program_links (parent_link_id)
WHERE parent_link_id IS NOT NULL;

-- for looking up a parent's *active* children (unfurl reconcile/visibility) without
-- rechecking deleted_at per row
CREATE INDEX IF NOT EXISTS idx_user_referral_program_links__parent_link_id_active
ON user_referral_program_links (parent_link_id)
WHERE parent_link_id IS NOT NULL
  AND deleted_at IS NULL;

-- for the unfurl dispatcher to self-heal parents stuck requested-but-not-completed
CREATE INDEX IF NOT EXISTS idx_user_referral_program_links__unfurl_requested
ON user_referral_program_links (unfurl_requested_at)
WHERE unfurl_requested_at IS NOT NULL
  AND unfurl_completed_at IS NULL
  AND unfurl_failed_at IS NULL
  AND deleted_at IS NULL;

COMMENT ON TABLE user_referral_program_links IS 'User-submitted referral program links; a user may have multiple links per program but only one is shown.';
COMMENT ON COLUMN user_referral_program_links.user_id IS 'The user who owns this referral link.';
COMMENT ON COLUMN user_referral_program_links.referral_program_id IS 'The referral program (topic) this link belongs to.';
COMMENT ON COLUMN user_referral_program_links.url_id IS 'The URL entity for the referral link.';
COMMENT ON COLUMN user_referral_program_links.label IS 'Optional user-provided display label for the link.';
COMMENT ON COLUMN user_referral_program_links.activated_at IS 'When the link was activated for display; NULL if never activated.';
COMMENT ON COLUMN user_referral_program_links.deactivated_at IS 'When the link was deactivated; mutually exclusive with activated_at.';
COMMENT ON COLUMN user_referral_program_links.consecutive_crawl_failures IS 'Number of consecutive crawl failures; resets to 0 on success.';
COMMENT ON COLUMN user_referral_program_links.last_crawl_failure_at IS 'Timestamp of the most recent crawl failure.';
COMMENT ON COLUMN user_referral_program_links.last_crawl_success_at IS 'Timestamp of the most recent successful crawl.';
COMMENT ON COLUMN user_referral_program_links.parent_link_id IS 'The parent link this was unfurled from; NULL for a normal, manually-added link. Children are lifecycle-managed via the parent, not editable directly.';
COMMENT ON COLUMN user_referral_program_links.unfurl_requested_at IS 'When an unfurl was requested on this (parent) link; NULL if never requested.';
COMMENT ON COLUMN user_referral_program_links.unfurl_completed_at IS 'When the most recent unfurl on this (parent) link completed successfully.';
COMMENT ON COLUMN user_referral_program_links.unfurl_failed_at IS 'When the most recent unfurl on this (parent) link failed.';
COMMENT ON COLUMN user_referral_program_links.unfurl_last_error IS 'Truncated error message from the most recent failed unfurl.';
COMMENT ON COLUMN user_referral_program_links.created_by_id IS 'Admin who published this official link; NULL for personal links.';
COMMENT ON COLUMN user_referral_program_links.deleted_by_id IS 'Admin who soft-deleted this official link; NULL for personal links.';

-- a list of validation rules
CREATE TABLE IF NOT EXISTS referral_program_link_validations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  slug TEXT UNIQUE NOT NULL,
  CHECK (char_length(slug) <= 255),
  CHECK (slug = LOWER(slug)),
  CHECK (slug ~ '^[a-z0-9_]+$'),

  -- the message to show the user when they are about to add a link
  user_help_text TEXT NOT NULL DEFAULT '',

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_referral_program_link_validations_updated_at
BEFORE UPDATE ON referral_program_link_validations
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- for searching validations
CREATE INDEX IF NOT EXISTS idx_referral_program_link_validations__slug_prefix
  ON referral_program_link_validations (slug text_pattern_ops);

COMMENT ON TABLE referral_program_link_validations IS 'Named validation rule sets that can be attached to referral programs to verify submitted URLs.';
COMMENT ON COLUMN referral_program_link_validations.slug IS 'Unique lowercase identifier for this validation rule set.';
COMMENT ON COLUMN referral_program_link_validations.user_help_text IS 'Help text shown to the user when they are adding a referral link.';

CREATE TABLE IF NOT EXISTS referral_program_link_validations_rules (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  referral_program_link_validation_id UUID NOT NULL REFERENCES referral_program_link_validations ON DELETE CASCADE,

  -- Pattern rules for hostname and pathname
  -- hostname supports wildcard patterns like *.example.com for subdomain matching
  -- pathname uses SQL LIKE-style wildcards: % matches any characters, _ matches one character
  hostname TEXT NOT NULL,
  CHECK (char_length(hostname) <= 255),
  CHECK (hostname = LOWER(hostname)),
  CHECK (hostname = TRIM(hostname)),
  pathname TEXT NOT NULL,
  CHECK (pathname = TRIM(pathname)),

  -- set to false if we want an error message when a user specifies a non-referral link
  is_referral_link_url BOOLEAN NOT NULL DEFAULT TRUE,
  -- set to true if we want an error message when a user specifies a type of referral link that is not allowed
  -- e.g. one that redirects to a different URL
  is_invalid_referral_link_url BOOLEAN NOT NULL DEFAULT FALSE,
  user_error_text TEXT,
  CHECK (NOT (is_referral_link_url IS FALSE AND (user_error_text IS NULL OR user_error_text = ''))),
  CHECK (NOT (is_invalid_referral_link_url IS TRUE AND (user_error_text IS NULL OR user_error_text = ''))),

  -- a list of example URLs to test the pattern rules
  example_urls TEXT[],

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_referral_program_link_validations_rules_updated_at
BEFORE UPDATE ON referral_program_link_validations_rules
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- for searching rules by validation
CREATE INDEX IF NOT EXISTS idx_referral_link_validations_rules__validation_id
ON referral_program_link_validations_rules (referral_program_link_validation_id);

COMMENT ON TABLE referral_program_link_validations_rules IS 'Individual URL pattern rules within a validation rule set for matching referral link hostnames and pathnames.';
COMMENT ON COLUMN referral_program_link_validations_rules.referral_program_link_validation_id IS 'The validation rule set this rule belongs to.';
COMMENT ON COLUMN referral_program_link_validations_rules.hostname IS 'Hostname pattern to match; supports wildcard patterns like *.example.com.';
COMMENT ON COLUMN referral_program_link_validations_rules.pathname IS 'Pathname pattern using SQL LIKE-style wildcards (% and _).';
COMMENT ON COLUMN referral_program_link_validations_rules.is_referral_link_url IS 'Whether matching URLs are valid referral links; false triggers an error.';
COMMENT ON COLUMN referral_program_link_validations_rules.is_invalid_referral_link_url IS 'Whether matching URLs are a disallowed type of referral link (e.g. redirects).';
COMMENT ON COLUMN referral_program_link_validations_rules.user_error_text IS 'Error message shown to the user when validation fails.';
COMMENT ON COLUMN referral_program_link_validations_rules.example_urls IS 'Example URLs for testing the pattern rules.';

CREATE TABLE IF NOT EXISTS topics__referral_program_link_validations (
  referral_program_id UUID NOT NULL REFERENCES topics__referral_programs ON DELETE CASCADE,
  referral_program_link_validation_id UUID NOT NULL REFERENCES referral_program_link_validations ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (referral_program_id, referral_program_link_validation_id)
);

CREATE INDEX IF NOT EXISTS idx_topics__referral_program_validations__referral_program_id
ON topics__referral_program_link_validations (referral_program_id);

CREATE INDEX IF NOT EXISTS idx_topics__referral_program_link_validations__validation_id
ON topics__referral_program_link_validations (referral_program_link_validation_id);

COMMENT ON TABLE topics__referral_program_link_validations IS 'Join table linking referral programs to their URL validation rule sets.';
COMMENT ON COLUMN topics__referral_program_link_validations.referral_program_id IS 'The referral program (topic).';
COMMENT ON COLUMN topics__referral_program_link_validations.referral_program_link_validation_id IS 'The validation rule set applied to this program.';

-- ==========================================================================
-- 0270-00-00-referral-link-crawling.sql
-- ============================================================================

-- Crawler config references referral programs, so this remains a narrow circular-dependency ALTER.
ALTER TABLE crawlers
  ADD CONSTRAINT fk_crawlers_referral_program_id FOREIGN KEY (referral_program_id) REFERENCES topics__referral_programs ON DELETE SET NULL NOT VALID;

ALTER TABLE crawlers VALIDATE CONSTRAINT fk_crawlers_referral_program_id;

COMMENT ON COLUMN crawlers.content_selectors IS 'CSS selectors that narrow HTML parsing to specific content areas.';
COMMENT ON COLUMN crawlers.referral_program_id IS 'Optional FK linking this crawler to a referral program. When set, this crawler overrides the hostname default for that program''s referral link crawling.';
COMMENT ON COLUMN user_referral_program_links.last_crawl_id IS 'The most recent crawl for this referral link, set on successful crawl.';

CREATE INDEX IF NOT EXISTS idx_crawlers__referral_program_id
ON crawlers (referral_program_id)
WHERE referral_program_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_referral_program_links__created_via_oauth_client_id
  ON user_referral_program_links (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;
