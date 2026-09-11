CREATE OR REPLACE FUNCTION fn_review_succession_topic_ids_are_sorted_distinct(topic_ids UUID[])
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
STRICT
AS $$
  SELECT cardinality(topic_ids) > 0
    AND array_position(topic_ids, NULL::uuid) IS NULL
    AND topic_ids = ARRAY(
      SELECT DISTINCT topic_id
      FROM unnest(topic_ids) AS input(topic_id)
      ORDER BY topic_id
    );
$$;

CREATE TABLE IF NOT EXISTS review_successions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  predecessor_post_id UUID NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  successor_post_id UUID NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  topic_ids UUID[] NOT NULL CHECK (fn_review_succession_topic_ids_are_sorted_distinct(topic_ids)),
  predecessor_archived_at TIMESTAMPTZ NOT NULL,
  automatically_restored_at TIMESTAMPTZ,
  manual_override_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT review_successions_predecessor_before_successor
    CHECK (predecessor_post_id < successor_post_id),
  CONSTRAINT review_successions_terminal_lifecycle
    CHECK (num_nonnulls(automatically_restored_at, manual_override_at) <= 1),
  CONSTRAINT review_successions_terminal_after_archive
    CHECK (
      (automatically_restored_at IS NULL OR automatically_restored_at >= predecessor_archived_at)
      AND (manual_override_at IS NULL OR manual_override_at >= predecessor_archived_at)
    ),
  CONSTRAINT uq_review_successions__predecessor_archive_epoch
    UNIQUE (predecessor_post_id, predecessor_archived_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_review_successions__active_predecessor
ON review_successions (predecessor_post_id)
WHERE automatically_restored_at IS NULL AND manual_override_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_review_successions__successor_post_id
ON review_successions (successor_post_id);

CREATE INDEX IF NOT EXISTS idx_review_successions__active_successor_post_id
ON review_successions (successor_post_id)
WHERE automatically_restored_at IS NULL AND manual_override_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_review_successions__author_user_id__topic_ids
ON review_successions (author_user_id, topic_ids);

CREATE OR REPLACE FUNCTION fn_guard_review_succession_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW.id,
    NEW.predecessor_post_id,
    NEW.successor_post_id,
    NEW.author_user_id,
    NEW.topic_ids,
    NEW.predecessor_archived_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.predecessor_post_id,
    OLD.successor_post_id,
    OLD.author_user_id,
    OLD.topic_ids,
    OLD.predecessor_archived_at
  ) THEN
    RAISE EXCEPTION 'review succession identity and archive epoch are immutable';
  END IF;

  IF OLD.automatically_restored_at IS NULL
    AND OLD.manual_override_at IS NULL
    AND (
      (NEW.automatically_restored_at IS NOT NULL AND NEW.manual_override_at IS NULL)
      OR (NEW.automatically_restored_at IS NULL AND NEW.manual_override_at IS NOT NULL)
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'review succession only allows one terminal lifecycle transition';
END;
$$;

CREATE OR REPLACE TRIGGER trigger_review_successions_guard
BEFORE UPDATE ON review_successions
FOR EACH ROW EXECUTE FUNCTION fn_guard_review_succession_mutation();

CREATE TRIGGER trigger_review_successions_updated_at
BEFORE UPDATE ON review_successions
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE review_successions IS 'Immutable automatic review-archive epochs. An active row is the sole authority to restore its archived predecessor; terminal rows preserve manual or automatic disposition.';
COMMENT ON COLUMN review_successions.predecessor_post_id IS 'Older exact-topic review archived by this automatic succession epoch.';
COMMENT ON COLUMN review_successions.successor_post_id IS 'Newer review that was public when this archive epoch was created; immutable historical evidence, not a current routing pointer.';
COMMENT ON COLUMN review_successions.author_user_id IS 'Shared non-null author snapshot for the predecessor and successor reviews.';
COMMENT ON COLUMN review_successions.topic_ids IS 'Ascending, distinct exact topic-set snapshot at automatic archive time.';
COMMENT ON COLUMN review_successions.predecessor_archived_at IS 'Exact posts.archived_at value written by this automatic archive epoch.';
COMMENT ON COLUMN review_successions.automatically_restored_at IS 'Terminal timestamp when reconciliation restored the predecessor.';
COMMENT ON COLUMN review_successions.manual_override_at IS 'Terminal timestamp when a manual archive or unarchive revoked automatic restoration authority.';
