-- Election relations are config-driven; install their current projection hooks after their creators.
CREATE OR REPLACE FUNCTION fn_project_rss_feed_topic_relation_candidates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_update_rss_feed_item_topic_candidate_memberships(
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.subject_id END,
    CASE WHEN TG_OP <> 'INSERT' AND OLD.deleted_at IS NULL AND OLD.votes_score_net > 0 THEN OLD.object_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.subject_id END,
    CASE WHEN TG_OP <> 'DELETE' AND NEW.deleted_at IS NULL AND NEW.votes_score_net > 0 THEN NEW.object_id END);
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER trigger_rss_feed_topic_relation_candidates
  AFTER INSERT OR UPDATE OR DELETE ON relation__rss_feed_item__category__topic
  FOR EACH ROW EXECUTE FUNCTION fn_project_rss_feed_topic_relation_candidates();

CREATE OR REPLACE FUNCTION fn_project_rss_feed_topic_alias_relation_candidates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND (TG_OP = 'DELETE' OR OLD.subject_id IS DISTINCT FROM NEW.subject_id
      OR OLD.object_id IS DISTINCT FROM NEW.object_id OR NEW.deleted_at IS NOT NULL OR NEW.votes_score_net <= 0) THEN
    DELETE FROM rss_feed_item_topic_alias_candidates
      WHERE rss_feed_item_id = OLD.subject_id AND topic_alias_id = OLD.object_id;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.deleted_at IS NULL AND NEW.votes_score_net > 0 THEN
    INSERT INTO rss_feed_item_topic_alias_candidates (rss_feed_item_id, topic_alias_id, topic_id)
    SELECT NEW.subject_id, alias.id, alias.topic_id FROM topic_aliases alias
      WHERE alias.id = NEW.object_id
    ON CONFLICT (topic_alias_id, rss_feed_item_id) DO UPDATE SET topic_id = EXCLUDED.topic_id
      WHERE rss_feed_item_topic_alias_candidates.topic_id IS DISTINCT FROM EXCLUDED.topic_id;
  END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER trigger_rss_feed_topic_alias_relation_candidates
  AFTER INSERT OR UPDATE OR DELETE ON relation__rss_feed_item__category__topic_alias
  FOR EACH ROW EXECUTE FUNCTION fn_project_rss_feed_topic_alias_relation_candidates();
