-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
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
  slot SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 20),
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
  CONSTRAINT uq_user_landing_pages__user_id_slot UNIQUE (user_id, slot),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_landing_pages__user_id_default
ON user_landing_pages (user_id)
WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_user_landing_pages__user_id_id
ON user_landing_pages (user_id, id);

CREATE OR REPLACE TRIGGER trigger_user_landing_pages_owner_immutable
BEFORE UPDATE OF user_id ON user_landing_pages
FOR EACH ROW WHEN (NEW.user_id IS DISTINCT FROM OLD.user_id)
EXECUTE FUNCTION fn_reject_always('Landing page ownership cannot change');

CREATE OR REPLACE TRIGGER trigger_user_landing_pages_updated_at
BEFORE UPDATE ON user_landing_pages
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE user_landing_pages IS 'User-created landing pages for organizing and displaying their links, reviews, and referral links.';
COMMENT ON COLUMN user_landing_pages.user_id IS 'The user who owns this landing page.';
COMMENT ON COLUMN user_landing_pages.slot IS 'One of twenty reusable per-owner positions that enforce the page limit through a unique key.';
COMMENT ON COLUMN user_landing_pages.title IS 'Display title for the landing page.';
COMMENT ON COLUMN user_landing_pages.subtitle IS 'Optional subtitle or description.';
COMMENT ON COLUMN user_landing_pages.slug IS 'URL-safe slug unique per user for the landing page URL.';
COMMENT ON COLUMN user_landing_pages.is_default IS 'Explicit default preference, at most one per user. If none is marked, readers use the oldest remaining page.';

