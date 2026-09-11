-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: added language detection columns to topics
-- edited-in-place: swapped 'english' to 'voucha_english' text search config (unaccent support)
-- Merged from: 0005-00-00-topics.sql, 0110-00-00-wikipedia-topic-recommendations.sql, 0160-00-00-review-snippet-categories.sql

-- ==========================================================================
-- 0005-00-00-topics.sql
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE topic_types AS ENUM (
  'topic',
  'rewards_program',
  'referral_program',
  'card',
  'rewards_program_status',
  'bank_account',
  'rss_feed',
  'fediverse_instance'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT uuidv7(),

  topic_type topic_types NOT NULL DEFAULT 'topic',

  name TEXT NOT NULL, -- canonical name
  CHECK (char_length(name) <= 255),
  CHECK (name = TRIM(name)),
  slug TEXT NOT NULL, -- canonical slug
  CHECK (char_length(slug) <= 255),
  CHECK (slug = LOWER(slug)),
  CHECK (slug = TRIM(slug)),

  -- NOTE: updated via topic aliases
  aliases TEXT[] NOT NULL DEFAULT '{}', -- used only for search purposes
  markdown TEXT NOT NULL DEFAULT '',

  -- Policy flags (see docs/requirements/content/TOPICS.md). Configuration toggles, not lifecycle state.
  noindex BOOLEAN NOT NULL DEFAULT false, -- exclude this topic's pages from search-engine indexing
  allow_reviews BOOLEAN NOT NULL DEFAULT true, -- false for private individuals; blocks review creation + hides review UI

  votes_snapshot_xmax XID8,
  votes_snapshot_xip_count INTEGER,
  CONSTRAINT chk_topics_votes_snapshot_complete CHECK (
    (votes_snapshot_xmax IS NULL AND votes_snapshot_xip_count IS NULL)
    OR (votes_snapshot_xmax IS NOT NULL AND votes_snapshot_xip_count IS NOT NULL AND votes_snapshot_xip_count >= 0)
  ),

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  created_by_id UUID REFERENCES users ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID REFERENCES users ON DELETE SET NULL, -- the last person who updated it, used for authorship
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,
  merged_into_topic_id UUID REFERENCES topics ON DELETE RESTRICT,
  merged_at TIMESTAMPTZ,
  merged_by_id UUID REFERENCES users ON DELETE RESTRICT,
  CONSTRAINT chk_topics_merged_into_not_self
    CHECK (merged_into_topic_id IS NULL OR merged_into_topic_id <> id),
  CONSTRAINT chk_topics_merge_state_complete
    CHECK (
    (merged_into_topic_id IS NULL AND merged_at IS NULL AND merged_by_id IS NULL)
    OR (merged_into_topic_id IS NOT NULL AND merged_at IS NOT NULL AND merged_by_id IS NOT NULL)
  ),

  hostname_id UUID REFERENCES url_hostnames ON DELETE RESTRICT,
  logo_image_id UUID REFERENCES images ON DELETE SET NULL,
  hero_image_id UUID REFERENCES images ON DELETE SET NULL,
  homepage_url_id UUID REFERENCES urls ON DELETE SET NULL,

  -- bedrock nova multimodal v1 embedding
  bedrock_nova_multimodal_v1_content_sha256 BYTEA NOT NULL,
  CHECK (OCTET_LENGTH(bedrock_nova_multimodal_v1_content_sha256) = 32),
  bedrock_nova_multimodal_v1_input_sha256 BYTEA,
  CHECK (bedrock_nova_multimodal_v1_input_sha256 IS NULL OR OCTET_LENGTH(bedrock_nova_multimodal_v1_input_sha256) = 32),
  bedrock_nova_multimodal_v1_embedding VECTOR(1024),
  bedrock_nova_multimodal_v1_embedding_created_at TIMESTAMPTZ,
  bedrock_nova_multimodal_v1_input_token_count INT,
  CHECK (bedrock_nova_multimodal_v1_input_token_count IS NULL OR bedrock_nova_multimodal_v1_input_token_count >= 0),

  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('voucha_english', COALESCE(name, '')), 'A') ||
    setweight(to_tsvector('voucha_english', COALESCE(slug, '')), 'A') ||
    setweight(to_tsvector('voucha_english', COALESCE(fn_immutable_array_to_string(aliases, ' '), '')), 'B') ||
    setweight(to_tsvector('voucha_english', COALESCE(markdown, '')), 'D')
  ) STORED,

  rewards_program_id UUID,  -- FK to topics__rewards_programs added below
  referral_program_id UUID,  -- FK to topics__referral_programs added below

  -- language detection
  lingua_rs_detected_language TEXT CHECK (lingua_rs_detected_language IS NULL OR (lingua_rs_detected_language = LOWER(lingua_rs_detected_language) AND LENGTH(lingua_rs_detected_language) <= 10)),
  lingua_rs_content_sha256 BYTEA CHECK (lingua_rs_content_sha256 IS NULL OR LENGTH(lingua_rs_content_sha256) = 32),
  lingua_rs_input_sha256 BYTEA CHECK (lingua_rs_input_sha256 IS NULL OR LENGTH(lingua_rs_input_sha256) = 32),
  lingua_rs_results JSONB,
  lingua_rs_detected_at TIMESTAMPTZ
);

