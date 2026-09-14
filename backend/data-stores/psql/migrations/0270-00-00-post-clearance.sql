-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- Merged from: 0400-00-00-post-clearance-history.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'post_clearance_change_types') THEN
    CREATE TYPE post_clearance_change_types AS ENUM (
      'approve',
      'reject',
      'mark_in_review',
      'reset_to_pending'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS post_clearance_changes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  post_id UUID NOT NULL REFERENCES posts ON DELETE CASCADE,
  change_type post_clearance_change_types NOT NULL,
  changed_by_id UUID,
  public_reason_code TEXT CHECK (
    public_reason_code IS NULL OR char_length(public_reason_code) BETWEEN 1 AND 100
  ),
  private_note TEXT CHECK (private_note IS NULL OR char_length(private_note) <= 4000),
  platform_override BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  moderation_transparency_categories TEXT[] NOT NULL DEFAULT '{}',
  moderation_transparency_community_id UUID,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (NOT platform_override OR (changed_by_id IS NOT NULL AND public_reason_code IS NOT NULL)),
  CHECK (private_note IS NULL OR platform_override),
  CHECK (moderation_transparency_categories IN (
    '{}', '{openai_omni}', '{spam_detection}', '{post_clearance_reject}',
    '{openai_omni,spam_detection}'
  ))
  -- no updated_at or deleted_at: append-only
) PARTITION BY RANGE (id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_posts__single_clearance_state'
  ) THEN
    ALTER TABLE posts
      ADD CONSTRAINT chk_posts__single_clearance_state CHECK (
        num_nonnulls(approved_at, rejected_at, in_review_at) <= 1
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'posts_latest_clearance_change_id_fkey'
  ) THEN
    ALTER TABLE posts
      ADD CONSTRAINT posts_latest_clearance_change_id_fkey
      FOREIGN KEY (latest_clearance_change_id)
      REFERENCES post_clearance_changes(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- RI-usable index for the latest_clearance_change_id FK
CREATE INDEX IF NOT EXISTS idx_posts__latest_clearance_change_id
ON posts (latest_clearance_change_id) WHERE latest_clearance_change_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_post_clearance_changes__post_id__id
ON post_clearance_changes (post_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_posts__approved
ON posts (id DESC)
WHERE approved_at IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_posts__clearance_review_queue
ON posts (id DESC)
WHERE deleted_at IS NULL AND (rejected_at IS NOT NULL OR in_review_at IS NOT NULL);

COMMENT ON TABLE post_clearance_changes IS 'Append-only audit log of post clearance transitions.';
COMMENT ON COLUMN post_clearance_changes.post_id IS 'The post whose clearance state changed.';
COMMENT ON COLUMN post_clearance_changes.change_type IS 'Type of clearance transition.';
COMMENT ON COLUMN post_clearance_changes.changed_by_id IS 'User or admin who initiated the change (no FK for audit persistence).';
COMMENT ON COLUMN post_clearance_changes.public_reason_code IS 'Stable provider-neutral reason safe to expose to the affected author.';
COMMENT ON COLUMN post_clearance_changes.private_note IS 'Private staff note; never returned in public or author post contracts.';
COMMENT ON COLUMN post_clearance_changes.platform_override IS 'True when platform moderation staff intentionally overrode automated or community state.';
COMMENT ON COLUMN post_clearance_changes.metadata IS 'Structured metadata about the clearance transition.';
COMMENT ON COLUMN post_clearance_changes.moderation_transparency_categories IS 'Immutable automated-source categories stamped at rejection time for aggregate-only moderation transparency.';
COMMENT ON COLUMN post_clearance_changes.moderation_transparency_community_id IS 'Immutable community scope stamped from the post for global-transparency exclusion.';
