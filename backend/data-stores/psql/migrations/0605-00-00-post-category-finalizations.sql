-- Coalesced post-commit category-vote finalization. The post mutation transaction persists the
-- contributing actors and category-vote owner before it tries direct finalization, so recovery can
-- replay a missed post-commit action without omitting an earlier editor's active alias relation.
CREATE TABLE IF NOT EXISTS post_category_finalizations (
  post_id UUID PRIMARY KEY REFERENCES posts ON DELETE CASCADE,
  topic_category_owner_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  generation BIGINT NOT NULL DEFAULT 1 CHECK (generation > 0),
  admission_response_generation BIGINT,
  CONSTRAINT post_category_finalizations_admission_response_generation_check CHECK (
    admission_response_generation IS NULL OR admission_response_generation > 0
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_post_category_finalizations__updated_at
ON post_category_finalizations (updated_at, post_id);

CREATE INDEX IF NOT EXISTS idx_post_category_finalizations__topic_category_owner_id
ON post_category_finalizations (topic_category_owner_id);

COMMENT ON TABLE post_category_finalizations IS 'One coalesced durable category-vote finalization per post; retained actor rows and exact-generation acknowledgement prevent stale workers from omitting or deleting later edits.';
COMMENT ON COLUMN post_category_finalizations.post_id IS 'The post whose persisted category relations require vote finalization.';
COMMENT ON COLUMN post_category_finalizations.topic_category_owner_id IS 'The post owner whose explicit and data-point topic votes must be finalized.';
COMMENT ON COLUMN post_category_finalizations.generation IS 'Monotonic per-post fence while the finalization row remains retained; the worker reloads recreated rows after acquiring the post lock.';
COMMENT ON COLUMN post_category_finalizations.admission_response_generation IS 'Exact category-finalization generation whose create response may be repaired. NULL means an update with no topic snapshot; a non-null value with zero topic children is an explicit empty create snapshot.';

CREATE TABLE IF NOT EXISTS post_category_finalization_actors (
  post_id UUID NOT NULL REFERENCES post_category_finalizations (post_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_category_finalization_actors__user_id
  ON post_category_finalization_actors (user_id);

CREATE OR REPLACE TRIGGER trigger_post_category_finalization_actors_updated_at
BEFORE UPDATE ON post_category_finalization_actors
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE post_category_finalization_actors IS 'Finalization-owned editors whose hashtag relation votes must be finalized. user_id is a retained identity and does not authorize a deleted user.';
COMMENT ON COLUMN post_category_finalization_actors.post_id IS 'Finalization row these editors belong to. Deleting the finalization removes the actor set.';
COMMENT ON COLUMN post_category_finalization_actors.user_id IS 'Retained user identity of an editor included in this finalization.';

CREATE TABLE IF NOT EXISTS post_category_finalization_admission_topics (
  post_id UUID NOT NULL REFERENCES post_category_finalizations (post_id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES retained_topic_identities (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_post_category_finalization_admission_topics__topic_id
  ON post_category_finalization_admission_topics (topic_id);

CREATE OR REPLACE TRIGGER trigger_post_category_finalization_admission_topics_updated_at
BEFORE UPDATE ON post_category_finalization_admission_topics
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE post_category_finalization_admission_topics IS 'Create-time explicit and data-point topic snapshot for admission-response repair. Zero rows with a non-null admission_response_generation is an explicit empty snapshot.';
COMMENT ON COLUMN post_category_finalization_admission_topics.post_id IS 'Finalization whose create-time topic snapshot these rows belong to.';
COMMENT ON COLUMN post_category_finalization_admission_topics.topic_id IS 'Retained topic identity captured at create time. It does not authorize a deleted topic.';

CREATE OR REPLACE FUNCTION fn_post_category_finalization_actor_ids(target_post_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(ARRAY_AGG(actor.user_id ORDER BY actor.user_id), '{}'::uuid[])
  FROM post_category_finalization_actors actor
  WHERE actor.post_id = target_post_id;
$$;

CREATE OR REPLACE FUNCTION fn_assert_post_category_finalization_children()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_post_id UUID;
  actor_count INTEGER;
  topic_count INTEGER;
  response_generation BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_post_id := OLD.post_id;
  ELSE
    target_post_id := NEW.post_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM post_category_finalizations WHERE post_id = target_post_id
  ) THEN
    RETURN NULL;
  END IF;
  SELECT admission_response_generation INTO response_generation
  FROM post_category_finalizations WHERE post_id = target_post_id;
  SELECT COUNT(*) INTO actor_count
  FROM post_category_finalization_actors WHERE post_id = target_post_id;
  SELECT COUNT(*) INTO topic_count
  FROM post_category_finalization_admission_topics WHERE post_id = target_post_id;
  IF actor_count < 1 THEN
    RAISE EXCEPTION 'post category finalization requires at least one actor'
      USING ERRCODE = 'check_violation';
  END IF;
  IF response_generation IS NULL AND topic_count <> 0 THEN
    RAISE EXCEPTION 'absent admission response cannot retain topic snapshots'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trigger_post_category_finalizations_children
AFTER INSERT OR UPDATE OR DELETE ON post_category_finalizations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_assert_post_category_finalization_children();

CREATE CONSTRAINT TRIGGER trigger_post_category_finalization_actors_children
AFTER INSERT OR UPDATE OR DELETE ON post_category_finalization_actors
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_assert_post_category_finalization_children();

CREATE CONSTRAINT TRIGGER trigger_post_category_finalization_admission_topics_children
AFTER INSERT OR UPDATE OR DELETE ON post_category_finalization_admission_topics
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_assert_post_category_finalization_children();