CREATE OR REPLACE TRIGGER trigger_topics_updated_at
BEFORE UPDATE ON topics
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- search topics by name
CREATE INDEX IF NOT EXISTS idx_topics__name__text_pattern_ops
ON topics (LOWER(name) text_pattern_ops);

-- unique index on slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics__slug
ON topics (slug);

-- search topics by slug
CREATE INDEX IF NOT EXISTS idx_topics__slug__text_pattern_ops
ON topics (slug text_pattern_ops);

-- unique index on name
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics__name
ON topics (LOWER(name));

CREATE INDEX IF NOT EXISTS idx_topics__hostname_id
ON topics (hostname_id)
WHERE hostname_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics__merged_into_topic_id
ON topics(merged_into_topic_id)
WHERE merged_into_topic_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics__created_by_id
ON topics (created_by_id)
WHERE created_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics__updated_by_id
ON topics (updated_by_id)
WHERE updated_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics__deleted_by_id
ON topics (deleted_by_id)
WHERE deleted_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics__merged_by_id
ON topics (merged_by_id)
WHERE merged_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics__homepage_url_id
ON topics (homepage_url_id)
WHERE homepage_url_id IS NOT NULL;

ALTER TABLE url_hostnames
ADD CONSTRAINT fk_url_hostnames_topic_id FOREIGN KEY (topic_id) REFERENCES topics ON DELETE RESTRICT NOT VALID;

ALTER TABLE url_hostnames VALIDATE CONSTRAINT fk_url_hostnames_topic_id;

CREATE INDEX IF NOT EXISTS idx_url_hostnames__topic_id
ON url_hostnames (topic_id)
WHERE topic_id IS NOT NULL;

COMMENT ON COLUMN url_hostnames.topic_id IS 'The topic associated with this hostname (e.g. the company''s topic page).';

-- text search
CREATE INDEX IF NOT EXISTS idx_topics__search_vector
ON topics USING GIN (search_vector)
WHERE deleted_at IS NULL;

-- find existing embeddings by input hash
CREATE INDEX IF NOT EXISTS idx_topics__bedrock_nova_multimodal_v1_input_sha256
ON topics (bedrock_nova_multimodal_v1_input_sha256)
WHERE bedrock_nova_multimodal_v1_input_sha256 IS NOT NULL;

-- index embeddings for similarity search (vector_cosine_ops matches <=> queries)
CREATE INDEX IF NOT EXISTS idx_topics__bedrock_nova_multimodal_v1_embedding
ON topics USING hnsw (bedrock_nova_multimodal_v1_embedding vector_cosine_ops)
WHERE bedrock_nova_multimodal_v1_embedding IS NOT NULL;

-- find out of date embeddings
CREATE INDEX IF NOT EXISTS ids_topics__bedrock_nova_multimodal_v1_to_update
ON topics (id)
WHERE (
  bedrock_nova_multimodal_v1_input_sha256 IS NULL
  OR (bedrock_nova_multimodal_v1_input_sha256 != bedrock_nova_multimodal_v1_content_sha256)
);

-- GIN trigram indexes to support ILIKE '%query%' substring searches
-- (text_pattern_ops B-tree indexes only help prefix matches; pg_trgm is installed)
CREATE INDEX IF NOT EXISTS idx_topics__name_trgm
ON topics USING GIN (name gin_trgm_ops)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_topics__slug_trgm
ON topics USING GIN (slug gin_trgm_ops)
WHERE deleted_at IS NULL;

-- find topics pending language detection
CREATE INDEX IF NOT EXISTS topics_lingua_rs_pending_idx
  ON topics (id)
  WHERE lingua_rs_input_sha256 IS NULL;

CREATE INDEX IF NOT EXISTS idx_topics__hero_image_id
ON topics (hero_image_id)
WHERE hero_image_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics__logo_image_id
ON topics (logo_image_id)
WHERE logo_image_id IS NOT NULL;


