DO $$ BEGIN
  CREATE TYPE revision_types AS ENUM ('create', 'update', 'delete');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Post revisions: RANGE partitioned by id (UUIDv7) for partition-wise locality.
-- Unchanged fields stay null with their *_changed flag false. 'now' sentinels record
-- delete/archive markers that are not timestamps.
CREATE TABLE IF NOT EXISTS post_revisions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  post_id UUID NOT NULL,
  revision_type revision_types NOT NULL,
  revised_by_id UUID,
  title_changed BOOLEAN NOT NULL DEFAULT FALSE,
  title_before TEXT,
  title_after TEXT,
  markdown_changed BOOLEAN NOT NULL DEFAULT FALSE,
  markdown_before TEXT,
  markdown_after TEXT,
  ai_summary_markdown_changed BOOLEAN NOT NULL DEFAULT FALSE,
  ai_summary_markdown_before TEXT,
  ai_summary_markdown_after TEXT,
  broadcast_changed BOOLEAN NOT NULL DEFAULT FALSE,
  broadcast_before broadcast_types,
  broadcast_after broadcast_types,
  privacy_changed BOOLEAN NOT NULL DEFAULT FALSE,
  privacy_before privacy_types,
  privacy_after privacy_types,
  is_anonymous_changed BOOLEAN NOT NULL DEFAULT FALSE,
  is_anonymous_before BOOLEAN,
  is_anonymous_after BOOLEAN,
  data_point_vertical_changed BOOLEAN NOT NULL DEFAULT FALSE,
  data_point_vertical_before TEXT,
  data_point_vertical_after TEXT,
  declared_language_changed BOOLEAN NOT NULL DEFAULT FALSE,
  declared_language_before TEXT,
  declared_language_after TEXT,
  slug_changed BOOLEAN NOT NULL DEFAULT FALSE,
  slug_before TEXT,
  slug_after TEXT,
  deleted_at_changed BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at_before TIMESTAMPTZ,
  deleted_at_after TIMESTAMPTZ,
  deleted_at_before_sentinel TEXT,
  deleted_at_after_sentinel TEXT,
  archived_at_changed BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at_before TIMESTAMPTZ,
  archived_at_after TIMESTAMPTZ,
  archived_at_before_sentinel TEXT,
  archived_at_after_sentinel TEXT,
  categories_changed BOOLEAN NOT NULL DEFAULT FALSE,
  post_images_changed BOOLEAN NOT NULL DEFAULT FALSE,
  review_topic_ratings_changed BOOLEAN NOT NULL DEFAULT FALSE,
  structured_data_changed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT post_revisions_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT post_revisions_revised_by_id_fkey
    FOREIGN KEY (revised_by_id) REFERENCES users(id) ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT post_revisions_deleted_at_before_sentinel_check
    CHECK (deleted_at_before_sentinel IS NULL OR deleted_at_before_sentinel = 'now'),
  CONSTRAINT post_revisions_deleted_at_after_sentinel_check
    CHECK (deleted_at_after_sentinel IS NULL OR deleted_at_after_sentinel = 'now'),
  CONSTRAINT post_revisions_archived_at_before_sentinel_check
    CHECK (archived_at_before_sentinel IS NULL OR archived_at_before_sentinel = 'now'),
  CONSTRAINT post_revisions_archived_at_after_sentinel_check
    CHECK (archived_at_after_sentinel IS NULL OR archived_at_after_sentinel = 'now'),
  CONSTRAINT post_revisions_deleted_at_before_exclusive_check
    CHECK (deleted_at_before IS NULL OR deleted_at_before_sentinel IS NULL),
  CONSTRAINT post_revisions_deleted_at_after_exclusive_check
    CHECK (deleted_at_after IS NULL OR deleted_at_after_sentinel IS NULL),
  CONSTRAINT post_revisions_archived_at_before_exclusive_check
    CHECK (archived_at_before IS NULL OR archived_at_before_sentinel IS NULL),
  CONSTRAINT post_revisions_archived_at_after_exclusive_check
    CHECK (archived_at_after IS NULL OR archived_at_after_sentinel IS NULL),
  CONSTRAINT post_revisions_data_point_vertical_before_check
    CHECK (data_point_vertical_before IS NULL OR data_point_vertical_before IN ('credit_card', 'bank_account')),
  CONSTRAINT post_revisions_data_point_vertical_after_check
    CHECK (data_point_vertical_after IS NULL OR data_point_vertical_after IN ('credit_card', 'bank_account'))
) PARTITION BY RANGE (id);

