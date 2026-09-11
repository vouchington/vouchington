CREATE OR REPLACE FUNCTION fn_deduplicate_user_import_topic_recommendation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.topic_recommendation_post_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'user-import-topic-recommendation:' || NEW.user_id::text || ':' || NEW.topic_recommendation_post_id::text,
    0
  ));
  IF EXISTS (
    SELECT 1
    FROM user_import_requests
    WHERE user_id = NEW.user_id
      AND topic_recommendation_post_id = NEW.topic_recommendation_post_id
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END $$;

-- CREATE TRIGGER takes SHARE ROW EXCLUSIVE until this migration commits. That deliberate
-- pre-launch write fence drains old writers before the duplicate cleanup and strict index build.
CREATE OR REPLACE TRIGGER user_import_requests_deduplicate_topic_recommendation
  BEFORE INSERT ON user_import_requests
  FOR EACH ROW
  EXECUTE FUNCTION fn_deduplicate_user_import_topic_recommendation();

WITH duplicate_topic_recommendation_requests AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, topic_recommendation_post_id
      ORDER BY id
    ) AS duplicate_number
  FROM user_import_requests
  WHERE topic_recommendation_post_id IS NOT NULL
)
DELETE FROM user_import_requests request
USING duplicate_topic_recommendation_requests duplicate
WHERE request.id = duplicate.id
  AND duplicate.duplicate_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_import_requests__user_topic_recommendation
ON user_import_requests (user_id, topic_recommendation_post_id)
WHERE topic_recommendation_post_id IS NOT NULL;

COMMENT ON FUNCTION fn_deduplicate_user_import_topic_recommendation() IS 'Keeps old unconstrained import writers compatible while the strict recommendation-audit uniqueness index is deployed.';
COMMENT ON INDEX idx_user_import_requests__user_topic_recommendation IS 'Makes one missing-topic audit durable per user and recommendation across exact import retries.';