COMMENT ON TABLE topics IS 'Core content entities: topics, rewards programs, cards, etc. Polymorphic via topic_type.';
COMMENT ON COLUMN topics.topic_type IS 'Discriminator for topic subtype (topic, rewards_program, referral_program, card, rewards_program_status, bank_account, rss_feed, fediverse_instance). Every value must have functional behavior; see docs/requirements/content/TOPICS.md.';
COMMENT ON COLUMN topics.noindex IS 'When true, exclude this topic''s pages from search-engine indexing.';
COMMENT ON COLUMN topics.allow_reviews IS 'When false, reviews cannot be created for this topic and review UI is hidden (e.g. private individuals). Replaced the former person topic type.';
COMMENT ON COLUMN topics.name IS 'Canonical display name for this topic.';
COMMENT ON COLUMN topics.slug IS 'URL-safe lowercase slug. Unique.';
COMMENT ON COLUMN topics.aliases IS 'Alternative names for search purposes. Synced from topic_aliases table.';
COMMENT ON COLUMN topics.markdown IS 'Topic description in markdown format.';
COMMENT ON COLUMN topics.votes_snapshot_xmax IS 'Upper transaction-ID boundary of the PostgreSQL snapshot used for the persisted vote-stat aggregate.';
COMMENT ON COLUMN topics.votes_snapshot_xip_count IS 'Number of transactions still in progress in that vote-stat snapshot; lower is newer when the snapshot xmax is equal.';
COMMENT ON COLUMN topics.merged_into_topic_id IS 'Destination topic after an admin alias/redirect merge.';
COMMENT ON COLUMN topics.merged_at IS 'Timestamp when this source topic was merged into another topic.';
COMMENT ON COLUMN topics.merged_by_id IS 'Administrator who merged this source topic into another topic.';
COMMENT ON COLUMN topics.hostname_id IS 'Associated hostname for this topic (e.g. the company''s website). Multiple topics may share a hostname.';
COMMENT ON COLUMN topics.logo_image_id IS 'Reference to the topic''s logo image.';
COMMENT ON COLUMN topics.hero_image_id IS 'Hero/banner image for the topic, displayed prominently on the topic page.';
COMMENT ON COLUMN topics.homepage_url_id IS 'The official homepage URL for this topic (used for retailers and brands).';