COMMENT ON TABLE post_revisions IS 'Append-only revision log for posts. Changed fields are typed before/after columns; unchanged fields are omitted.';
COMMENT ON COLUMN post_revisions.post_id IS 'The post this revision is for.';
COMMENT ON COLUMN post_revisions.revision_type IS 'Type of change: create, update, or delete.';
COMMENT ON COLUMN post_revisions.revised_by_id IS 'The user who performed this change.';

-- Topic revisions: not partitioned (small table, all queries filter by topic_id).
CREATE TABLE IF NOT EXISTS topic_revisions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  topic_id UUID NOT NULL,
  revision_type revision_types NOT NULL,
  revised_by_id UUID,
  revised_by_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  name_changed BOOLEAN NOT NULL DEFAULT FALSE,
  name_before TEXT,
  name_after TEXT,
  slug_changed BOOLEAN NOT NULL DEFAULT FALSE,
  slug_before TEXT,
  slug_after TEXT,
  topic_type_changed BOOLEAN NOT NULL DEFAULT FALSE,
  topic_type_before topic_types,
  topic_type_after topic_types,
  markdown_changed BOOLEAN NOT NULL DEFAULT FALSE,
  markdown_before TEXT,
  markdown_after TEXT,
  noindex_changed BOOLEAN NOT NULL DEFAULT FALSE,
  noindex_before BOOLEAN,
  noindex_after BOOLEAN,
  allow_reviews_changed BOOLEAN NOT NULL DEFAULT FALSE,
  allow_reviews_before BOOLEAN,
  allow_reviews_after BOOLEAN,
  logo_image_id_changed BOOLEAN NOT NULL DEFAULT FALSE,
  logo_image_id_before UUID REFERENCES retained_image_identities (id) ON DELETE RESTRICT,
  logo_image_id_after UUID REFERENCES retained_image_identities (id) ON DELETE RESTRICT,
  hero_image_id_changed BOOLEAN NOT NULL DEFAULT FALSE,
  hero_image_id_before UUID REFERENCES retained_image_identities (id) ON DELETE RESTRICT,
  hero_image_id_after UUID REFERENCES retained_image_identities (id) ON DELETE RESTRICT,
  homepage_url_id_changed BOOLEAN NOT NULL DEFAULT FALSE,
  homepage_url_id_before UUID REFERENCES retained_url_identities (id) ON DELETE RESTRICT,
  homepage_url_id_after UUID REFERENCES retained_url_identities (id) ON DELETE RESTRICT,
  hostname_id_changed BOOLEAN NOT NULL DEFAULT FALSE,
  hostname_id_before UUID REFERENCES retained_url_hostname_identities (id) ON DELETE RESTRICT,
  hostname_id_after UUID REFERENCES retained_url_hostname_identities (id) ON DELETE RESTRICT,
  rewards_program_id_changed BOOLEAN NOT NULL DEFAULT FALSE,
  rewards_program_id_before UUID REFERENCES retained_topic_identities (id) ON DELETE RESTRICT,
  rewards_program_id_after UUID REFERENCES retained_topic_identities (id) ON DELETE RESTRICT,
  referral_program_id_changed BOOLEAN NOT NULL DEFAULT FALSE,
  referral_program_id_before UUID REFERENCES retained_topic_identities (id) ON DELETE RESTRICT,
  referral_program_id_after UUID REFERENCES retained_topic_identities (id) ON DELETE RESTRICT,
  deleted_at_changed BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at_before TIMESTAMPTZ,
  deleted_at_after TIMESTAMPTZ,
  deleted_at_before_sentinel TEXT,
  deleted_at_after_sentinel TEXT,
  alias_change_kind TEXT,
  alias_before_is_list BOOLEAN NOT NULL DEFAULT FALSE,
  alias_after_is_list BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT topic_revisions_topic_id_fkey
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT topic_revisions_revised_by_id_fkey
    FOREIGN KEY (revised_by_id) REFERENCES users(id) ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT topic_revisions_deleted_at_before_sentinel_check
    CHECK (deleted_at_before_sentinel IS NULL OR deleted_at_before_sentinel = 'now'),
  CONSTRAINT topic_revisions_deleted_at_after_sentinel_check
    CHECK (deleted_at_after_sentinel IS NULL OR deleted_at_after_sentinel = 'now'),
  CONSTRAINT topic_revisions_deleted_at_before_exclusive_check
    CHECK (deleted_at_before IS NULL OR deleted_at_before_sentinel IS NULL),
  CONSTRAINT topic_revisions_deleted_at_after_exclusive_check
    CHECK (deleted_at_after IS NULL OR deleted_at_after_sentinel IS NULL),
  CONSTRAINT topic_revisions_alias_change_kind_check
    CHECK (alias_change_kind IS NULL OR alias_change_kind IN ('topic_alias_link', 'topic_alias_unlink', 'topic_aliases')),
  CONSTRAINT topic_revisions_alias_list_flags_check
    CHECK (alias_change_kind IS NOT NULL OR (NOT alias_before_is_list AND NOT alias_after_is_list))
);

