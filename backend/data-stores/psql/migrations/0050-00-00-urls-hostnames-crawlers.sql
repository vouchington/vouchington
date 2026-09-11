-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: added language detection columns to crawls
-- edited-in-place: removed blocked_at/blocked_by_id/blocked_source (moved to url_hostname_blocks)
-- edited-in-place: folded hostname-top-indexes and url-hostnames-web-risk (moved from old idempotents/)
-- edited-in-place: added ignore_robots_txt to url_hostnames
-- edited-in-place: swapped 'english' to 'voucha_english' text search config (unaccent support)
-- edited-in-place: added unreliable_status_codes to url_hostnames
-- edited-in-place: added html_sha256 to crawls to dedupe redundant S3 PUTs
-- edited-in-place: added normalized embed metadata to crawls
-- Merged from: 0002-00-00-oauth-urls.sql, 0030-00-00-url-crawlers.sql

-- ==========================================================================
-- URL registry and domain blacklists from 0002-00-00-oauth-urls.sql
-- ============================================================================

-- Reverse hostname labels for efficient subdomain prefix scans
CREATE OR REPLACE FUNCTION fn_reverse_hostname_labels(p_hostname TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE STRICT
AS $$
  SELECT array_to_string(array_reverse(string_to_array(p_hostname, '.')), '.')
$$;

--------------------------------------------------------------------------------
-- Hostnames
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS url_hostnames (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  hostname TEXT UNIQUE NOT NULL,
  CHECK (char_length(hostname) <= 255),
  CHECK (hostname = LOWER(hostname)),
  CHECK (hostname = TRIM(hostname)),

  blocked BOOLEAN DEFAULT FALSE, -- moderation-history-guard-allow: trigger-maintained from url_hostname_blocks
  crawlable BOOLEAN, -- whether this hostname is crawlable, e.g. Reddit is not crawlable
  emailable BOOLEAN, -- whether we can send emails to this hostname.
  link_rel_follow BOOLEAN, -- whether this hostname is a link rel=nofollow on the site. Only set this to true for trusted sites.
  ignore_robots_txt BOOLEAN, -- whether robots.txt allow/disallow rules are ignored for feed fetches on this hostname
  unreliable_status_codes SMALLINT[], -- RSS fetch HTTP status codes that should retry instead of soft-deleting feeds on this hostname
  requests_per_second_limit SMALLINT DEFAULT 1, -- the maximum number of requests per second for this hostname
  attempt_threshold_hours SMALLINT DEFAULT 1, -- if a crawl fails, we do not attempt to crawl again for this many hours
  age_threshold_days SMALLINT DEFAULT 1, -- days after which a page's successful crawl is considered old and should be crawled again

  reversed_hostname TEXT GENERATED ALWAYS AS (fn_reverse_hostname_labels(hostname)) STORED,

  -- DNS failure auto-disable tracking.
  -- consecutive_dns_failures is reset to 0 on any successful crawl, and reset to 1 (not
  -- incremented) when last_dns_failure_at is older than 7 days so stale failures do not
  -- compound with new ones. When consecutive_dns_failures reaches 3, crawlable is set to
  -- FALSE and dns_disabled_at is stamped. Clearing dns_disabled_at and resetting crawlable
  -- is an admin-only action.
  consecutive_dns_failures SMALLINT NOT NULL DEFAULT 0,
  last_dns_failure_at TIMESTAMPTZ,
  dns_disabled_at TIMESTAMPTZ,

  topic_id UUID,  -- FK to topics added in 0060

  skip_web_risk BOOLEAN NOT NULL DEFAULT FALSE,
  web_risk_checked_url TEXT,
  web_risk_threat_types TEXT[],
  web_risk_expire_at TIMESTAMPTZ,

  votes_snapshot_xmax XID8,
  votes_snapshot_xip_count INTEGER,
  CONSTRAINT chk_url_hostnames_votes_snapshot_complete CHECK (
    (votes_snapshot_xmax IS NULL AND votes_snapshot_xip_count IS NULL)
    OR (votes_snapshot_xmax IS NOT NULL AND votes_snapshot_xip_count IS NOT NULL AND votes_snapshot_xip_count >= 0)
  ),

  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_url_hostnames__hostname__text_pattern_ops
ON url_hostnames (hostname text_pattern_ops);

-- trigram index for ILIKE '%query%' searches
CREATE INDEX IF NOT EXISTS idx_url_hostnames__hostname_trgm
ON url_hostnames USING GIN (hostname gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_url_hostnames__reversed_hostname__text_pattern_ops
ON url_hostnames (reversed_hostname text_pattern_ops);

-- Partial index for fast exact and prefix hostname lookups among blocked hostnames.
CREATE INDEX IF NOT EXISTS idx_url_hostnames__blocked
  ON url_hostnames (hostname text_pattern_ops)
  WHERE blocked = TRUE;

CREATE INDEX IF NOT EXISTS idx_url_hostnames__skip_web_risk
  ON url_hostnames (hostname text_pattern_ops)
  WHERE skip_web_risk = TRUE;

-- Partial index for finding auto-disabled hostnames (admin observability, cleanup queries).
CREATE INDEX IF NOT EXISTS idx_url_hostnames__dns_disabled_at
  ON url_hostnames (dns_disabled_at)
  WHERE dns_disabled_at IS NOT NULL;

CREATE OR REPLACE TRIGGER trigger_url_hostnames_updated_at
BEFORE UPDATE ON url_hostnames
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE url_hostnames IS 'Registered hostnames with crawl and moderation policies.';
COMMENT ON COLUMN url_hostnames.hostname IS 'Lowercase, unique hostname (e.g. example.com).';
COMMENT ON COLUMN url_hostnames.blocked IS 'Whether this hostname is blocked from being used on the site (e.g. spam). Trigger-maintained from url_hostname_blocks — do not write directly in app code.';
COMMENT ON COLUMN url_hostnames.crawlable IS 'Whether pages on this hostname can be crawled.';
COMMENT ON COLUMN url_hostnames.emailable IS 'Whether email addresses at this hostname are accepted.';
COMMENT ON COLUMN url_hostnames.link_rel_follow IS 'If TRUE, links to this hostname use rel=follow. Only for trusted sites.';
COMMENT ON COLUMN url_hostnames.requests_per_second_limit IS 'Max crawl requests per second for this hostname.';
COMMENT ON COLUMN url_hostnames.attempt_threshold_hours IS 'Hours to wait before retrying a failed crawl.';
COMMENT ON COLUMN url_hostnames.age_threshold_days IS 'Days after which a successful crawl is considered stale and should be re-crawled.';
COMMENT ON COLUMN url_hostnames.reversed_hostname IS 'Hostname labels reversed (e.g. com.example.www) for efficient subdomain prefix scans.';
COMMENT ON COLUMN url_hostnames.consecutive_dns_failures IS 'Number of consecutive DNS lookup failures for this hostname. Resets to 0 on any successful crawl. Resets to 1 (not incremented) when last_dns_failure_at is older than 7 days.';
COMMENT ON COLUMN url_hostnames.last_dns_failure_at IS 'When the most recent DNS lookup failure occurred for this hostname.';
COMMENT ON COLUMN url_hostnames.dns_disabled_at IS 'When this hostname was automatically disabled due to repeated DNS failures. NULL if not auto-disabled. Clearing this (and resetting crawlable) is an admin-only action.';
COMMENT ON COLUMN url_hostnames.skip_web_risk IS 'Whether Google Web Risk checks are skipped for this hostname and subdomains.';
COMMENT ON COLUMN url_hostnames.ignore_robots_txt IS 'Whether robots.txt allow/disallow rules are ignored for RSS feed fetches on this hostname. NULL = inherit from global DynamicConfig. TRUE = always ignore. FALSE = always enforce.';
COMMENT ON COLUMN url_hostnames.unreliable_status_codes IS 'RSS feed fetch HTTP status codes that should retry instead of soft-deleting feeds for this hostname. NULL = no hostname override. Example: ARRAY[404] for unreliable YouTube feeds.';
COMMENT ON COLUMN url_hostnames.web_risk_checked_url IS 'URL that produced the Google Web Risk positive verdict for this hostname.';
COMMENT ON COLUMN url_hostnames.web_risk_threat_types IS 'Google Web Risk threat types returned for the checked URL.';
COMMENT ON COLUMN url_hostnames.web_risk_expire_at IS 'Google Web Risk expireTime for the positive verdict.';
COMMENT ON COLUMN url_hostnames.votes_snapshot_xmax IS 'Upper transaction-ID boundary of the PostgreSQL snapshot used for the persisted vote-stat aggregate.';
COMMENT ON COLUMN url_hostnames.votes_snapshot_xip_count IS 'Number of transactions still in progress in that vote-stat snapshot; lower is newer when the snapshot xmax is equal.';

--------------------------------------------------------------------------------
-- URL content types
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS url_content_types (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  mime_type TEXT UNIQUE NOT NULL,
  CHECK (mime_type = LOWER(mime_type)),
  CHECK (mime_type = TRIM(mime_type)),
  CHECK (char_length(mime_type) <= 255),
  CHECK (mime_type ~ '^\s*[\w.+-]+\/[\w.+-]+\s*$')
);

COMMENT ON TABLE url_content_types IS 'Lookup table of MIME content types for URLs (e.g. text/html, application/pdf).';
COMMENT ON COLUMN url_content_types.mime_type IS 'Lowercase MIME type string (e.g. text/html). Unique.';

--------------------------------------------------------------------------------
-- URLs
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS urls (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  url TEXT CHECK (char_length(url) <= 2083) UNIQUE NOT NULL,
  CHECK (url = TRIM(url)),
  CHECK (STARTS_WITH(url, 'https://') OR STARTS_WITH(url, 'http://')),

  hostname_id UUID NOT NULL REFERENCES url_hostnames ON DELETE CASCADE,
  pathname TEXT NOT NULL DEFAULT '/',
  CHECK (char_length(pathname) <= 2048),
  CHECK (pathname = TRIM(pathname)),
  search_params JSONB NOT NULL,

  url_content_type_id BIGINT REFERENCES url_content_types ON DELETE SET NULL,
  canonical_url_id UUID REFERENCES urls ON DELETE SET NULL,
  CHECK (canonical_url_id IS NULL OR canonical_url_id != id),

  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_urls_updated_at
BEFORE UPDATE ON urls
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- filter urls by hostname
CREATE INDEX IF NOT EXISTS idx_urls__hostname_id
ON urls (hostname_id);

-- search urls by url prefix
CREATE INDEX IF NOT EXISTS idx_urls__url__text_pattern_ops
ON urls (url text_pattern_ops);

-- trigram index for ILIKE '%query%' searches on urls
CREATE INDEX IF NOT EXISTS idx_urls__url_trgm
ON urls USING GIN (url gin_trgm_ops);

COMMENT ON TABLE urls IS 'Canonical URL registry. All URLs in the system reference this table.';
COMMENT ON COLUMN urls.url IS 'Full HTTPS URL (max 2083 chars). Unique, trimmed.';
COMMENT ON COLUMN urls.hostname_id IS 'The hostname this URL belongs to.';
COMMENT ON COLUMN urls.pathname IS 'URL pathname component (e.g. /path/to/page). Max 2048 chars.';
COMMENT ON COLUMN urls.search_params IS 'URL query parameters stored as JSONB.';
COMMENT ON COLUMN urls.url_content_type_id IS 'Detected MIME content type of the URL.';
COMMENT ON COLUMN urls.canonical_url_id IS 'Self-referencing FK to the canonical version of this URL, if different.';

--------------------------------------------------------------------------------
-- Domain blacklists
--------------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE domain_blacklist_types AS ENUM (
  'url',
  'email'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS domain_blacklist_sources (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  type domain_blacklist_types NOT NULL,
  name TEXT UNIQUE NOT NULL,
  CHECK (name ~ '^[a-z-]+$'),
  CHECK (name = LOWER(name)),
  CHECK (name = TRIM(name)),
  CHECK (char_length(name) <= 255),
  url TEXT NOT NULL,
  etag TEXT,
  last_modified_at TIMESTAMPTZ,
  last_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_domain_blacklist_sources_updated_at
BEFORE UPDATE ON domain_blacklist_sources
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE domain_blacklist_sources IS 'External sources of domain blacklists (e.g. spam lists, disposable email lists).';
COMMENT ON COLUMN domain_blacklist_sources.type IS 'Whether this source blocks URL domains or email domains.';
COMMENT ON COLUMN domain_blacklist_sources.name IS 'Unique lowercase identifier for this blacklist source.';
COMMENT ON COLUMN domain_blacklist_sources.url IS 'URL where the blacklist can be fetched from.';
COMMENT ON COLUMN domain_blacklist_sources.etag IS 'HTTP ETag from the last fetch, for conditional requests.';
COMMENT ON COLUMN domain_blacklist_sources.last_modified_at IS 'HTTP Last-Modified from the last fetch.';
COMMENT ON COLUMN domain_blacklist_sources.last_fetched_at IS 'When this source was last successfully fetched.';

CREATE TABLE IF NOT EXISTS domain_blacklists (
  source_id BIGINT NOT NULL REFERENCES domain_blacklist_sources ON DELETE CASCADE,
  domain TEXT NOT NULL,
  CHECK (domain = LOWER(domain)),
  CHECK (domain = TRIM(domain)),
  PRIMARY KEY (domain, source_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_domain_blacklists_updated_at
BEFORE UPDATE ON domain_blacklists
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_domain_blacklists__source_id__domain
ON domain_blacklists (source_id, domain);

COMMENT ON TABLE domain_blacklists IS 'Individual blacklisted domains from external sources.';
COMMENT ON COLUMN domain_blacklists.source_id IS 'The blacklist source this domain came from.';
COMMENT ON COLUMN domain_blacklists.domain IS 'The blacklisted domain name (lowercase).';

-- ==========================================================================
-- 0030-00-00-url-crawlers.sql
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE crawler_types AS ENUM (
  'fetch', -- uses `window.fetch()`
  'automation' -- uses automation like Playwright
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- rules per crawler
CREATE TABLE IF NOT EXISTS crawlers (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  hostname_id UUID NOT NULL REFERENCES url_hostnames ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  crawler_type crawler_types NOT NULL,
  priority INT NOT NULL DEFAULT 0, -- descending order of priority, so the default crawler will have the highest priority

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  created_by_id UUID REFERENCES users ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID REFERENCES users ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,

  -- remove these URLs before parsing HTML
  css_selectors_to_remove TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- remove links with exactly this text content before parsing HTML
  link_text_content_to_remove TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- remove links with exactly this href before parsing HTML
  link_hrefs_to_remove TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  content_selectors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  referral_program_id UUID  -- FK to topics__referral_programs added in 0130
);

CREATE OR REPLACE TRIGGER trigger_crawlers_updated_at
BEFORE UPDATE ON crawlers
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_crawlers__hostname_id
ON crawlers (hostname_id);

COMMENT ON TABLE crawlers IS 'Per-hostname crawler configurations defining how to fetch and parse web pages.';
COMMENT ON COLUMN crawlers.hostname_id IS 'The hostname this crawler is configured for.';
COMMENT ON COLUMN crawlers.description IS 'Human-readable description of what this crawler does.';
COMMENT ON COLUMN crawlers.crawler_type IS 'Method of crawling: fetch (HTTP) or automation (headless browser).';
COMMENT ON COLUMN crawlers.priority IS 'Selection priority (descending). Higher priority crawlers are tried first.';
COMMENT ON COLUMN crawlers.css_selectors_to_remove IS 'CSS selectors of elements to strip before parsing HTML content.';
COMMENT ON COLUMN crawlers.link_text_content_to_remove IS 'Link text values to strip (exact match) before parsing.';
COMMENT ON COLUMN crawlers.link_hrefs_to_remove IS 'Link href values to strip (exact match) before parsing.';

-------------------------------------------------------------------------------
-- crawls
-------------------------------------------------------------------------------

-- any errors that occured other than HTTP status errors
DO $$ BEGIN
  CREATE TYPE crawl_network_errors AS ENUM (
  'timeout',
  'dns',
  'ssrf'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS crawls (
  id UUID NOT NULL DEFAULT uuidv7(),
  url_id UUID NOT NULL REFERENCES urls ON DELETE CASCADE,
  PRIMARY KEY (id),

  crawler_id UUID REFERENCES crawlers ON DELETE SET NULL,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL, -- when the crawl was started
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- http cache headers
  last_modified_at TIMESTAMPTZ,
  etag TEXT,

  -- sha256 of the raw HTML body fetched this crawl (NULL if none was fetched,
  -- e.g. 304/redirect/non-HTML). Lets the next crawl skip the S3 PUT when the
  -- origin doesn't support conditional GET but content is unchanged.
  html_sha256 BYTEA CHECK (html_sha256 IS NULL OR LENGTH(html_sha256) = 32),
  html_snapshot_uploaded_at TIMESTAMPTZ,

  request_headers JSONB NOT NULL DEFAULT '{}'::JSONB,
  response_headers JSONB NOT NULL DEFAULT '{}'::JSONB,
  response_status_code SMALLINT NOT NULL,
  CHECK (response_status_code >= 100 AND response_status_code < 600),
  redirect_url_id UUID REFERENCES urls ON DELETE SET NULL,
  network_error crawl_network_errors,
  completed_at TIMESTAMPTZ, -- when the crawl was completed, whether successfully or not

  -- when embeddings were generated for the crawl
  -- which means that this crawl can be used for searching
  embeddings_generated_at TIMESTAMPTZ,
  -- whether there are any chunks that have not been embedded yet
  has_pending_embeddings BOOLEAN NOT NULL DEFAULT FALSE,

  -- main content of the page
  markdown TEXT NOT NULL,
  -- page title (not a meta tag)
  title TEXT,
  -- links from the page (not meta tags)
  links JSONB DEFAULT '[]'::JSONB,
  -- object of all meta tags
  meta_tags JSONB DEFAULT '{}'::JSONB,
  -- normalized unfurl/oEmbed metadata; raw provider HTML is never stored
  embed_metadata JSONB,
  -- oEmbed endpoint discovered from this crawl's URL or HTML
  embed_oembed_url TEXT,
  -- when the optional remote oEmbed enrichment completed for this crawl
  embed_oembed_resolved_at TIMESTAMPTZ,
  -- language from <html lang="...">
  lang TEXT CHECK (TRIM(lang) = lang AND lang != '' AND LENGTH(lang) <= 35),

  -- language detection
  lingua_rs_detected_language TEXT CHECK (lingua_rs_detected_language IS NULL OR (lingua_rs_detected_language = LOWER(lingua_rs_detected_language) AND LENGTH(lingua_rs_detected_language) <= 10)),
  lingua_rs_content_sha256 BYTEA CHECK (lingua_rs_content_sha256 IS NULL OR LENGTH(lingua_rs_content_sha256) = 32),
  lingua_rs_input_sha256 BYTEA CHECK (lingua_rs_input_sha256 IS NULL OR LENGTH(lingua_rs_input_sha256) = 32),
  lingua_rs_results JSONB,
  lingua_rs_detected_at TIMESTAMPTZ,

  -- meta_tags cannot be null if embeddings were generated
  CHECK (embeddings_generated_at IS NULL OR meta_tags IS NOT NULL),
  -- markdown cannot be null if embeddings were generated
  CHECK (embeddings_generated_at IS NULL OR markdown IS NOT NULL)
) PARTITION BY RANGE (id);

-- for the dominant query pattern: WHERE url_id = $1 ORDER BY id DESC
CREATE INDEX IF NOT EXISTS idx_crawls__url_id__id_desc
ON crawls (url_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_crawls__crawler_id
ON crawls (crawler_id)
WHERE crawler_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crawls__redirect_url_id
ON crawls (redirect_url_id)
WHERE redirect_url_id IS NOT NULL;

-- for finding the latest crawl for a URL
CREATE INDEX IF NOT EXISTS crawls__url_id__embeddings_generated_at
ON crawls (url_id, embeddings_generated_at DESC)
WHERE embeddings_generated_at IS NOT NULL;

-- for finding URLs that have pending embeddings
CREATE INDEX IF NOT EXISTS crawls__url_id__pending_embeddings
ON crawls (url_id)
WHERE has_pending_embeddings = TRUE;

-- latest-completed-crawl lookup by URL
CREATE INDEX IF NOT EXISTS idx_crawls__url_id__completed_at_desc
ON crawls (url_id, completed_at DESC, id DESC)
WHERE completed_at IS NOT NULL;

-- find crawls pending language detection
CREATE INDEX IF NOT EXISTS crawls_lingua_rs_pending_idx
  ON crawls (id)
  WHERE lingua_rs_input_sha256 IS NULL;

-- find crawls pending remote oEmbed enrichment
CREATE INDEX IF NOT EXISTS crawls_oembed_pending_idx
  ON crawls (id)
  WHERE embed_metadata IS NOT NULL
    AND embed_oembed_url IS NOT NULL
    AND embed_oembed_resolved_at IS NULL;

COMMENT ON TABLE crawls IS 'URL crawl results with parsed content, headers, and embedding status. RANGE-partitioned by id.';
COMMENT ON COLUMN crawls.url_id IS 'The URL that was crawled.';
COMMENT ON COLUMN crawls.crawler_id IS 'The crawler configuration used for this crawl.';
COMMENT ON COLUMN crawls.last_modified_at IS 'HTTP Last-Modified header from the response.';
COMMENT ON COLUMN crawls.etag IS 'HTTP ETag header from the response.';
COMMENT ON COLUMN crawls.html_sha256 IS 'SHA-256 of the raw HTML body fetched; used to dedupe redundant S3 writes when content is unchanged.';
COMMENT ON COLUMN crawls.html_snapshot_uploaded_at IS 'When the raw HTML body for html_sha256 was successfully uploaded to S3; used to avoid reusing expired lifecycle-managed snapshots.';
COMMENT ON COLUMN crawls.request_headers IS 'JSONB of HTTP request headers sent.';
COMMENT ON COLUMN crawls.response_headers IS 'JSONB of HTTP response headers received.';
COMMENT ON COLUMN crawls.response_status_code IS 'HTTP status code (100-599).';
COMMENT ON COLUMN crawls.redirect_url_id IS 'If redirected, the target URL.';
COMMENT ON COLUMN crawls.network_error IS 'Network-level error type (timeout, dns, ssrf), if any.';
COMMENT ON COLUMN crawls.completed_at IS 'When the crawl finished, whether successfully or not.';
COMMENT ON COLUMN crawls.embeddings_generated_at IS 'When embeddings were generated, making this crawl searchable.';
COMMENT ON COLUMN crawls.has_pending_embeddings IS 'Whether any chunks still need embeddings generated.';
COMMENT ON COLUMN crawls.markdown IS 'Extracted main content of the page in markdown.';
COMMENT ON COLUMN crawls.title IS 'Page title (from <title> tag, not meta tags).';
COMMENT ON COLUMN crawls.links IS 'JSONB array of links extracted from the page content.';
COMMENT ON COLUMN crawls.meta_tags IS 'JSONB object of all meta tags from the page.';
COMMENT ON COLUMN crawls.embed_metadata IS 'Normalized unfurl/oEmbed metadata without raw provider HTML.';
COMMENT ON COLUMN crawls.embed_oembed_url IS 'oEmbed endpoint discovered from this crawl''s URL or HTML.';
COMMENT ON COLUMN crawls.embed_oembed_resolved_at IS 'When optional remote oEmbed enrichment completed for this crawl.';
COMMENT ON COLUMN crawls.lang IS 'Language from the <html lang="..."> attribute.';

-------------------------------------------------------------------------------
-- crawl_chunks
-------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crawl_chunks (
  crawl_id UUID NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,

  order_index INT NOT NULL, -- the order of the embedding in the list
  PRIMARY KEY (crawl_id, order_index),

  markdown TEXT NOT NULL, -- the content of the embedding

  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('voucha_english', COALESCE(markdown, '')), 'A')
  ) STORED,

  bedrock_nova_multimodal_v1_content_sha256 BYTEA NOT NULL,
  CHECK (OCTET_LENGTH(bedrock_nova_multimodal_v1_content_sha256) = 32),
  bedrock_nova_multimodal_v1_input_sha256 BYTEA,
  CHECK (bedrock_nova_multimodal_v1_input_sha256 IS NULL OR OCTET_LENGTH(bedrock_nova_multimodal_v1_input_sha256) = 32),
  bedrock_nova_multimodal_v1_embedding VECTOR(1024),
  bedrock_nova_multimodal_v1_embedding_created_at TIMESTAMPTZ,
  bedrock_nova_multimodal_v1_input_token_count INT,
  CHECK (bedrock_nova_multimodal_v1_input_token_count IS NULL OR bedrock_nova_multimodal_v1_input_token_count >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (crawl_id);

CREATE INDEX IF NOT EXISTS crawl_chunks__search_vector
ON crawl_chunks USING GIN (search_vector);

-- find existing embeddings by input hash
CREATE INDEX IF NOT EXISTS crawl_chunks__bedrock_nova_multimodal_v1_input_sha256
ON crawl_chunks (bedrock_nova_multimodal_v1_input_sha256)
WHERE bedrock_nova_multimodal_v1_input_sha256 IS NOT NULL;

-- index embeddings for similarity search (vector_cosine_ops matches <=> queries)
CREATE INDEX IF NOT EXISTS crawl_chunks__bedrock_nova_multimodal_v1_embedding
ON crawl_chunks USING hnsw (bedrock_nova_multimodal_v1_embedding vector_cosine_ops)
WHERE bedrock_nova_multimodal_v1_embedding IS NOT NULL;

COMMENT ON TABLE crawl_chunks IS 'Chunked content from crawls for embedding and search. RANGE-partitioned by crawl_id.';
COMMENT ON COLUMN crawl_chunks.crawl_id IS 'The crawl this chunk was extracted from.';
COMMENT ON COLUMN crawl_chunks.order_index IS 'Position of this chunk within the crawl''s content (0-based).';
COMMENT ON COLUMN crawl_chunks.markdown IS 'The markdown content of this chunk.';

-- NOTE: idx_url_hostnames__top_sort and idx_url_hostnames__top_sort_by_topic are in
-- config-driven/0190-00-00-hostname-elections-indexes.mts because they reference
-- votes_score_net/votes_count_up columns added by the elections config-driven generator.