--------------------------------------------------------------------------------
-- user_landing_page_items
--------------------------------------------------------------------------------

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS user_landing_page_items (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  landing_page_id UUID NOT NULL REFERENCES user_landing_pages(id) ON DELETE CASCADE,
  item_type user_landing_page_item_types NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT uq_user_landing_page_items__landing_page_id_sort_order UNIQUE (landing_page_id, sort_order),
  profile_link_id UUID REFERENCES user_profile_links(id) ON DELETE CASCADE,
  review_post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  referral_link_id UUID REFERENCES user_referral_program_links(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  link_label TEXT,
  CHECK (link_label IS NULL OR char_length(link_label) <= 100),
  CHECK (link_label IS NULL OR link_label = TRIM(link_label)),
  url_id UUID REFERENCES urls(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (
      item_type = 'profile_link'
      AND profile_link_id IS NOT NULL
      AND review_post_id IS NULL
      AND referral_link_id IS NULL
      AND topic_id IS NULL
      AND link_label IS NULL
      AND url_id IS NULL
    )
    OR (
      item_type = 'review'
      AND profile_link_id IS NULL
      AND review_post_id IS NOT NULL
      AND referral_link_id IS NULL
      AND topic_id IS NULL
      AND link_label IS NULL
      AND url_id IS NULL
    )
    OR (
      item_type = 'referral_link'
      AND profile_link_id IS NULL
      AND review_post_id IS NULL
      AND referral_link_id IS NOT NULL
      AND topic_id IS NULL
      AND link_label IS NULL
      AND url_id IS NULL
    )
    OR (
      item_type = 'topic_group'
      AND profile_link_id IS NULL
      AND review_post_id IS NULL
      AND referral_link_id IS NULL
      AND topic_id IS NOT NULL
      AND link_label IS NULL
      AND url_id IS NULL
    )
    OR (
      item_type = 'link'
      AND profile_link_id IS NULL
      AND review_post_id IS NULL
      AND referral_link_id IS NULL
      AND topic_id IS NULL
      AND link_label IS NOT NULL
      AND char_length(link_label) >= 1
      AND url_id IS NOT NULL
    )
  )
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_user_landing_page_items__url_id ON user_landing_page_items (url_id);

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
COMMENT ON COLUMN user_landing_page_items.review_post_id IS 'Reference to a review post; set when item_type is review.';
COMMENT ON COLUMN user_landing_page_items.referral_link_id IS 'Reference to user_referral_program_links; set when item_type is referral_link.';
COMMENT ON COLUMN user_landing_page_items.topic_id IS 'Reference to a topic for grouping; set when item_type is topic_group.';
COMMENT ON COLUMN user_landing_page_items.link_label IS 'Display label for a free-form link; set when item_type is link.';
COMMENT ON COLUMN user_landing_page_items.url_id IS 'Normalized URL relation for a free-form link; set when item_type is link.';

--------------------------------------------------------------------------------
-- user_landing_page_group_members
--------------------------------------------------------------------------------

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS user_landing_page_group_members (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  landing_page_item_id UUID NOT NULL REFERENCES user_landing_page_items(id) ON DELETE CASCADE,
  member_type user_landing_page_group_member_types NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  review_post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  referral_link_id UUID REFERENCES user_referral_program_links(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (
      member_type = 'review'
      AND review_post_id IS NOT NULL
      AND referral_link_id IS NULL
    )
    OR (
      member_type = 'referral_link'
      AND review_post_id IS NULL
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
COMMENT ON COLUMN user_landing_page_group_members.review_post_id IS 'Reference to a review post; set when member_type is review.';
COMMENT ON COLUMN user_landing_page_group_members.referral_link_id IS 'Reference to user_referral_program_links; set when member_type is referral_link.';

CREATE OR REPLACE FUNCTION fn_reject_user_landing_page_group_member_item_type()
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
EXECUTE FUNCTION fn_reject_user_landing_page_group_member_item_type();

CREATE OR REPLACE TRIGGER trigger_user_landing_page_group_members_updated_at
BEFORE UPDATE ON user_landing_page_group_members
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- Current indexes for fresh schema bootstrap.
CREATE INDEX IF NOT EXISTS idx_user_landing_page_group_members__referral_link_id
  ON user_landing_page_group_members (referral_link_id)
  WHERE referral_link_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_user_landing_page_group_members__review_id
  ON user_landing_page_group_members (review_post_id)
  WHERE review_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_landing_page_items__profile_link_id
  ON user_landing_page_items (profile_link_id)
  WHERE profile_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_landing_page_items__referral_link_id
  ON user_landing_page_items (referral_link_id)
  WHERE referral_link_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_user_landing_page_items__review_id
  ON user_landing_page_items (review_post_id)
  WHERE review_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_landing_page_items__topic_id
  ON user_landing_page_items (topic_id)
  WHERE topic_id IS NOT NULL;

--------------------------------------------------------------------------------
-- user_landing_page_candidates
--------------------------------------------------------------------------------

-- A single ordered relation for the three source types offered to a page owner.
CREATE TABLE IF NOT EXISTS user_landing_page_candidates (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  user_id UUID NOT NULL,
  profile_link_id UUID,
  review_post_id UUID,
  referral_link_id UUID,
  tier SMALLINT NOT NULL,
  sort_order INTEGER,
  tier_sort SMALLINT GENERATED ALWAYS AS (-tier) STORED,
  position_sort INTEGER GENERATED ALWAYS AS (COALESCE(sort_order, 0)) STORED,
  source_sort_key BYTEA GENERATED ALWAYS AS (
    CASE WHEN profile_link_id IS NOT NULL THEN uuid_send(profile_link_id)
      ELSE decode(translate(encode(uuid_send(COALESCE(review_post_id, referral_link_id)), 'hex'),
        '0123456789abcdef', 'fedcba9876543210'), 'hex') END
  ) STORED,
  CHECK (
    (tier = 2 AND profile_link_id IS NOT NULL AND review_post_id IS NULL AND referral_link_id IS NULL AND sort_order IS NOT NULL)
    OR (tier = 1 AND profile_link_id IS NULL AND review_post_id IS NOT NULL AND referral_link_id IS NULL AND sort_order IS NULL)
    OR (tier = 0 AND profile_link_id IS NULL AND review_post_id IS NULL AND referral_link_id IS NOT NULL AND sort_order IS NULL)
  )
);

ALTER TABLE user_landing_page_candidates ADD CONSTRAINT fk_user_landing_page_candidates__user_id
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE user_landing_page_candidates VALIDATE CONSTRAINT fk_user_landing_page_candidates__user_id;
ALTER TABLE user_landing_page_candidates ADD CONSTRAINT fk_user_landing_page_candidates__profile_link_id
  FOREIGN KEY (profile_link_id) REFERENCES user_profile_links(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE user_landing_page_candidates VALIDATE CONSTRAINT fk_user_landing_page_candidates__profile_link_id;
ALTER TABLE user_landing_page_candidates ADD CONSTRAINT fk_user_landing_page_candidates__review_post_id
  FOREIGN KEY (review_post_id) REFERENCES posts(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE user_landing_page_candidates VALIDATE CONSTRAINT fk_user_landing_page_candidates__review_post_id;
ALTER TABLE user_landing_page_candidates ADD CONSTRAINT fk_user_landing_page_candidates__referral_link_id
  FOREIGN KEY (referral_link_id) REFERENCES user_referral_program_links(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE user_landing_page_candidates VALIDATE CONSTRAINT fk_user_landing_page_candidates__referral_link_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_landing_page_candidates__profile_link_id
ON user_landing_page_candidates (profile_link_id) WHERE profile_link_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_landing_page_candidates__review_post_id
ON user_landing_page_candidates (review_post_id) WHERE review_post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_landing_page_candidates__referral_link_id
ON user_landing_page_candidates (referral_link_id) WHERE referral_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_landing_page_candidates__user_order
ON user_landing_page_candidates (user_id, tier_sort, position_sort, source_sort_key);

COMMENT ON TABLE user_landing_page_candidates IS 'Owner-ordered projection of potential landing page items; source eligibility remains on source rows.';
COMMENT ON COLUMN user_landing_page_candidates.id IS 'Identity of the candidate projection row.';
COMMENT ON COLUMN user_landing_page_candidates.user_id IS 'Owner whose landing page may include the source.';
COMMENT ON COLUMN user_landing_page_candidates.profile_link_id IS 'Profile link source for tier 2.';
COMMENT ON COLUMN user_landing_page_candidates.review_post_id IS 'Review post source for tier 1.';
COMMENT ON COLUMN user_landing_page_candidates.referral_link_id IS 'Referral link source for tier 0.';
COMMENT ON COLUMN user_landing_page_candidates.tier IS 'Candidate type ordering: profile link 2, review 1, referral link 0.';
COMMENT ON COLUMN user_landing_page_candidates.sort_order IS 'Profile link ordering within its tier; null for other source types.';
COMMENT ON COLUMN user_landing_page_candidates.tier_sort IS 'Negated tier for ascending index order.';
COMMENT ON COLUMN user_landing_page_candidates.position_sort IS 'Profile link order or zero for sources ordered by descending id.';
COMMENT ON COLUMN user_landing_page_candidates.source_sort_key IS 'Source UUID bytes in ascending profile order or complemented for descending review and referral order.';

CREATE OR REPLACE FUNCTION fn_project_user_landing_page_candidate_profile_link()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_landing_page_candidates (user_id, profile_link_id, tier, sort_order)
  VALUES (NEW.user_id, NEW.id, 2, NEW.sort_order)
  ON CONFLICT (profile_link_id) WHERE profile_link_id IS NOT NULL DO UPDATE
    SET user_id = EXCLUDED.user_id, sort_order = EXCLUDED.sort_order
    WHERE (user_landing_page_candidates.user_id, user_landing_page_candidates.sort_order)
      IS DISTINCT FROM (EXCLUDED.user_id, EXCLUDED.sort_order);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_user_profile_links_landing_page_candidate
AFTER INSERT OR UPDATE OF user_id, sort_order ON user_profile_links
FOR EACH ROW EXECUTE FUNCTION fn_project_user_landing_page_candidate_profile_link();

CREATE OR REPLACE FUNCTION fn_project_user_landing_page_candidate_review_post()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.post_type = 'review' AND NEW.created_by_id IS NOT NULL THEN
    INSERT INTO user_landing_page_candidates (user_id, review_post_id, tier)
    VALUES (NEW.created_by_id, NEW.id, 1)
    ON CONFLICT (review_post_id) WHERE review_post_id IS NOT NULL DO UPDATE SET user_id = EXCLUDED.user_id
      WHERE user_landing_page_candidates.user_id IS DISTINCT FROM EXCLUDED.user_id;
  ELSE
    DELETE FROM user_landing_page_candidates WHERE review_post_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_posts_landing_page_candidate_insert
AFTER INSERT ON posts
FOR EACH ROW WHEN (NEW.post_type = 'review' AND NEW.created_by_id IS NOT NULL)
EXECUTE FUNCTION fn_project_user_landing_page_candidate_review_post();

CREATE OR REPLACE TRIGGER trigger_posts_landing_page_candidate_update
AFTER UPDATE OF post_type, created_by_id ON posts
FOR EACH ROW WHEN (OLD.post_type = 'review' OR NEW.post_type = 'review')
EXECUTE FUNCTION fn_project_user_landing_page_candidate_review_post();

CREATE OR REPLACE FUNCTION fn_project_user_landing_page_candidate_referral_link()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_landing_page_candidates (user_id, referral_link_id, tier)
  VALUES (NEW.user_id, NEW.id, 0)
  ON CONFLICT (referral_link_id) WHERE referral_link_id IS NOT NULL
    DO UPDATE SET user_id = EXCLUDED.user_id
      WHERE user_landing_page_candidates.user_id IS DISTINCT FROM EXCLUDED.user_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_user_referral_program_links_landing_page_candidate
AFTER INSERT OR UPDATE OF user_id ON user_referral_program_links
FOR EACH ROW EXECUTE FUNCTION fn_project_user_landing_page_candidate_referral_link();