COMMENT ON TABLE topic_revisions IS 'Append-only revision log for topics. Changed fields are typed before/after columns; unchanged fields are omitted. Role snapshots stay as captured.';
COMMENT ON COLUMN topic_revisions.topic_id IS 'The topic this revision is for.';
COMMENT ON COLUMN topic_revisions.revision_type IS 'Type of change: create, update, or delete.';
COMMENT ON COLUMN topic_revisions.revised_by_id IS 'The user who performed this change.';
COMMENT ON COLUMN topic_revisions.revised_by_roles IS 'Snapshot of the revising user roles at revision creation time. Later role changes do not rewrite it.';
COMMENT ON COLUMN topic_revisions.alias_change_kind IS 'Which alias fact changed: link, unlink, or the alias-text set. Null when aliases were unchanged.';
COMMENT ON COLUMN topic_revisions.alias_before_is_list IS 'True when the before alias fact was an array rather than one object.';
COMMENT ON COLUMN topic_revisions.alias_after_is_list IS 'True when the after alias fact was an array rather than one object.';

CREATE INDEX IF NOT EXISTS idx_post_revisions__post_id ON post_revisions (post_id);
CREATE INDEX IF NOT EXISTS idx_topic_revisions__topic_id ON topic_revisions (topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_revisions__admin_content_update
  ON topic_revisions (topic_id, id DESC)
  WHERE revision_type IN ('create', 'update')
    AND (name_changed OR markdown_changed)
    AND revised_by_roles @> ARRAY['administrator']::TEXT[];

CREATE INDEX IF NOT EXISTS idx_topic_revisions__logo_image_id_before
  ON topic_revisions (logo_image_id_before) WHERE logo_image_id_before IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_revisions__logo_image_id_after
  ON topic_revisions (logo_image_id_after) WHERE logo_image_id_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_revisions__hero_image_id_before
  ON topic_revisions (hero_image_id_before) WHERE hero_image_id_before IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_revisions__hero_image_id_after
  ON topic_revisions (hero_image_id_after) WHERE hero_image_id_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_revisions__homepage_url_id_before
  ON topic_revisions (homepage_url_id_before) WHERE homepage_url_id_before IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_revisions__homepage_url_id_after
  ON topic_revisions (homepage_url_id_after) WHERE homepage_url_id_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_revisions__hostname_id_before
  ON topic_revisions (hostname_id_before) WHERE hostname_id_before IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_revisions__hostname_id_after
  ON topic_revisions (hostname_id_after) WHERE hostname_id_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_revisions__rewards_program_id_before
  ON topic_revisions (rewards_program_id_before) WHERE rewards_program_id_before IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_revisions__rewards_program_id_after
  ON topic_revisions (rewards_program_id_after) WHERE rewards_program_id_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_revisions__referral_program_id_before
  ON topic_revisions (referral_program_id_before) WHERE referral_program_id_before IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_revisions__referral_program_id_after
  ON topic_revisions (referral_program_id_after) WHERE referral_program_id_after IS NOT NULL;

CREATE TABLE IF NOT EXISTS post_revision_images (
  revision_id UUID NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('before', 'after')),
  position INTEGER NOT NULL CHECK (position >= 0),
  image_id UUID NOT NULL REFERENCES retained_image_identities (id) ON DELETE RESTRICT,
  PRIMARY KEY (revision_id, side, position),
  CONSTRAINT post_revision_images_revision_id_fkey
    FOREIGN KEY (revision_id) REFERENCES post_revisions (id) ON DELETE CASCADE
);
COMMENT ON TABLE post_revision_images IS 'Ordered image identities for a post revision side. Rows exist only when post images changed.';
COMMENT ON COLUMN post_revision_images.revision_id IS 'Post revision whose image list changed.';
COMMENT ON COLUMN post_revision_images.side IS 'Whether this image belonged to the before list or the after list.';
COMMENT ON COLUMN post_revision_images.position IS 'Zero-based order of the image in that side.';
COMMENT ON COLUMN post_revision_images.image_id IS 'Retained image identity. It does not authorize delivery.';
CREATE INDEX IF NOT EXISTS idx_post_revision_images__image_id ON post_revision_images (image_id);

