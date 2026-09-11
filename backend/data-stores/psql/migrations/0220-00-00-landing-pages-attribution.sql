-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- Merged from: 0175-00-00-user-landing-pages.sql

-- ==========================================================================
-- 0175-00-00-user-landing-pages.sql
-- ============================================================================

-- User landing pages: user-created pages for organizing and displaying
-- their links, reviews, and referral links.

--------------------------------------------------------------------------------
-- Enums
--------------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_landing_page_item_types') THEN
    CREATE TYPE user_landing_page_item_types AS ENUM (
      'profile_link',
      'review',
      'referral_link',
      'topic_group',
      'link'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_landing_page_group_member_types') THEN
    CREATE TYPE user_landing_page_group_member_types AS ENUM (
      'review',
      'referral_link'
    );
  END IF;
END $$;

--------------------------------------------------------------------------------
-- user_landing_pages
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_landing_pages (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  CHECK (char_length(title) <= 100),
  CHECK (title = TRIM(title)),
  subtitle TEXT,
  CHECK (subtitle IS NULL OR char_length(subtitle) <= 280),
  CHECK (subtitle IS NULL OR subtitle = TRIM(subtitle)),
  slug TEXT NOT NULL,
  CHECK (char_length(slug) <= 100),
  CHECK (slug = LOWER(slug)),
  CHECK (slug = TRIM(slug)),
  CHECK (slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT uq_user_landing_pages__user_id_slug UNIQUE (user_id, slug),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_landing_pages__user_id_default
ON user_landing_pages (user_id)
WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_user_landing_pages__user_id_id
ON user_landing_pages (user_id, id);

CREATE OR REPLACE TRIGGER trigger_user_landing_pages_updated_at
BEFORE UPDATE ON user_landing_pages
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE user_landing_pages IS 'User-created landing pages for organizing and displaying their links, reviews, and referral links.';
COMMENT ON COLUMN user_landing_pages.user_id IS 'The user who owns this landing page.';
COMMENT ON COLUMN user_landing_pages.title IS 'Display title for the landing page.';
COMMENT ON COLUMN user_landing_pages.subtitle IS 'Optional subtitle or description.';
COMMENT ON COLUMN user_landing_pages.slug IS 'URL-safe slug unique per user for the landing page URL.';
COMMENT ON COLUMN user_landing_pages.is_default IS 'Whether this is the user''s default landing page; at most one per user.';

--------------------------------------------------------------------------------
-- user_landing_page_items
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_landing_page_items (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  landing_page_id UUID NOT NULL REFERENCES user_landing_pages(id) ON DELETE CASCADE,
  item_type user_landing_page_item_types NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  profile_link_id UUID REFERENCES user_profile_links(id) ON DELETE CASCADE,
  review_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  referral_link_id UUID REFERENCES user_referral_program_links(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  link_label TEXT,
  CHECK (link_label IS NULL OR char_length(link_label) <= 100),
  CHECK (link_label IS NULL OR link_label = TRIM(link_label)),
  link_url TEXT,
  CHECK (link_url IS NULL OR char_length(link_url) <= 2048),
  CHECK (link_url IS NULL OR link_url = TRIM(link_url)),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (
      item_type = 'profile_link'
      AND profile_link_id IS NOT NULL
      AND review_id IS NULL
      AND referral_link_id IS NULL
      AND topic_id IS NULL
      AND link_label IS NULL
      AND link_url IS NULL
    )
    OR (
      item_type = 'review'
      AND profile_link_id IS NULL
      AND review_id IS NOT NULL
      AND referral_link_id IS NULL
      AND topic_id IS NULL
      AND link_label IS NULL
      AND link_url IS NULL
    )
    OR (
      item_type = 'referral_link'
      AND profile_link_id IS NULL
      AND review_id IS NULL
      AND referral_link_id IS NOT NULL
      AND topic_id IS NULL
      AND link_label IS NULL
      AND link_url IS NULL
    )
    OR (
      item_type = 'topic_group'
      AND profile_link_id IS NULL
      AND review_id IS NULL
      AND referral_link_id IS NULL
      AND topic_id IS NOT NULL
      AND link_label IS NULL
      AND link_url IS NULL
    )
    OR (
      item_type = 'link'
      AND profile_link_id IS NULL
      AND review_id IS NULL
      AND referral_link_id IS NULL
      AND topic_id IS NULL
      AND link_label IS NOT NULL
      AND char_length(link_label) >= 1
      AND link_url IS NOT NULL
      AND char_length(link_url) >= 1
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_user_landing_page_items__page_sort
ON user_landing_page_items (landing_page_id, sort_order, id);

CREATE OR REPLACE TRIGGER trigger_user_landing_page_items_updated_at
BEFORE UPDATE ON user_landing_page_items
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE user_landing_page_items IS 'Individual items on a landing page; exactly one of the type-specific FKs is set based on item_type.';
COMMENT ON COLUMN user_landing_page_items.landing_page_id IS 'The landing page this item belongs to.';
COMMENT ON COLUMN user_landing_page_items.item_type IS 'The type of item: profile_link, review, referral_link, or topic_group.';
COMMENT ON COLUMN user_landing_page_items.sort_order IS 'Display order of this item on the landing page.';
COMMENT ON COLUMN user_landing_page_items.profile_link_id IS 'Reference to user_profile_links; set when item_type is profile_link.';
COMMENT ON COLUMN user_landing_page_items.review_id IS 'Reference to a review post; set when item_type is review.';
COMMENT ON COLUMN user_landing_page_items.referral_link_id IS 'Reference to user_referral_program_links; set when item_type is referral_link.';
COMMENT ON COLUMN user_landing_page_items.topic_id IS 'Reference to a topic for grouping; set when item_type is topic_group.';
COMMENT ON COLUMN user_landing_page_items.link_label IS 'Display label for a free-form link; set when item_type is link.';
COMMENT ON COLUMN user_landing_page_items.link_url IS 'Destination URL for a free-form link; set when item_type is link.';

--------------------------------------------------------------------------------
-- user_landing_page_group_members
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_landing_page_group_members (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  landing_page_item_id UUID NOT NULL REFERENCES user_landing_page_items(id) ON DELETE CASCADE,
  member_type user_landing_page_group_member_types NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  review_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  referral_link_id UUID REFERENCES user_referral_program_links(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (
      member_type = 'review'
      AND review_id IS NOT NULL
      AND referral_link_id IS NULL
    )
    OR (
      member_type = 'referral_link'
      AND review_id IS NULL
      AND referral_link_id IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_user_landing_page_group_members__item_sort
ON user_landing_page_group_members (landing_page_item_id, sort_order, id);

COMMENT ON TABLE user_landing_page_group_members IS 'Members within a topic_group landing page item; each member is a review or referral link.';
COMMENT ON COLUMN user_landing_page_group_members.landing_page_item_id IS 'The topic_group item this member belongs to.';
COMMENT ON COLUMN user_landing_page_group_members.member_type IS 'The type of group member: review or referral_link.';
COMMENT ON COLUMN user_landing_page_group_members.sort_order IS 'Display order within the group.';
COMMENT ON COLUMN user_landing_page_group_members.review_id IS 'Reference to a review post; set when member_type is review.';
COMMENT ON COLUMN user_landing_page_group_members.referral_link_id IS 'Reference to user_referral_program_links; set when member_type is referral_link.';

CREATE OR REPLACE FUNCTION fn_validate_user_landing_page_group_member_item_type()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM user_landing_page_items
    WHERE id = NEW.landing_page_item_id
      AND item_type = 'topic_group'
  ) THEN
    RAISE EXCEPTION 'landing_page_item_id must reference a topic_group item';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER trigger_validate_user_landing_page_group_member_item_type
AFTER INSERT OR UPDATE ON user_landing_page_group_members
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION fn_validate_user_landing_page_group_member_item_type();

CREATE OR REPLACE TRIGGER trigger_user_landing_page_group_members_updated_at
BEFORE UPDATE ON user_landing_page_group_members
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();
