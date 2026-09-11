-- Coalesced post-commit category-vote finalization. The post mutation transaction persists the
-- contributing actors and category-vote owner before it tries direct finalization, so recovery can
-- replay a missed post-commit action without omitting an earlier editor's active alias relation.
CREATE TABLE IF NOT EXISTS post_category_finalizations (
  post_id UUID PRIMARY KEY REFERENCES posts ON DELETE CASCADE,
  actor_user_ids UUID[] NOT NULL CHECK (cardinality(actor_user_ids) > 0),
  topic_category_owner_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  generation BIGINT NOT NULL DEFAULT 1 CHECK (generation > 0),
  admission_response_generation BIGINT,
  admission_response_topic_ids UUID[],
  CONSTRAINT post_category_finalizations_admission_response_check CHECK (
    (admission_response_generation IS NULL AND admission_response_topic_ids IS NULL)
    OR (
      admission_response_generation IS NOT NULL
      AND admission_response_generation > 0
      AND admission_response_topic_ids IS NOT NULL
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_post_category_finalizations__updated_at
ON post_category_finalizations (updated_at, post_id);

CREATE INDEX IF NOT EXISTS idx_post_category_finalizations__topic_category_owner_id
ON post_category_finalizations (topic_category_owner_id);

COMMENT ON TABLE post_category_finalizations IS 'One coalesced durable category-vote finalization per post; retained actor set and exact-generation acknowledgement prevent stale workers from omitting or deleting later edits.';
COMMENT ON COLUMN post_category_finalizations.post_id IS 'The post whose persisted category relations require vote finalization.';
COMMENT ON COLUMN post_category_finalizations.actor_user_ids IS 'The deduplicated editors whose hashtag relation votes must be finalized.';
COMMENT ON COLUMN post_category_finalizations.topic_category_owner_id IS 'The post owner whose explicit and data-point topic votes must be finalized.';
COMMENT ON COLUMN post_category_finalizations.generation IS 'Monotonic per-post fence while the finalization row remains retained; the worker reloads recreated rows after acquiring the post lock.';
COMMENT ON COLUMN post_category_finalizations.admission_response_generation IS 'Exact category-finalization generation whose create response may be repaired; NULL or a mismatch means no repair remains.';
COMMENT ON COLUMN post_category_finalizations.admission_response_topic_ids IS 'Create-time explicit and data-point topic IDs for admission-response repair; NULL means update, while an empty array is a valid create snapshot.';