CREATE TABLE IF NOT EXISTS post_revision_rating_topics (
  revision_id UUID NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('before', 'after')),
  position INTEGER NOT NULL CHECK (position >= 0),
  topic_id UUID NOT NULL REFERENCES retained_topic_identities (id) ON DELETE RESTRICT,
  PRIMARY KEY (revision_id, side, position),
  CONSTRAINT post_revision_rating_topics_revision_id_fkey
    FOREIGN KEY (revision_id) REFERENCES post_revisions (id) ON DELETE CASCADE
);
COMMENT ON TABLE post_revision_rating_topics IS 'Ordered rated topic identities for a post revision side. Rows exist only when ratings changed.';
COMMENT ON COLUMN post_revision_rating_topics.revision_id IS 'Post revision whose review topic ratings changed.';
COMMENT ON COLUMN post_revision_rating_topics.side IS 'Whether this topic belonged to the before list or the after list.';
COMMENT ON COLUMN post_revision_rating_topics.position IS 'Zero-based order of the rated topic in that side.';
COMMENT ON COLUMN post_revision_rating_topics.topic_id IS 'Retained topic identity that was rated. It does not authorize the topic.';
CREATE INDEX IF NOT EXISTS idx_post_revision_rating_topics__topic_id
  ON post_revision_rating_topics (topic_id);