--------------------------------------------------------------------------------
-- topic_metrics
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS topic_metrics (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- we weight the 1s and 5s higher than 2-4s because they are more important
  ratings__score__sort DOUBLE PRECISION GENERATED ALWAYS AS (fn_wilson_score_lower_bound(
    ratings__score__4 * 1 + ratings__score__5 * 2,
    ratings__score__1 * 2 + ratings__score__2 * 1 + ratings__score__3 * 1 + ratings__score__4 * 1 + ratings__score__5 * 2)
  ) STORED,

  ratings__score__1 DOUBLE PRECISION DEFAULT 0,
  ratings__score__2 DOUBLE PRECISION DEFAULT 0,
  ratings__score__3 DOUBLE PRECISION DEFAULT 0,
  ratings__score__4 DOUBLE PRECISION DEFAULT 0,
  ratings__score__5 DOUBLE PRECISION DEFAULT 0,

  ratings__count__1 INT DEFAULT 0,
  ratings__count__2 INT DEFAULT 0,
  ratings__count__3 INT DEFAULT 0,
  ratings__count__4 INT DEFAULT 0,
  ratings__count__5 INT DEFAULT 0,

  ratings__updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  bookmarks__follow_count INT DEFAULT 0,
  bookmarks__updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_topic_metrics_updated_at
BEFORE UPDATE ON topic_metrics
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- sorting by best ratings
CREATE INDEX IF NOT EXISTS idx_topic_metrics__ratings__score__sort
ON topic_metrics (ratings__score__sort DESC, topic_id);

COMMENT ON TABLE topic_metrics IS 'Aggregated metrics for topics: rating distributions and bookmark counts.';
COMMENT ON COLUMN topic_metrics.topic_id IS 'The topic these metrics belong to (PK, 1:1 with topics).';
COMMENT ON COLUMN topic_metrics.ratings__score__sort IS 'Wilson score lower bound for sorting. Generated from weighted rating scores.';
COMMENT ON COLUMN topic_metrics.ratings__score__1 IS 'Weighted score sum for 1-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__score__2 IS 'Weighted score sum for 2-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__score__3 IS 'Weighted score sum for 3-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__score__4 IS 'Weighted score sum for 4-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__score__5 IS 'Weighted score sum for 5-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__count__1 IS 'Number of 1-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__count__2 IS 'Number of 2-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__count__3 IS 'Number of 3-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__count__4 IS 'Number of 4-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__count__5 IS 'Number of 5-star ratings.';
COMMENT ON COLUMN topic_metrics.ratings__updated_at IS 'When the rating metrics were last recalculated.';
COMMENT ON COLUMN topic_metrics.bookmarks__follow_count IS 'Number of users who bookmarked/follow this topic.';
COMMENT ON COLUMN topic_metrics.bookmarks__updated_at IS 'When the bookmark count was last recalculated.';

-- Function to auto-create topic_metrics row when topic is created
CREATE OR REPLACE FUNCTION fn_create_topic_metrics_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO topic_metrics (topic_id)
  VALUES (NEW.id)
  ON CONFLICT (topic_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create topic_metrics after topic insert
CREATE TRIGGER trigger_create_topic_metrics
AFTER INSERT ON topics
FOR EACH ROW
EXECUTE FUNCTION fn_create_topic_metrics_on_insert();

--------------------------------------------------------------------------------
-- topics__rewards_programs
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS topics__rewards_programs (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,

  company_id UUID REFERENCES topics ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_topics__rewards_programs_updated_at
BEFORE UPDATE ON topics__rewards_programs
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_topics__rewards_programs__company_id
ON topics__rewards_programs (company_id)
WHERE company_id IS NOT NULL;

COMMENT ON TABLE topics__rewards_programs IS 'Extension table for topics of type rewards_program. Links program to its parent company.';
COMMENT ON COLUMN topics__rewards_programs.topic_id IS 'The topic that is a rewards program (PK, 1:1 with topics).';
COMMENT ON COLUMN topics__rewards_programs.company_id IS 'The company topic that operates this rewards program.';

--------------------------------------------------------------------------------
-- topics__referral_programs
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS topics__referral_programs (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,

  -- the company that owns this referral program
  company_id UUID REFERENCES topics ON DELETE CASCADE,

  enabled_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  disabled_at TIMESTAMPTZ,
  CHECK (NOT (enabled_at IS NOT NULL AND disabled_at IS NOT NULL)),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_topics__referral_programs_updated_at
BEFORE UPDATE ON topics__referral_programs
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_topics__referral_programs__company_id
ON topics__referral_programs (company_id)
WHERE company_id IS NOT NULL;

COMMENT ON TABLE topics__referral_programs IS 'Extension table for topics of type referral_program. Links program to company.';
COMMENT ON COLUMN topics__referral_programs.topic_id IS 'The topic that is a referral program (PK, 1:1 with topics).';
COMMENT ON COLUMN topics__referral_programs.company_id IS 'The company topic that operates this referral program.';
COMMENT ON COLUMN topics__referral_programs.enabled_at IS 'When the program was enabled. NULL if currently disabled.';
COMMENT ON COLUMN topics__referral_programs.disabled_at IS 'When the program was disabled. NULL if currently enabled.';

--------------------------------------------------------------------------------
-- topics: add rewards_program_id and referral_program_id
-- (defined here because the referenced extension tables must exist first)
--------------------------------------------------------------------------------

ALTER TABLE topics ADD CONSTRAINT fk_topics_rewards_program_id FOREIGN KEY (rewards_program_id) REFERENCES topics__rewards_programs ON DELETE SET NULL NOT VALID;
ALTER TABLE topics ADD CONSTRAINT fk_topics_referral_program_id FOREIGN KEY (referral_program_id) REFERENCES topics__referral_programs ON DELETE SET NULL NOT VALID;

ALTER TABLE topics VALIDATE CONSTRAINT fk_topics_rewards_program_id;
ALTER TABLE topics VALIDATE CONSTRAINT fk_topics_referral_program_id;

CREATE INDEX IF NOT EXISTS idx_topics__rewards_program_id
ON topics (rewards_program_id)
WHERE rewards_program_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics__referral_program_id
ON topics (referral_program_id)
WHERE referral_program_id IS NOT NULL;

COMMENT ON COLUMN topics.rewards_program_id IS 'The rewards program this topic is associated with. Any topic type can link to a rewards program.';
COMMENT ON COLUMN topics.referral_program_id IS 'The referral program this topic is associated with. Any topic type can link to a referral program.';

--------------------------------------------------------------------------------
-- topics__cards
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS topics__cards (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,

  -- the bank that issues this card, e.g. Chase, Citi, etc.
  bank_id UUID REFERENCES topics ON DELETE CASCADE,
  -- the brand of the card, e.g. Marriott, Hilton, etc.
  brand_id UUID REFERENCES topics ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  annual_fee_minor_units BIGINT,
  CHECK (annual_fee_minor_units BETWEEN 0 AND 9007199254740991),
  currency_code TEXT REFERENCES currencies(code) ON DELETE RESTRICT,
  CHECK ((annual_fee_minor_units IS NULL) = (currency_code IS NULL))
);

CREATE OR REPLACE TRIGGER trigger_topics__cards_updated_at
BEFORE UPDATE ON topics__cards
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_topics__cards__bank_id
ON topics__cards (bank_id)
WHERE bank_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics__cards__brand_id
ON topics__cards (brand_id)
WHERE brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics__cards__currency_code
ON topics__cards (currency_code)
WHERE currency_code IS NOT NULL;

COMMENT ON TABLE topics__cards IS 'Extension table for topics of type card (credit/debit cards).';
COMMENT ON COLUMN topics__cards.topic_id IS 'The topic that is a card (PK, 1:1 with topics).';
COMMENT ON COLUMN topics__cards.bank_id IS 'The issuing bank topic (e.g. Chase, Citi).';
COMMENT ON COLUMN topics__cards.brand_id IS 'The co-brand topic (e.g. Marriott, Hilton).';
COMMENT ON COLUMN topics__cards.annual_fee_minor_units IS 'Annual fee in the currency minor unit. NULL if unknown.';
COMMENT ON COLUMN topics__cards.currency_code IS 'Currency for the annual fee. NULL when the fee is unknown.';

--------------------------------------------------------------------------------
-- topics__rewards_program_statuses
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS topics__rewards_program_statuses (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,

  -- if set, this points to the lifetime version of this status
  -- e.g. if this is "Hyatt Globalist", this will point to "Hyatt Lifetime Globalist"
  lifetime_version_id UUID REFERENCES topics__rewards_program_statuses ON DELETE CASCADE,

  -- order_index ASC for lowest tier to highest tier
  order_index SMALLINT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_topics__rewards_program_statuses_updated_at
BEFORE UPDATE ON topics__rewards_program_statuses
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- only one lifetime version per rewards program status
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics__rewards_program_statuses__lifetime_version_id
ON topics__rewards_program_statuses (lifetime_version_id)
WHERE lifetime_version_id IS NOT NULL;

COMMENT ON TABLE topics__rewards_program_statuses IS 'Extension table for topics of type rewards_program_status (e.g. Marriott Platinum Elite).';
COMMENT ON COLUMN topics__rewards_program_statuses.topic_id IS 'The topic that is a rewards program status (PK, 1:1 with topics).';
COMMENT ON COLUMN topics__rewards_program_statuses.lifetime_version_id IS 'Points to the lifetime version of this status (e.g. Hyatt Lifetime Globalist).';
COMMENT ON COLUMN topics__rewards_program_statuses.order_index IS 'Sort order: lowest tier = 0, ascending for higher tiers.';

--------------------------------------------------------------------------------
-- topics__spending_categories
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS topics__spending_categories (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,

  -- e.g. Restaurants (Foreign Transaction)
  is_foreign_transaction BOOLEAN NOT NULL DEFAULT FALSE,

  -- the default spending frequency type for this spending category
  default_spending_frequency spending_frequencies NOT NULL DEFAULT 'monthly',

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_topics__spending_categories_updated_at
BEFORE UPDATE ON topics__spending_categories
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE topics__spending_categories IS 'Extension table for spending category topics (e.g. Restaurants, Gas, Travel).';
COMMENT ON COLUMN topics__spending_categories.topic_id IS 'The topic that is a spending category (PK, 1:1 with topics).';
COMMENT ON COLUMN topics__spending_categories.is_foreign_transaction IS 'Whether this category applies to foreign transactions.';
COMMENT ON COLUMN topics__spending_categories.default_spending_frequency IS 'Default frequency for spending in this category (monthly or annually).';

--------------------------------------------------------------------------------
-- topic_aliases
--------------------------------------------------------------------------------

-- An alias may be unlinked while it is used as a standalone hashtag. Application
-- validation owns hashtag grammar so the grammar can evolve without a schema change.
CREATE TABLE IF NOT EXISTS topic_aliases (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  topic_id UUID REFERENCES topics ON DELETE RESTRICT,
  alias TEXT NOT NULL,
  CHECK (char_length(alias) <= 255),
  CHECK (alias = LOWER(alias)),
  CHECK (alias = TRIM(alias)),

  search_vector TSVECTOR GENERATED ALWAYS AS (setweight(to_tsvector('voucha_english', alias), 'A')) STORED,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID REFERENCES users ON DELETE SET NULL,

  UNIQUE (alias)
);

CREATE OR REPLACE TRIGGER trigger_topic_aliases_updated_at
BEFORE UPDATE ON topic_aliases
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- finding aliases by topic
CREATE INDEX IF NOT EXISTS topic_aliases__topic_id
ON topic_aliases (topic_id, alias)
WHERE topic_id IS NOT NULL;

-- search by prefix for searching aliases
CREATE INDEX IF NOT EXISTS topic_aliases__alias__text_pattern_ops
ON topic_aliases (LOWER(alias) text_pattern_ops);

-- full text search for aliases
CREATE INDEX IF NOT EXISTS topic_aliases__search_vector
ON topic_aliases USING GIN (search_vector);

-- indexes for foreign keys
CREATE INDEX IF NOT EXISTS topic_aliases__created_by_id
ON topic_aliases (created_by_id);

CREATE INDEX IF NOT EXISTS topic_aliases__updated_by_id
ON topic_aliases (updated_by_id);

COMMENT ON TABLE topic_aliases IS 'Topic aliases and standalone hashtags. Linked aliases are synced to topics.aliases.';
COMMENT ON COLUMN topic_aliases.topic_id IS 'The linked topic. NULL identifies a standalone hashtag.';
COMMENT ON COLUMN topic_aliases.alias IS 'Lowercase canonical alias or hashtag lookup key. Unique globally.';

-- Durable, coalesced work for category mappings changed by a linked alias. This intentionally has
-- no foreign key: a linked alias DELETE must leave a tombstone for asynchronous cleanup.
CREATE TABLE IF NOT EXISTS topic_alias_category_mapping_reconciliations (
  topic_alias_id UUID PRIMARY KEY,
  alias TEXT NOT NULL,
  generation BIGINT NOT NULL DEFAULT 1 CHECK (generation > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS topic_alias_category_mapping_reconciliations__updated_at
ON topic_alias_category_mapping_reconciliations (updated_at, topic_alias_id);

CREATE OR REPLACE FUNCTION fn_mark_topic_alias_category_mapping_dirty()
RETURNS TRIGGER AS $$
DECLARE
  dirty_alias_id UUID;
  dirty_alias TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.topic_id IS NULL THEN
      RETURN NEW;
    END IF;
    dirty_alias_id := NEW.id;
    dirty_alias := NEW.alias;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.topic_id IS NOT DISTINCT FROM OLD.topic_id THEN
      RETURN NEW;
    END IF;
    dirty_alias_id := NEW.id;
    dirty_alias := NEW.alias;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.topic_id IS NULL THEN
      RETURN OLD;
    END IF;
    dirty_alias_id := OLD.id;
    dirty_alias := OLD.alias;
  END IF;

  INSERT INTO topic_alias_category_mapping_reconciliations (topic_alias_id, alias)
  VALUES (dirty_alias_id, dirty_alias)
  ON CONFLICT (topic_alias_id) DO UPDATE
  SET alias = EXCLUDED.alias,
      generation = topic_alias_category_mapping_reconciliations.generation + 1,
      updated_at = CURRENT_TIMESTAMP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_topic_aliases_mark_category_mapping_dirty
AFTER INSERT OR UPDATE OF topic_id OR DELETE ON topic_aliases
FOR EACH ROW
EXECUTE FUNCTION fn_mark_topic_alias_category_mapping_dirty();

COMMENT ON TABLE topic_alias_category_mapping_reconciliations IS 'Coalesced cleanup/backfill work for linked topic aliases; delete tombstones have no FK by design.';
COMMENT ON COLUMN topic_alias_category_mapping_reconciliations.topic_alias_id IS 'Alias transition identity; the primary key coalesces pending work for the same alias.';
COMMENT ON COLUMN topic_alias_category_mapping_reconciliations.alias IS 'Canonical alias retained without a foreign key so delete tombstones can clear stale category mappings.';
COMMENT ON COLUMN topic_alias_category_mapping_reconciliations.generation IS 'Monotonic transition generation used to prevent stale workers from acknowledging newer alias ownership changes.';

--------------------------------------------------------------------------------
-- topics__retailers
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS topics__retailers (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_topics__retailers_updated_at
BEFORE UPDATE ON topics__retailers
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE topics__retailers IS 'Extension table for topics of type retailer, representing a store or marketplace that sells products.';
COMMENT ON COLUMN topics__retailers.topic_id IS 'The topic representing this retailer.';

--------------------------------------------------------------------------------
-- topics__fediverse_instances
--------------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE fediverse_integration_statuses AS ENUM (
  'pending',
  'approved',
  'blocked'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- NodeInfo-derived classification for topics of type fediverse_instance. `integration_status`
-- is declared here but trigger-maintained from an append-only allowlist-decision history table
-- added by a later migration (see docs/overview/architecture/fediverse-federation.md) — do not
-- write to it directly.
CREATE TABLE IF NOT EXISTS topics__fediverse_instances (
  topic_id UUID PRIMARY KEY REFERENCES topics ON DELETE CASCADE,

  software TEXT,
  protocol TEXT,
  nodeinfo_software_version TEXT,
  total_users INTEGER,
  monthly_active_users INTEGER,
  open_registrations BOOLEAN,
  nodeinfo_raw JSONB,

  integration_status fediverse_integration_statuses NOT NULL DEFAULT 'pending',

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_topics__fediverse_instances_updated_at
BEFORE UPDATE ON topics__fediverse_instances
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE topics__fediverse_instances IS 'Extension table for topics of type fediverse_instance. NodeInfo-derived classification plus admin allowlist state for a federated server.';
COMMENT ON COLUMN topics__fediverse_instances.topic_id IS 'The topic that is a fediverse instance (PK, 1:1 with topics).';
COMMENT ON COLUMN topics__fediverse_instances.software IS 'NodeInfo software.name (e.g. mastodon, lemmy, peertube). NULL until classified.';
COMMENT ON COLUMN topics__fediverse_instances.protocol IS 'Primary federation protocol reported by NodeInfo (e.g. activitypub). NULL until classified.';
COMMENT ON COLUMN topics__fediverse_instances.nodeinfo_software_version IS 'NodeInfo software.version string. NULL until classified.';
COMMENT ON COLUMN topics__fediverse_instances.total_users IS 'NodeInfo usage.users.total. NULL until classified or unreported.';
COMMENT ON COLUMN topics__fediverse_instances.monthly_active_users IS 'NodeInfo usage.users.activeMonth. NULL until classified or unreported.';
COMMENT ON COLUMN topics__fediverse_instances.open_registrations IS 'NodeInfo openRegistrations flag. NULL until classified.';
COMMENT ON COLUMN topics__fediverse_instances.nodeinfo_raw IS 'Full NodeInfo 2.0 document as fetched, for fields not individually modeled.';
COMMENT ON COLUMN topics__fediverse_instances.integration_status IS 'Admin allowlist decision (pending, approved, blocked). Trigger-maintained from an append-only decision history table.';

-- Only one active (non-deleted, non-merged) fediverse_instance topic per hostname.
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics__fediverse_instance__hostname_id
ON topics (hostname_id)
WHERE topic_type = 'fediverse_instance' AND deleted_at IS NULL AND merged_into_topic_id IS NULL;

--------------------------------------------------------------------------------
-- fediverse_instance_integration_changes
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fediverse_instance_integration_changes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  topic_id UUID NOT NULL REFERENCES topics ON DELETE CASCADE,
  integration_status fediverse_integration_statuses NOT NULL,
  changed_by_id UUID REFERENCES users ON DELETE SET NULL,
  reason TEXT,
  CHECK (reason IS NULL OR char_length(reason) <= 1000),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);
CREATE INDEX IF NOT EXISTS idx_fediverse_instance_integration_changes__topic_id__id
  ON fediverse_instance_integration_changes (topic_id, id DESC);
COMMENT ON TABLE fediverse_instance_integration_changes IS 'Append-only audit log of admin allowlist decisions for fediverse_instance topics. Current state is the latest row per topic_id.';
COMMENT ON COLUMN fediverse_instance_integration_changes.topic_id IS 'The fediverse_instance topic whose admin allowlist state changed.';
COMMENT ON COLUMN fediverse_instance_integration_changes.integration_status IS 'The allowlist decision (pending, approved, blocked) after this change.';
COMMENT ON COLUMN fediverse_instance_integration_changes.changed_by_id IS 'Admin user who made this allowlist decision.';
COMMENT ON COLUMN fediverse_instance_integration_changes.reason IS 'Optional human-readable reason for the allowlist decision.';

-- Keep topics__fediverse_instances.integration_status in sync with the latest
-- fediverse_instance_integration_changes row. Reads the MAX-id row rather than
-- trusting NEW.integration_status to defend against out-of-order transaction
-- commits on the same topic.
CREATE OR REPLACE FUNCTION fn_sync_fediverse_instance_integration_status()
RETURNS TRIGGER AS $$
DECLARE
  v_status fediverse_integration_statuses;
BEGIN
  -- Serialize concurrent triggers for the same topic: acquire a row-level lock on
  -- topics__fediverse_instances before re-reading the latest change, so whichever
  -- trigger holds the lock last wins and writes the correct (most-recently-committed) value.
  PERFORM topic_id FROM topics__fediverse_instances WHERE topic_id = NEW.topic_id FOR UPDATE;
  SELECT integration_status INTO v_status
  FROM fediverse_instance_integration_changes
  WHERE topic_id = NEW.topic_id
  ORDER BY id DESC LIMIT 1;
  UPDATE topics__fediverse_instances SET integration_status = v_status
  WHERE topic_id = NEW.topic_id AND integration_status IS DISTINCT FROM v_status;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_sync_fediverse_instance_integration_status
AFTER INSERT ON fediverse_instance_integration_changes
FOR EACH ROW
EXECUTE FUNCTION fn_sync_fediverse_instance_integration_status();

-- ==========================================================================
-- 0160-00-00-review-snippet-categories.sql
-- ============================================================================

-- Review Snippet Categories - seed 20 canonical category topics
-- Categories are used to map topics to schema.org types for Google Review Snippets

-- 1. Insert category topics
-- Using digest() from pgcrypto extension (already installed for embeddings)
INSERT INTO topics (id, name, slug, bedrock_nova_multimodal_v1_content_sha256)
VALUES
  (uuidv7(), 'Voucha', 'voucha', digest('Voucha' || E'\n\n', 'sha256')),
  (uuidv7(), 'Books', 'books', digest('Books' || E'\n\n', 'sha256')),
  (uuidv7(), 'Courses', 'courses', digest('Courses' || E'\n\n', 'sha256')),
  (uuidv7(), 'Events', 'events', digest('Events' || E'\n\n', 'sha256')),
  (uuidv7(), 'Local Businesses', 'local-businesses', digest('Local Businesses' || E'\n\n', 'sha256')),
  (uuidv7(), 'Movies', 'movies', digest('Movies' || E'\n\n', 'sha256')),
  (uuidv7(), 'Products', 'products', digest('Products' || E'\n\n', 'sha256')),
  (uuidv7(), 'Software Products', 'software-products', digest('Software Products' || E'\n\n', 'sha256')),
  (uuidv7(), 'Hardware Products', 'hardware-products', digest('Hardware Products' || E'\n\n', 'sha256')),
  (uuidv7(), 'Recipes', 'recipes', digest('Recipes' || E'\n\n', 'sha256')),
  (uuidv7(), 'Creative Work Seasons', 'creative-work-seasons', digest('Creative Work Seasons' || E'\n\n', 'sha256')),
  (uuidv7(), 'TV Show Seasons', 'tv-show-seasons', digest('TV Show Seasons' || E'\n\n', 'sha256')),
  (uuidv7(), 'Creative Work Series', 'creative-work-series', digest('Creative Work Series' || E'\n\n', 'sha256')),
  (uuidv7(), 'TV Shows', 'tv-shows', digest('TV Shows' || E'\n\n', 'sha256')),
  (uuidv7(), 'Creative Work Episodes', 'creative-work-episodes', digest('Creative Work Episodes' || E'\n\n', 'sha256')),
  (uuidv7(), 'TV Show Episodes', 'tv-show-episodes', digest('TV Show Episodes' || E'\n\n', 'sha256')),
  (uuidv7(), 'Games', 'games', digest('Games' || E'\n\n', 'sha256')),
  (uuidv7(), 'Songs', 'songs', digest('Songs' || E'\n\n', 'sha256')),
  (uuidv7(), 'Playlists', 'playlists', digest('Playlists' || E'\n\n', 'sha256')),
  (uuidv7(), 'Organizations', 'organizations', digest('Organizations' || E'\n\n', 'sha256'))
ON CONFLICT DO NOTHING;

-- Every active topic's current slug is an alias. Runtime creates and slug updates maintain this;
-- this seed closes the same invariant for bootstrap topics and a staging reset.
INSERT INTO topic_aliases (topic_id, alias)
SELECT id, slug
FROM topics
WHERE deleted_at IS NULL
  AND merged_into_topic_id IS NULL
ON CONFLICT (alias) DO UPDATE
SET topic_id = EXCLUDED.topic_id
WHERE topic_aliases.topic_id IS NULL OR topic_aliases.topic_id = EXCLUDED.topic_id;

UPDATE topics topic
SET aliases = COALESCE(
  (
    SELECT ARRAY_AGG(alias ORDER BY alias)
    FROM topic_aliases
    WHERE topic_id = topic.id
  ),
  '{}'::TEXT[]
)
WHERE topic.deleted_at IS NULL
  AND topic.merged_into_topic_id IS NULL;

-- 2. Insert singular aliases
-- Extract topic IDs from the topics we just inserted
INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'book' FROM topics t WHERE t.slug = 'books' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'course' FROM topics t WHERE t.slug = 'courses' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'event' FROM topics t WHERE t.slug = 'events' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'local business' FROM topics t WHERE t.slug = 'local-businesses' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'movie' FROM topics t WHERE t.slug = 'movies' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'product' FROM topics t WHERE t.slug = 'products' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'software product' FROM topics t WHERE t.slug = 'software-products' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'hardware product' FROM topics t WHERE t.slug = 'hardware-products' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'recipe' FROM topics t WHERE t.slug = 'recipes' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'creative work season' FROM topics t WHERE t.slug = 'creative-work-seasons' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'tv show season' FROM topics t WHERE t.slug = 'tv-show-seasons' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'creative work series' FROM topics t WHERE t.slug = 'creative-work-series' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'tv series' FROM topics t WHERE t.slug = 'tv-shows' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'creative work episode' FROM topics t WHERE t.slug = 'creative-work-episodes' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'tv show episode' FROM topics t WHERE t.slug = 'tv-show-episodes' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'game' FROM topics t WHERE t.slug = 'games' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'song' FROM topics t WHERE t.slug = 'songs' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'playlist' FROM topics t WHERE t.slug = 'playlists' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, 'organization' FROM topics t WHERE t.slug = 'organizations' AND t.deleted_at IS NULL
  ON CONFLICT (alias) DO NOTHING;

UPDATE topics topic
SET aliases = COALESCE(
  (SELECT ARRAY_AGG(alias ORDER BY alias) FROM topic_aliases WHERE topic_id = topic.id),
  '{}'::TEXT[]
)
WHERE topic.deleted_at IS NULL
  AND topic.merged_into_topic_id IS NULL;
