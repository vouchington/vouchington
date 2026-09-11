CREATE OR REPLACE FUNCTION repair_post_category_finalization_admission_response_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  finalized_topics JSONB;
BEGIN
  -- A posts cascade has no replayable post response to repair. Every ordinary acknowledgement
  -- reaches the update below.
  IF NOT EXISTS (SELECT 1 FROM posts WHERE id = OLD.post_id) THEN
    RETURN OLD;
  END IF;

  SELECT COALESCE(
    jsonb_agg(TO_JSONB(topic.*) ORDER BY selected.votes_score_net DESC, selected.object_id),
    '[]'::jsonb
  )
  INTO finalized_topics
  FROM (
    SELECT relation.object_id, relation.votes_score_net
    FROM relation__post__category__topic relation
    WHERE relation.subject_id = OLD.post_id
      AND OLD.admission_response_generation = OLD.generation
      AND relation.object_id = ANY(OLD.admission_response_topic_ids)
      AND relation.deleted_at IS NULL
      AND relation.votes_score_net > 0
    ORDER BY relation.votes_score_net DESC, relation.object_id
    LIMIT 5
  ) selected
  INNER JOIN view_embedded_topics topic ON topic.id = selected.object_id;

  UPDATE post_admission_reservations
  SET response = CASE
        WHEN OLD.admission_response_generation = OLD.generation
          AND OLD.admission_response_topic_ids IS NOT NULL
        THEN CASE
          WHEN jsonb_typeof(response) = 'object'
            AND jsonb_typeof(response->'post') = 'object'
          THEN jsonb_set(response, '{post,post_related_topics}', finalized_topics)
          WHEN jsonb_typeof(response) = 'object'
          THEN jsonb_set(response, '{post_related_topics}', finalized_topics)
          ELSE response
        END
        ELSE response
      END,
      replay_metadata = replay_metadata || '{"finalization":"complete"}'::jsonb,
      updated_at = NOW()
  WHERE committed_post_id = OLD.post_id
    AND state = 'committed'
    AND retention_expires_at > NOW();

  RETURN OLD;
END;
$$;

CREATE OR REPLACE TRIGGER post_category_finalizations_repair_admission_response_on_delete
BEFORE DELETE ON post_category_finalizations
FOR EACH ROW
EXECUTE FUNCTION repair_post_category_finalization_admission_response_on_delete();

COMMENT ON FUNCTION repair_post_category_finalization_admission_response_on_delete() IS 'Repairs retained create responses atomically with every exact-generation acknowledgement.';