CREATE TABLE IF NOT EXISTS post_revision_categories (
  revision_id UUID NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('before', 'after')),
  position INTEGER NOT NULL CHECK (position >= 0),
  topic_id UUID REFERENCES retained_topic_identities (id) ON DELETE RESTRICT,
  hashtag TEXT,
  topic_name TEXT,
  PRIMARY KEY (revision_id, side, position),
  CONSTRAINT post_revision_categories_revision_id_fkey
    FOREIGN KEY (revision_id) REFERENCES post_revisions (id) ON DELETE CASCADE,
  CONSTRAINT post_revision_categories_target_check CHECK (num_nonnulls(topic_id, hashtag) = 1),
  CONSTRAINT post_revision_categories_topic_name_check CHECK (topic_name IS NULL OR topic_id IS NOT NULL)
);
COMMENT ON TABLE post_revision_categories IS 'Ordered explicit category facts for a post revision side. Rows exist only when categories changed.';
COMMENT ON COLUMN post_revision_categories.revision_id IS 'Post revision whose explicit categories changed.';
COMMENT ON COLUMN post_revision_categories.side IS 'Whether this category belonged to the before list or the after list.';
COMMENT ON COLUMN post_revision_categories.position IS 'Zero-based order of the category in that side.';
COMMENT ON COLUMN post_revision_categories.topic_id IS 'Retained topic identity when the category is a topic.';
COMMENT ON COLUMN post_revision_categories.hashtag IS 'Hashtag text when the category is a hashtag.';
COMMENT ON COLUMN post_revision_categories.topic_name IS 'Topic name captured with a topic category, when the writer had one.';
CREATE INDEX IF NOT EXISTS idx_post_revision_categories__topic_id
  ON post_revision_categories (topic_id) WHERE topic_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS post_revision_data_points (
  revision_id UUID NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('before', 'after')),
  has_vertical BOOLEAN NOT NULL DEFAULT FALSE,
  vertical TEXT CHECK (vertical IS NULL OR vertical IN ('credit_card', 'bank_account')),
  has_schema_version BOOLEAN NOT NULL DEFAULT FALSE,
  schema_version SMALLINT,
  has_result BOOLEAN NOT NULL DEFAULT FALSE,
  result TEXT,
  has_currency BOOLEAN NOT NULL DEFAULT FALSE,
  currency TEXT,
  has_credit_score_range BOOLEAN NOT NULL DEFAULT FALSE,
  credit_score_range TEXT,
  has_stated_income_range BOOLEAN NOT NULL DEFAULT FALSE,
  stated_income_min_amount BIGINT,
  stated_income_min_currency TEXT,
  stated_income_max_absent BOOLEAN NOT NULL DEFAULT FALSE,
  stated_income_max_amount BIGINT,
  stated_income_max_currency TEXT,
  has_existing_relationship BOOLEAN NOT NULL DEFAULT FALSE,
  existing_relationship BOOLEAN,
  has_hard_inquiries_12m BOOLEAN NOT NULL DEFAULT FALSE,
  hard_inquiries_12m INTEGER,
  has_cards_opened_24m BOOLEAN NOT NULL DEFAULT FALSE,
  cards_opened_24m INTEGER,
  has_credit_limit BOOLEAN NOT NULL DEFAULT FALSE,
  credit_limit_amount BIGINT,
  credit_limit_currency TEXT,
  has_total_credit_limit_all_cards BOOLEAN NOT NULL DEFAULT FALSE,
  total_credit_limit_amount BIGINT,
  total_credit_limit_currency TEXT,
  has_years_of_credit_history BOOLEAN NOT NULL DEFAULT FALSE,
  years_of_credit_history INTEGER,
  has_is_business_application BOOLEAN NOT NULL DEFAULT FALSE,
  is_business_application BOOLEAN,
  has_application_method BOOLEAN NOT NULL DEFAULT FALSE,
  application_method TEXT,
  has_application_date BOOLEAN NOT NULL DEFAULT FALSE,
  application_date TEXT,
  has_account_type BOOLEAN NOT NULL DEFAULT FALSE,
  account_type TEXT,
  has_bonus_amount BOOLEAN NOT NULL DEFAULT FALSE,
  bonus_amount BIGINT,
  bonus_amount_currency TEXT,
  has_bonus_requirements BOOLEAN NOT NULL DEFAULT FALSE,
  bonus_requirements TEXT,
  has_minimum_balance_requirement BOOLEAN NOT NULL DEFAULT FALSE,
  minimum_balance_amount BIGINT,
  minimum_balance_currency TEXT,
  has_direct_deposit_setup BOOLEAN NOT NULL DEFAULT FALSE,
  direct_deposit_setup BOOLEAN,
  has_topic_ids BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (revision_id, side),
  CONSTRAINT post_revision_data_points_revision_id_fkey
    FOREIGN KEY (revision_id) REFERENCES post_revisions (id) ON DELETE CASCADE
);
COMMENT ON TABLE post_revision_data_points IS 'Typed public data-point object for one post revision side. A row exists only when that side was an object.';
COMMENT ON COLUMN post_revision_data_points.revision_id IS 'Post revision whose structured data changed.';
COMMENT ON COLUMN post_revision_data_points.side IS 'Whether this object is the before value or the after value.';
COMMENT ON COLUMN post_revision_data_points.has_vertical IS 'True when the object included vertical.';
COMMENT ON COLUMN post_revision_data_points.vertical IS 'Data-point vertical when present.';
COMMENT ON COLUMN post_revision_data_points.has_schema_version IS 'True when the object included schema_version.';
COMMENT ON COLUMN post_revision_data_points.schema_version IS 'Public structured-data schema version when present.';
COMMENT ON COLUMN post_revision_data_points.has_result IS 'True when the object included result.';
COMMENT ON COLUMN post_revision_data_points.result IS 'Application or action result when present.';
COMMENT ON COLUMN post_revision_data_points.has_currency IS 'True when the object included currency.';
COMMENT ON COLUMN post_revision_data_points.currency IS 'Currency code when present.';
COMMENT ON COLUMN post_revision_data_points.has_credit_score_range IS 'True when the object included credit_score_range, including an explicit null.';
COMMENT ON COLUMN post_revision_data_points.credit_score_range IS 'Credit score range when present and not null.';
COMMENT ON COLUMN post_revision_data_points.has_stated_income_range IS 'True when the object included stated_income_range, including an explicit null.';
COMMENT ON COLUMN post_revision_data_points.stated_income_min_amount IS 'Stated income range minimum amount.';
COMMENT ON COLUMN post_revision_data_points.stated_income_min_currency IS 'Stated income range minimum currency.';
COMMENT ON COLUMN post_revision_data_points.stated_income_max_absent IS 'True when the range object set maximum to null.';
COMMENT ON COLUMN post_revision_data_points.stated_income_max_amount IS 'Stated income range maximum amount.';
COMMENT ON COLUMN post_revision_data_points.stated_income_max_currency IS 'Stated income range maximum currency.';
COMMENT ON COLUMN post_revision_data_points.has_existing_relationship IS 'True when the object included existing_relationship.';
COMMENT ON COLUMN post_revision_data_points.existing_relationship IS 'Existing issuer or bank relationship when present.';
COMMENT ON COLUMN post_revision_data_points.has_hard_inquiries_12m IS 'True when the object included hard_inquiries_12m, including an explicit null.';
COMMENT ON COLUMN post_revision_data_points.hard_inquiries_12m IS 'Hard inquiries in 12 months when present and not null.';
COMMENT ON COLUMN post_revision_data_points.has_cards_opened_24m IS 'True when the object included cards_opened_24m, including an explicit null.';
COMMENT ON COLUMN post_revision_data_points.cards_opened_24m IS 'Cards opened in 24 months when present and not null.';
COMMENT ON COLUMN post_revision_data_points.has_credit_limit IS 'True when the object included credit_limit, including an explicit null.';
COMMENT ON COLUMN post_revision_data_points.credit_limit_amount IS 'Approved credit limit amount.';
COMMENT ON COLUMN post_revision_data_points.credit_limit_currency IS 'Approved credit limit currency.';
COMMENT ON COLUMN post_revision_data_points.has_total_credit_limit_all_cards IS 'True when the object included total_credit_limit_all_cards, including an explicit null.';
COMMENT ON COLUMN post_revision_data_points.total_credit_limit_amount IS 'Total revolving credit limit amount.';
COMMENT ON COLUMN post_revision_data_points.total_credit_limit_currency IS 'Total revolving credit limit currency.';
COMMENT ON COLUMN post_revision_data_points.has_years_of_credit_history IS 'True when the object included years_of_credit_history, including an explicit null.';
COMMENT ON COLUMN post_revision_data_points.years_of_credit_history IS 'Years of credit history when present and not null.';
COMMENT ON COLUMN post_revision_data_points.has_is_business_application IS 'True when the object included is_business_application.';
COMMENT ON COLUMN post_revision_data_points.is_business_application IS 'Whether the application was for a business card.';
COMMENT ON COLUMN post_revision_data_points.has_application_method IS 'True when the object included application_method, including an explicit null.';
COMMENT ON COLUMN post_revision_data_points.application_method IS 'How the application was submitted when present and not null.';
COMMENT ON COLUMN post_revision_data_points.has_application_date IS 'True when the object included application_date, including an explicit null.';
COMMENT ON COLUMN post_revision_data_points.application_date IS 'ISO application date when present and not null.';
COMMENT ON COLUMN post_revision_data_points.has_account_type IS 'True when the object included account_type, including an explicit null.';
COMMENT ON COLUMN post_revision_data_points.account_type IS 'Bank account type when present and not null.';
COMMENT ON COLUMN post_revision_data_points.has_bonus_amount IS 'True when the object included bonus_amount, including an explicit null.';
COMMENT ON COLUMN post_revision_data_points.bonus_amount IS 'Sign-up bonus amount.';
COMMENT ON COLUMN post_revision_data_points.bonus_amount_currency IS 'Sign-up bonus currency.';
COMMENT ON COLUMN post_revision_data_points.has_bonus_requirements IS 'True when the object included bonus_requirements, including an explicit null.';
COMMENT ON COLUMN post_revision_data_points.bonus_requirements IS 'Bonus requirement text when present and not null.';
COMMENT ON COLUMN post_revision_data_points.has_minimum_balance_requirement IS 'True when the object included minimum_balance_requirement, including an explicit null.';
COMMENT ON COLUMN post_revision_data_points.minimum_balance_amount IS 'Minimum balance amount.';
COMMENT ON COLUMN post_revision_data_points.minimum_balance_currency IS 'Minimum balance currency.';
COMMENT ON COLUMN post_revision_data_points.has_direct_deposit_setup IS 'True when the object included direct_deposit_setup.';
COMMENT ON COLUMN post_revision_data_points.direct_deposit_setup IS 'Whether direct deposit was set up.';
COMMENT ON COLUMN post_revision_data_points.has_topic_ids IS 'True when the object included topic_ids. The ids live in post_revision_data_point_topics.';

CREATE TABLE IF NOT EXISTS post_revision_data_point_topics (
  revision_id UUID NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('before', 'after')),
  position INTEGER NOT NULL CHECK (position >= 0),
  topic_id UUID NOT NULL REFERENCES retained_topic_identities (id) ON DELETE RESTRICT,
  PRIMARY KEY (revision_id, side, position),
  CONSTRAINT post_revision_data_point_topics_parent_fkey
    FOREIGN KEY (revision_id, side) REFERENCES post_revision_data_points (revision_id, side) ON DELETE CASCADE
);
COMMENT ON TABLE post_revision_data_point_topics IS 'Ordered topic identities inside a revised data-point object.';
COMMENT ON COLUMN post_revision_data_point_topics.revision_id IS 'Post revision that owns the data-point side.';
COMMENT ON COLUMN post_revision_data_point_topics.side IS 'Whether these topic ids belong to the before object or the after object.';
COMMENT ON COLUMN post_revision_data_point_topics.position IS 'Zero-based order of the topic id.';
COMMENT ON COLUMN post_revision_data_point_topics.topic_id IS 'Retained topic identity referenced by structured data. It does not authorize the topic.';
CREATE INDEX IF NOT EXISTS idx_post_revision_data_point_topics__topic_id
  ON post_revision_data_point_topics (topic_id);

CREATE TABLE IF NOT EXISTS topic_revision_alias_entries (
  revision_id UUID NOT NULL REFERENCES topic_revisions (id) ON DELETE CASCADE,
  change_kind TEXT NOT NULL CHECK (change_kind IN ('topic_alias_link', 'topic_alias_unlink', 'topic_aliases')),
  side TEXT NOT NULL CHECK (side IN ('before', 'after')),
  position INTEGER NOT NULL CHECK (position >= 0),
  alias_id UUID REFERENCES retained_topic_alias_identities (id) ON DELETE RESTRICT,
  alias_text TEXT NOT NULL CHECK (char_length(alias_text) BETWEEN 1 AND 255),
  PRIMARY KEY (revision_id, change_kind, side, position)
);
COMMENT ON TABLE topic_revision_alias_entries IS 'Ordered alias facts for one topic revision kind and side. Empty sides have no rows.';
COMMENT ON COLUMN topic_revision_alias_entries.revision_id IS 'Topic revision whose alias fact changed.';
COMMENT ON COLUMN topic_revision_alias_entries.change_kind IS 'Alias fact family: link, unlink, or the alias-text set.';
COMMENT ON COLUMN topic_revision_alias_entries.side IS 'Whether this entry belongs to the before value or the after value.';
COMMENT ON COLUMN topic_revision_alias_entries.position IS 'Zero-based order inside that side.';
COMMENT ON COLUMN topic_revision_alias_entries.alias_id IS 'Retained topic alias identity when the fact named an alias row.';
COMMENT ON COLUMN topic_revision_alias_entries.alias_text IS 'Alias text captured at revision time.';
CREATE INDEX IF NOT EXISTS idx_topic_revision_alias_entries__alias_id
  ON topic_revision_alias_entries (alias_id) WHERE alias_id IS NOT NULL;

DO $$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'title_changed','title_before','title_after','markdown_changed','markdown_before','markdown_after',
    'ai_summary_markdown_changed','ai_summary_markdown_before','ai_summary_markdown_after',
    'broadcast_changed','broadcast_before','broadcast_after','privacy_changed','privacy_before','privacy_after',
    'is_anonymous_changed','is_anonymous_before','is_anonymous_after',
    'data_point_vertical_changed','data_point_vertical_before','data_point_vertical_after',
    'declared_language_changed','declared_language_before','declared_language_after',
    'slug_changed','slug_before','slug_after',
    'deleted_at_changed','deleted_at_before','deleted_at_after','deleted_at_before_sentinel','deleted_at_after_sentinel',
    'archived_at_changed','archived_at_before','archived_at_after','archived_at_before_sentinel','archived_at_after_sentinel',
    'categories_changed','post_images_changed','review_topic_ratings_changed','structured_data_changed'
  ]
  LOOP
    EXECUTE format('COMMENT ON COLUMN post_revisions.%I IS %L', col, 'Typed post revision fact. The changed flag is false when this field was omitted.');
  END LOOP;
  FOREACH col IN ARRAY ARRAY[
    'name_changed','name_before','name_after','slug_changed','slug_before','slug_after',
    'topic_type_changed','topic_type_before','topic_type_after','markdown_changed','markdown_before','markdown_after',
    'noindex_changed','noindex_before','noindex_after','allow_reviews_changed','allow_reviews_before','allow_reviews_after',
    'logo_image_id_changed','logo_image_id_before','logo_image_id_after',
    'hero_image_id_changed','hero_image_id_before','hero_image_id_after',
    'homepage_url_id_changed','homepage_url_id_before','homepage_url_id_after',
    'hostname_id_changed','hostname_id_before','hostname_id_after',
    'rewards_program_id_changed','rewards_program_id_before','rewards_program_id_after',
    'referral_program_id_changed','referral_program_id_before','referral_program_id_after',
    'deleted_at_changed','deleted_at_before','deleted_at_after','deleted_at_before_sentinel','deleted_at_after_sentinel'
  ]
  LOOP
    EXECUTE format('COMMENT ON COLUMN topic_revisions.%I IS %L', col, 'Typed topic revision fact. The changed flag is false when this field was omitted. Identity columns reference retained roots and do not authorize the live row.');
  END LOOP;
END $$;
