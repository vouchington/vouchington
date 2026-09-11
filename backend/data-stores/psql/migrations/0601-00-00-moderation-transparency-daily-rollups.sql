-- edited-in-place: pre-launch, never deployed to production
-- Persist only aggregate daily moderation-transparency cohorts.  This is the
-- privacy boundary for paid transparency: no user, post, prompt, or action id
-- is retained here.
CREATE TABLE moderation_transparency_daily_rollups (
  day date NOT NULL,
  -- No FK: a community hard-delete must not erase an eligible-but-unread
  -- aggregate before it can be promoted into the immutable release projection.
  community_id uuid,
  metric text NOT NULL CHECK (metric IN ('reports', 'moderation_actions', 'automated_moderation', 'appeals')),
  category text NOT NULL,
  count integer NOT NULL CHECK (count > 0),
  -- The maximum source timestamp is deliberately retained after decrements.
  -- A stale value can only delay a release; it can never release too early.
  latest_occurred_at timestamptz NOT NULL,
  CONSTRAINT moderation_transparency_daily_rollups_key
    UNIQUE NULLS NOT DISTINCT (day, community_id, metric, category)
);

CREATE INDEX moderation_transparency_daily_rollups__global_page
  ON moderation_transparency_daily_rollups (day DESC, latest_occurred_at)
  WHERE community_id IS NULL AND count >= 20;
CREATE INDEX moderation_transparency_daily_rollups__community_page
  ON moderation_transparency_daily_rollups (community_id, day DESC, latest_occurred_at)
  WHERE community_id IS NOT NULL AND count >= 20;
CREATE INDEX moderation_transparency_daily_rollups__community_fk
  ON moderation_transparency_daily_rollups (community_id)
  WHERE community_id IS NOT NULL;

COMMENT ON TABLE moderation_transparency_daily_rollups IS 'Aggregate-only daily moderation transparency cohorts; contains no source-row or actor identity.';
COMMENT ON COLUMN moderation_transparency_daily_rollups.day IS 'UTC day shared by every source event in this cohort.';
COMMENT ON COLUMN moderation_transparency_daily_rollups.community_id IS 'Community scope, or NULL for the global transparency projection.';
COMMENT ON COLUMN moderation_transparency_daily_rollups.metric IS 'Public transparency metric dimension.';
COMMENT ON COLUMN moderation_transparency_daily_rollups.category IS 'Public transparency category dimension.';
COMMENT ON COLUMN moderation_transparency_daily_rollups.count IS 'Exact private cohort count; API sanitization enforces thresholding and rounding.';
COMMENT ON COLUMN moderation_transparency_daily_rollups.latest_occurred_at IS 'Latest known source event time, used to enforce the 48-hour release delay.';

-- Once a qualifying daily cohort is released, retain only this aggregate snapshot.
-- It deliberately has no foreign keys: source, community, and actor deletion cannot
-- rewrite a published disclosure.
CREATE TABLE moderation_transparency_released_daily_rollups (
  day date NOT NULL,
  community_id uuid,
  metric text NOT NULL CHECK (metric IN ('reports', 'moderation_actions', 'automated_moderation', 'appeals')),
  category text NOT NULL,
  count integer NOT NULL CHECK (count >= 20),
  latest_occurred_at timestamptz NOT NULL,
  released_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT moderation_transparency_released_daily_rollups_key
    UNIQUE NULLS NOT DISTINCT (day, community_id, metric, category)
);
CREATE INDEX moderation_transparency_released_daily_rollups__global_page
  ON moderation_transparency_released_daily_rollups (day DESC)
  WHERE community_id IS NULL;
CREATE INDEX moderation_transparency_released_daily_rollups__community_page
  ON moderation_transparency_released_daily_rollups (community_id, day DESC)
  WHERE community_id IS NOT NULL;
COMMENT ON TABLE moderation_transparency_released_daily_rollups IS 'Immutable aggregate-only daily moderation transparency disclosures; no source or community foreign key is retained.';
COMMENT ON COLUMN moderation_transparency_released_daily_rollups.day IS 'UTC day of the permanently released aggregate cohort.';
COMMENT ON COLUMN moderation_transparency_released_daily_rollups.community_id IS 'Immutable community scope, or NULL for the global transparency projection.';
COMMENT ON COLUMN moderation_transparency_released_daily_rollups.metric IS 'Public transparency metric dimension fixed at release.';
COMMENT ON COLUMN moderation_transparency_released_daily_rollups.category IS 'Public transparency category dimension fixed at release.';
COMMENT ON COLUMN moderation_transparency_released_daily_rollups.count IS 'Exact released cohort count; API sanitization applies nearest-five rounding.';
COMMENT ON COLUMN moderation_transparency_released_daily_rollups.latest_occurred_at IS 'Latest source event timestamp observed when the cohort became immutable.';
COMMENT ON COLUMN moderation_transparency_released_daily_rollups.released_at IS 'Transaction timestamp when the aggregate cohort became immutable.';
CREATE FUNCTION fn_protect_released_moderation_transparency_rollup()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'released moderation transparency cohorts are immutable';
END $$;
CREATE TRIGGER moderation_transparency_released_rollup_guard
  BEFORE UPDATE OR DELETE ON moderation_transparency_released_daily_rollups
  FOR EACH ROW EXECUTE FUNCTION fn_protect_released_moderation_transparency_rollup();

-- This repository is pre-launch: the baseline migrations are edited in place
-- and clean bootstrap is the only supported migration path. Refuse a dirty
-- database rather than silently publishing an incomplete historical rollup.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM moderation_reports)
    OR EXISTS (SELECT 1 FROM moderator_actions)
    OR EXISTS (SELECT 1 FROM agent_moderations)
    OR EXISTS (SELECT 1 FROM post_clearance_changes)
    OR EXISTS (SELECT 1 FROM moderation_appeals) THEN
    RAISE EXCEPTION 'moderation transparency rollups require an empty pre-launch database; run db:clean before migrating';
  END IF;
END $$;

CREATE FUNCTION fn_apply_moderation_transparency_daily_rollup(
  p_occurred_at timestamptz, p_community_id uuid, p_metric text, p_category text, p_delta integer
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p_day date := (p_occurred_at AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_delta = 0 THEN RETURN; END IF;
  -- Source deletes can hold many FK/cascade row locks. Serialize them against
  -- positive ingestion before either path acquires cohort locks: otherwise two
  -- multi-cohort deletes can interleave their row and advisory lock order.
  IF p_delta < 0 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('moderation-transparency-rollup-write', 0));
  ELSE
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('moderation-transparency-rollup-write', 0));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'moderation-transparency-rollup:' || p_day::text || ':'
      || COALESCE(p_community_id::text, 'global') || ':' || p_metric || ':' || p_category,
    0
  ));
  IF EXISTS (
    SELECT 1 FROM moderation_transparency_released_daily_rollups
    WHERE day = p_day AND community_id IS NOT DISTINCT FROM p_community_id
      AND metric = p_metric AND category = p_category
  ) THEN RETURN; END IF;
  IF p_delta < 0 THEN
    PERFORM fn_release_moderation_transparency_daily_rollup(
      p_day, p_community_id, p_metric, p_category,
      date_trunc('day', clock_timestamp() - interval '48 hours') - interval '1 millisecond'
    );
  END IF;
  IF p_delta > 0 THEN
    INSERT INTO moderation_transparency_daily_rollups(day, community_id, metric, category, count, latest_occurred_at)
    VALUES (p_day, p_community_id, p_metric, p_category, p_delta, p_occurred_at)
    ON CONFLICT ON CONSTRAINT moderation_transparency_daily_rollups_key DO UPDATE
      SET count = moderation_transparency_daily_rollups.count + EXCLUDED.count,
          latest_occurred_at = GREATEST(moderation_transparency_daily_rollups.latest_occurred_at, EXCLUDED.latest_occurred_at);
  ELSE
    DELETE FROM moderation_transparency_daily_rollups
      WHERE day = p_day AND community_id IS NOT DISTINCT FROM p_community_id
        AND metric = p_metric AND category = p_category AND count <= -p_delta;
    UPDATE moderation_transparency_daily_rollups
      SET count = count + p_delta
      WHERE day = p_day AND community_id IS NOT DISTINCT FROM p_community_id
        AND metric = p_metric AND category = p_category;
  END IF;
END $$;

CREATE FUNCTION fn_release_moderation_transparency_daily_rollup(
  p_day date, p_community_id uuid, p_metric text, p_category text, p_cutoff timestamptz
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Share the same per-cohort lock as source-triggered increments and decrements.
  -- A release must snapshot and remove a candidate atomically with respect to a
  -- source lifecycle mutation, otherwise an old write could recreate it.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'moderation-transparency-rollup:' || p_day::text || ':'
      || COALESCE(p_community_id::text, 'global') || ':' || p_metric || ':' || p_category,
    0
  ));
  INSERT INTO moderation_transparency_released_daily_rollups(
    day, community_id, metric, category, count, latest_occurred_at
  )
  SELECT day, community_id, metric, category, count, latest_occurred_at
  FROM moderation_transparency_daily_rollups
  WHERE day = p_day AND community_id IS NOT DISTINCT FROM p_community_id
    AND metric = p_metric AND category = p_category
    AND count >= 20 AND latest_occurred_at <= p_cutoff
  ON CONFLICT ON CONSTRAINT moderation_transparency_released_daily_rollups_key DO NOTHING
  ;
  DELETE FROM moderation_transparency_daily_rollups
  WHERE day = p_day AND community_id IS NOT DISTINCT FROM p_community_id
    AND metric = p_metric AND category = p_category
    AND EXISTS (
      SELECT 1 FROM moderation_transparency_released_daily_rollups
      WHERE day = p_day AND community_id IS NOT DISTINCT FROM p_community_id
        AND metric = p_metric AND category = p_category
    );
END $$;

-- An all-time page needs one older released cohort to disclose that a next
-- page exists. Promote only that indexed predecessor; its page will promote
-- the rest when it is actually requested.
CREATE FUNCTION fn_release_next_moderation_transparency_daily_rollup(
  p_community_id uuid, p_before date, p_cutoff timestamptz
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE candidate record;
BEGIN
  IF p_community_id IS NULL THEN
    SELECT day, community_id, metric, category INTO candidate
    FROM moderation_transparency_daily_rollups
    WHERE community_id IS NULL AND day < p_before
      AND count >= 20 AND latest_occurred_at <= p_cutoff
    ORDER BY day DESC
    LIMIT 1;
  ELSE
    SELECT day, community_id, metric, category INTO candidate
    FROM moderation_transparency_daily_rollups
    WHERE community_id = p_community_id AND day < p_before
      AND count >= 20 AND latest_occurred_at <= p_cutoff
    ORDER BY day DESC
    LIMIT 1;
  END IF;
  IF FOUND THEN
    PERFORM fn_release_moderation_transparency_daily_rollup(
      candidate.day, candidate.community_id, candidate.metric, candidate.category, p_cutoff
    );
  END IF;
END $$;

CREATE FUNCTION fn_lock_moderation_transparency_projection(p_domain text, p_id uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT pg_advisory_xact_lock(hashtextextended(p_domain || ':' || p_id::text, 0))
$$;

CREATE FUNCTION fn_stamp_moderation_report_transparency_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.moderation_transparency_community_id IS NULL THEN
    SELECT community_id INTO NEW.moderation_transparency_community_id FROM posts WHERE id = NEW.post_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER moderation_transparency_reports_scope_stamp
  BEFORE INSERT ON moderation_reports FOR EACH ROW
  EXECUTE FUNCTION fn_stamp_moderation_report_transparency_scope();
CREATE FUNCTION fn_protect_moderation_transparency_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.moderation_transparency_community_id IS DISTINCT FROM NEW.moderation_transparency_community_id THEN
    RAISE EXCEPTION 'moderation transparency community scope is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER moderation_transparency_reports_scope_guard
  BEFORE UPDATE OF moderation_transparency_community_id ON moderation_reports
  FOR EACH ROW EXECUTE FUNCTION fn_protect_moderation_transparency_scope();
CREATE FUNCTION fn_protect_moderation_report_original_reason() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.original_reason IS DISTINCT FROM NEW.original_reason THEN
    RAISE EXCEPTION 'moderation report original reason is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER moderation_transparency_reports_original_reason_guard
  BEFORE UPDATE OF original_reason ON moderation_reports
  FOR EACH ROW EXECUTE FUNCTION fn_protect_moderation_report_original_reason();
CREATE FUNCTION fn_moderation_transparency_reports_delete_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cohort record;
BEGIN
  -- Transition tables preserve every immutable source classification while
  -- coalescing a cascade into one canonical decrement per cohort.
  FOR cohort IN
    SELECT (uuid_extract_timestamp(id) AT TIME ZONE 'UTC')::date AS day,
      NULL::uuid AS community_id, 'reports'::text AS metric,
      original_reason::text AS category, count(*)::integer AS count
    FROM deleted_reports
    WHERE moderation_transparency_community_id IS NULL
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2 NULLS FIRST, 3, 4
  LOOP
    PERFORM fn_apply_moderation_transparency_daily_rollup(
      cohort.day::timestamp AT TIME ZONE 'UTC', cohort.community_id,
      cohort.metric, cohort.category, -cohort.count
    );
  END LOOP;
  RETURN NULL;
END $$;
CREATE FUNCTION fn_moderation_transparency_reports_insert_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cohort record;
BEGIN
  FOR cohort IN
    SELECT (uuid_extract_timestamp(id) AT TIME ZONE 'UTC')::date AS day,
      NULL::uuid AS community_id, 'reports'::text AS metric,
      original_reason::text AS category, count(*)::integer AS count
    FROM new_reports
    WHERE moderation_transparency_community_id IS NULL
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2 NULLS FIRST, 3, 4
  LOOP
    PERFORM fn_apply_moderation_transparency_daily_rollup(
      cohort.day::timestamp AT TIME ZONE 'UTC', cohort.community_id,
      cohort.metric, cohort.category, cohort.count
    );
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER moderation_transparency_reports_rollup
  AFTER INSERT ON moderation_reports
  REFERENCING NEW TABLE AS new_reports
  FOR EACH STATEMENT EXECUTE FUNCTION fn_moderation_transparency_reports_insert_rollup();
CREATE TRIGGER moderation_transparency_reports_delete_rollup
  AFTER DELETE ON moderation_reports
  REFERENCING OLD TABLE AS deleted_reports
  FOR EACH STATEMENT EXECUTE FUNCTION fn_moderation_transparency_reports_delete_rollup();

CREATE FUNCTION fn_stamp_moderator_action_transparency_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.moderation_transparency_community_id := NEW.community_id;
  RETURN NEW;
END $$;
CREATE TRIGGER moderation_transparency_actions_scope_stamp
  BEFORE INSERT ON moderator_actions FOR EACH ROW
  EXECUTE FUNCTION fn_stamp_moderator_action_transparency_scope();
CREATE TRIGGER moderation_transparency_actions_scope_guard
  BEFORE UPDATE OF moderation_transparency_community_id ON moderator_actions
  FOR EACH ROW EXECUTE FUNCTION fn_protect_moderation_transparency_scope();
CREATE FUNCTION fn_protect_moderator_action_type() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.action_type IS DISTINCT FROM NEW.action_type THEN
    RAISE EXCEPTION 'moderator action type is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER moderation_transparency_actions_type_guard
  BEFORE UPDATE OF action_type ON moderator_actions
  FOR EACH ROW EXECUTE FUNCTION fn_protect_moderator_action_type();
CREATE FUNCTION fn_moderation_transparency_actions_delete_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cohort record;
BEGIN
  FOR cohort IN
    SELECT (uuid_extract_timestamp(id) AT TIME ZONE 'UTC')::date AS day,
      NULL::uuid AS community_id, 'moderation_actions'::text AS metric,
      action_type::text AS category, count(*)::integer AS count
    FROM deleted_actions
    WHERE moderation_transparency_community_id IS NULL
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2 NULLS FIRST, 3, 4
  LOOP
    PERFORM fn_apply_moderation_transparency_daily_rollup(
      cohort.day::timestamp AT TIME ZONE 'UTC', cohort.community_id,
      cohort.metric, cohort.category, -cohort.count
    );
  END LOOP;
  RETURN NULL;
END $$;
CREATE FUNCTION fn_moderation_transparency_actions_insert_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cohort record;
BEGIN
  FOR cohort IN
    SELECT (uuid_extract_timestamp(id) AT TIME ZONE 'UTC')::date AS day,
      NULL::uuid AS community_id, 'moderation_actions'::text AS metric,
      action_type::text AS category, count(*)::integer AS count
    FROM new_actions
    WHERE moderation_transparency_community_id IS NULL
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2 NULLS FIRST, 3, 4
  LOOP
    PERFORM fn_apply_moderation_transparency_daily_rollup(
      cohort.day::timestamp AT TIME ZONE 'UTC', cohort.community_id,
      cohort.metric, cohort.category, cohort.count
    );
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER moderation_transparency_actions_rollup
  AFTER INSERT ON moderator_actions
  REFERENCING NEW TABLE AS new_actions
  FOR EACH STATEMENT EXECUTE FUNCTION fn_moderation_transparency_actions_insert_rollup();
CREATE TRIGGER moderation_transparency_actions_delete_rollup
  AFTER DELETE ON moderator_actions
  REFERENCING OLD TABLE AS deleted_actions
  FOR EACH STATEMENT EXECUTE FUNCTION fn_moderation_transparency_actions_delete_rollup();

CREATE FUNCTION fn_stamp_agent_moderation_transparency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_community_id uuid; v_post_community_id uuid; v_current_community_id uuid; v_agent_deleted_at timestamptz; v_prompt_deleted_at timestamptz; v_cap_deleted_at timestamptz;
BEGIN
  -- Lock the FK parents before taking the projection locks. A concurrent hard
  -- delete already owns the parent row before its row trigger can take an
  -- advisory lock; reversing this order would form a parent-row/advisory-lock
  -- cycle with this INSERT.
  PERFORM 1 FROM agents WHERE id = NEW.agent_id FOR KEY SHARE;
  PERFORM 1 FROM agent_prompts WHERE id = NEW.prompt_id FOR KEY SHARE;
  -- Do not lock the post here: community deletion owns the community before
  -- cascading to posts, so a post-to-community lock would invert that order.
  -- Snapshot and revalidate instead; an unstable post scope is withheld.
  SELECT community_id INTO v_post_community_id FROM posts WHERE id = NEW.post_id;
  SELECT community_id, deleted_at INTO v_community_id, v_cap_deleted_at
  FROM community_agent_prompts WHERE id = NEW.prompt_id;
  IF v_community_id IS NOT NULL THEN
    PERFORM 1 FROM communities WHERE id = v_community_id FOR KEY SHARE;
    IF NOT FOUND THEN
      v_community_id := NULL;
      v_cap_deleted_at := NULL;
    END IF;
  END IF;
  SELECT community_id, deleted_at INTO v_current_community_id, v_cap_deleted_at
  FROM community_agent_prompts WHERE id = NEW.prompt_id FOR SHARE;
  IF v_current_community_id IS NULL THEN
    v_community_id := NULL;
    v_cap_deleted_at := NULL;
  ELSIF v_current_community_id IS DISTINCT FROM v_community_id THEN
    RAISE EXCEPTION 'community prompt changed during moderation projection' USING ERRCODE = '40001';
  END IF;
  IF (SELECT community_id FROM posts WHERE id = NEW.post_id)
      IS DISTINCT FROM v_post_community_id THEN
    NEW.moderation_transparency_category := NULL;
    NEW.moderation_transparency_community_id := NULL;
    RETURN NEW;
  END IF;
  -- Every caller then takes agent before prompt, which prevents an event from
  -- observing a cap assignment half-way through its lifecycle transaction.
  PERFORM fn_lock_moderation_transparency_projection('agent', NEW.agent_id);
  PERFORM fn_lock_moderation_transparency_projection('prompt', NEW.prompt_id);
  SELECT agent.deleted_at, prompt.deleted_at
    INTO v_agent_deleted_at, v_prompt_deleted_at
  FROM agents agent JOIN agent_prompts prompt ON prompt.id = NEW.prompt_id
  WHERE agent.id = NEW.agent_id;
  v_agent_deleted_at := date_trunc('milliseconds', v_agent_deleted_at);
  v_prompt_deleted_at := date_trunc('milliseconds', v_prompt_deleted_at);
  v_cap_deleted_at := date_trunc('milliseconds', v_cap_deleted_at);
  NEW.moderation_transparency_category := NULL;
  NEW.moderation_transparency_community_id := NULL;
  IF NEW.deleted_at IS NOT NULL
    OR (v_agent_deleted_at IS NOT NULL AND uuid_extract_timestamp(NEW.id) >= v_agent_deleted_at)
    OR (v_prompt_deleted_at IS NOT NULL AND uuid_extract_timestamp(NEW.id) >= v_prompt_deleted_at)
    OR (v_cap_deleted_at IS NOT NULL AND uuid_extract_timestamp(NEW.id) >= v_cap_deleted_at) THEN
    RETURN NEW;
  END IF;
  -- A community prompt remains a community-AI event. A platform agent keeps
  -- its platform category, but its post scope must still exclude it from the
  -- global projection because raw community analytics can identify the event.
  NEW.moderation_transparency_category := CASE WHEN v_community_id IS NULL THEN 'agent_moderation' ELSE 'community_ai' END;
  NEW.moderation_transparency_community_id := COALESCE(v_community_id, v_post_community_id);
  RETURN NEW;
END $$;

CREATE FUNCTION fn_lock_agent_moderation_transparency_agent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_lock_moderation_transparency_projection('agent', NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER moderation_transparency_agents_lock
  BEFORE UPDATE OF deleted_at ON agents FOR EACH ROW
  EXECUTE FUNCTION fn_lock_agent_moderation_transparency_agent();

CREATE FUNCTION fn_lock_agent_moderation_transparency_prompt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_agent_id uuid;
BEGIN
  SELECT agent_id INTO v_agent_id FROM agent_prompts WHERE id = OLD.id;
  PERFORM fn_lock_moderation_transparency_projection('agent', v_agent_id);
  PERFORM fn_lock_moderation_transparency_projection('prompt', OLD.id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER moderation_transparency_agent_prompts_lock
  BEFORE UPDATE OR DELETE ON agent_prompts FOR EACH ROW
  EXECUTE FUNCTION fn_lock_agent_moderation_transparency_prompt();

CREATE FUNCTION fn_lock_agent_moderation_transparency_community_prompt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_prompt_id uuid := COALESCE(NEW.id, OLD.id); v_agent_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    -- Existing source rows have already captured their transparency scope.
    -- Do not take a projection advisory lock while a CAP UPDATE/DELETE owns
    -- its child row: a parent hard-delete owns the parent row and cascades to
    -- that child, so either lock order would form a parent/child/advisory
    -- cycle. These lifecycle changes deliberately leave prior stamps alone.
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  -- The child FK lock is acquired after BEFORE INSERT triggers. Acquire the
  -- parent first so parent deletion cannot deadlock on the advisory locks.
  PERFORM 1 FROM agent_prompts WHERE id = v_prompt_id FOR KEY SHARE;
  SELECT agent_id INTO v_agent_id FROM agent_prompts WHERE id = v_prompt_id;
  PERFORM fn_lock_moderation_transparency_projection('agent', v_agent_id);
  PERFORM fn_lock_moderation_transparency_projection('prompt', v_prompt_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER moderation_transparency_community_prompts_lock
  BEFORE INSERT OR UPDATE OR DELETE ON community_agent_prompts FOR EACH ROW
  EXECUTE FUNCTION fn_lock_agent_moderation_transparency_community_prompt();
CREATE TRIGGER moderation_transparency_agent_stamp
  BEFORE INSERT OR UPDATE OF deleted_at ON agent_moderations
  FOR EACH ROW EXECUTE FUNCTION fn_stamp_agent_moderation_transparency();
CREATE FUNCTION fn_protect_agent_moderation_transparency_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.agent_id IS DISTINCT FROM NEW.agent_id
    OR OLD.prompt_id IS DISTINCT FROM NEW.prompt_id THEN
    RAISE EXCEPTION 'agent moderation transparency source identity is immutable';
  END IF;
  IF OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at
    AND (OLD.moderation_transparency_category IS DISTINCT FROM NEW.moderation_transparency_category
      OR OLD.moderation_transparency_community_id IS DISTINCT FROM NEW.moderation_transparency_community_id) THEN
    RAISE EXCEPTION 'agent moderation transparency projection is trigger-maintained';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER moderation_transparency_agent_projection_guard
  BEFORE UPDATE OF id, agent_id, prompt_id, moderation_transparency_category,
    moderation_transparency_community_id ON agent_moderations
  FOR EACH ROW EXECUTE FUNCTION fn_protect_agent_moderation_transparency_projection();
CREATE FUNCTION fn_moderation_transparency_agent_insert_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cohort record;
BEGIN
  FOR cohort IN
    SELECT (uuid_extract_timestamp(id) AT TIME ZONE 'UTC')::date AS day,
      moderation_transparency_community_id AS community_id,
      'automated_moderation'::text AS metric,
      moderation_transparency_category AS category, count(*)::integer AS delta
    FROM new_agent_moderations
    WHERE moderation_transparency_category IS NOT NULL
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2 NULLS FIRST, 3, 4
  LOOP
    PERFORM fn_apply_moderation_transparency_daily_rollup(
      cohort.day::timestamp AT TIME ZONE 'UTC', cohort.community_id,
      cohort.metric, cohort.category, cohort.delta
    );
  END LOOP;
  RETURN NULL;
END $$;
CREATE FUNCTION fn_moderation_transparency_agent_update_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cohort record;
BEGIN
  FOR cohort IN
    SELECT day, community_id, metric, category, sum(delta)::integer AS delta
    FROM (
      SELECT (uuid_extract_timestamp(id) AT TIME ZONE 'UTC')::date AS day,
        moderation_transparency_community_id AS community_id,
        'automated_moderation'::text AS metric,
        moderation_transparency_category AS category, -1 AS delta
      FROM old_agent_moderations WHERE moderation_transparency_category IS NOT NULL
      UNION ALL
      SELECT (uuid_extract_timestamp(id) AT TIME ZONE 'UTC')::date,
        moderation_transparency_community_id,
        'automated_moderation'::text,
        moderation_transparency_category, 1
      FROM new_agent_moderations WHERE moderation_transparency_category IS NOT NULL
    ) changes
    GROUP BY 1, 2, 3, 4
    HAVING sum(delta) <> 0
    ORDER BY 1, 2 NULLS FIRST, 3, 4
  LOOP
    PERFORM fn_apply_moderation_transparency_daily_rollup(
      cohort.day::timestamp AT TIME ZONE 'UTC', cohort.community_id,
      cohort.metric, cohort.category, cohort.delta
    );
  END LOOP;
  RETURN NULL;
END $$;
CREATE FUNCTION fn_moderation_transparency_agent_delete_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cohort record;
BEGIN
  FOR cohort IN
    SELECT (uuid_extract_timestamp(id) AT TIME ZONE 'UTC')::date AS day,
      moderation_transparency_community_id AS community_id,
      'automated_moderation'::text AS metric,
      moderation_transparency_category AS category, count(*)::integer AS count
    FROM deleted_agent_moderations
    WHERE moderation_transparency_category IS NOT NULL
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2 NULLS FIRST, 3, 4
  LOOP
    PERFORM fn_apply_moderation_transparency_daily_rollup(
      cohort.day::timestamp AT TIME ZONE 'UTC', cohort.community_id,
      cohort.metric, cohort.category, -cohort.count
    );
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER moderation_transparency_agent_rollup
  AFTER INSERT ON agent_moderations
  REFERENCING NEW TABLE AS new_agent_moderations
  FOR EACH STATEMENT EXECUTE FUNCTION fn_moderation_transparency_agent_insert_rollup();
CREATE TRIGGER moderation_transparency_agent_update_rollup
  AFTER UPDATE ON agent_moderations
  REFERENCING OLD TABLE AS old_agent_moderations NEW TABLE AS new_agent_moderations
  FOR EACH STATEMENT EXECUTE FUNCTION fn_moderation_transparency_agent_update_rollup();
CREATE TRIGGER moderation_transparency_agent_delete_rollup
  AFTER DELETE ON agent_moderations
  REFERENCING OLD TABLE AS deleted_agent_moderations
  FOR EACH STATEMENT EXECUTE FUNCTION fn_moderation_transparency_agent_delete_rollup();

CREATE FUNCTION fn_stamp_moderation_appeal_transparency_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.moderation_transparency_community_id := NEW.community_id;
  RETURN NEW;
END $$;
CREATE TRIGGER moderation_transparency_appeals_scope_stamp
  BEFORE INSERT ON moderation_appeals FOR EACH ROW
  EXECUTE FUNCTION fn_stamp_moderation_appeal_transparency_scope();
CREATE TRIGGER moderation_transparency_appeals_scope_guard
  BEFORE UPDATE OF moderation_transparency_community_id ON moderation_appeals
  FOR EACH ROW EXECUTE FUNCTION fn_protect_moderation_transparency_scope();
CREATE FUNCTION fn_protect_moderation_appeal_resolution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.resolved_at IS NULL AND OLD.resolution_action IS NULL
    AND NEW.resolved_at IS NOT NULL AND NEW.resolution_action IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.resolved_at IS DISTINCT FROM NEW.resolved_at
    OR OLD.resolution_action IS DISTINCT FROM NEW.resolution_action THEN
    RAISE EXCEPTION 'moderation appeal resolution is immutable once set';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER moderation_transparency_appeals_resolution_guard
  BEFORE UPDATE OF resolved_at, resolution_action ON moderation_appeals
  FOR EACH ROW EXECUTE FUNCTION fn_protect_moderation_appeal_resolution();
CREATE FUNCTION fn_moderation_transparency_appeals_insert_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cohort record;
BEGIN
  FOR cohort IN
    SELECT (resolved_at AT TIME ZONE 'UTC')::date AS day,
      NULL::uuid AS community_id, 'appeals'::text AS metric,
      resolution_action::text AS category, count(*)::integer AS delta
    FROM new_appeals
    WHERE moderation_transparency_community_id IS NULL
      AND resolved_at IS NOT NULL AND resolution_action IS NOT NULL
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2 NULLS FIRST, 3, 4
  LOOP
    PERFORM fn_apply_moderation_transparency_daily_rollup(
      cohort.day::timestamp AT TIME ZONE 'UTC', cohort.community_id,
      cohort.metric, cohort.category, cohort.delta
    );
  END LOOP;
  RETURN NULL;
END $$;
CREATE FUNCTION fn_moderation_transparency_appeals_update_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cohort record;
BEGIN
  FOR cohort IN
    SELECT day, community_id, metric, category, sum(delta)::integer AS delta
    FROM (
      SELECT (resolved_at AT TIME ZONE 'UTC')::date AS day,
        NULL::uuid AS community_id, 'appeals'::text AS metric,
        resolution_action::text AS category, -1 AS delta
      FROM old_appeals
      WHERE moderation_transparency_community_id IS NULL
        AND resolved_at IS NOT NULL AND resolution_action IS NOT NULL
      UNION ALL
      SELECT (resolved_at AT TIME ZONE 'UTC')::date,
        NULL::uuid, 'appeals'::text, resolution_action::text, 1
      FROM new_appeals
      WHERE moderation_transparency_community_id IS NULL
        AND resolved_at IS NOT NULL AND resolution_action IS NOT NULL
    ) changes
    GROUP BY 1, 2, 3, 4
    HAVING sum(delta) <> 0
    ORDER BY 1, 2 NULLS FIRST, 3, 4
  LOOP
    PERFORM fn_apply_moderation_transparency_daily_rollup(
      cohort.day::timestamp AT TIME ZONE 'UTC', cohort.community_id,
      cohort.metric, cohort.category, cohort.delta
    );
  END LOOP;
  RETURN NULL;
END $$;
CREATE FUNCTION fn_moderation_transparency_appeals_delete_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cohort record;
BEGIN
  FOR cohort IN
    SELECT (resolved_at AT TIME ZONE 'UTC')::date AS day,
      NULL::uuid AS community_id, 'appeals'::text AS metric,
      resolution_action::text AS category, count(*)::integer AS count
    FROM deleted_appeals
    WHERE moderation_transparency_community_id IS NULL
      AND resolved_at IS NOT NULL AND resolution_action IS NOT NULL
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2 NULLS FIRST, 3, 4
  LOOP
    PERFORM fn_apply_moderation_transparency_daily_rollup(
      cohort.day::timestamp AT TIME ZONE 'UTC', cohort.community_id,
      cohort.metric, cohort.category, -cohort.count
    );
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER moderation_transparency_appeals_rollup
  AFTER INSERT ON moderation_appeals
  REFERENCING NEW TABLE AS new_appeals
  FOR EACH STATEMENT EXECUTE FUNCTION fn_moderation_transparency_appeals_insert_rollup();
CREATE TRIGGER moderation_transparency_appeals_update_rollup
  AFTER UPDATE ON moderation_appeals
  REFERENCING OLD TABLE AS old_appeals NEW TABLE AS new_appeals
  FOR EACH STATEMENT EXECUTE FUNCTION fn_moderation_transparency_appeals_update_rollup();
CREATE TRIGGER moderation_transparency_appeals_delete_rollup
  AFTER DELETE ON moderation_appeals
  REFERENCING OLD TABLE AS deleted_appeals
  FOR EACH STATEMENT EXECUTE FUNCTION fn_moderation_transparency_appeals_delete_rollup();

CREATE FUNCTION fn_stamp_clearance_transparency_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT community_id INTO NEW.moderation_transparency_community_id FROM posts WHERE id = NEW.post_id;
  RETURN NEW;
END $$;
CREATE TRIGGER moderation_transparency_clearance_scope_stamp
  BEFORE INSERT ON post_clearance_changes FOR EACH ROW
  EXECUTE FUNCTION fn_stamp_clearance_transparency_scope();
CREATE TRIGGER moderation_transparency_clearance_scope_guard
  BEFORE UPDATE OF moderation_transparency_community_id ON post_clearance_changes
  FOR EACH ROW EXECUTE FUNCTION fn_protect_moderation_transparency_scope();
CREATE FUNCTION fn_protect_clearance_transparency_categories() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.moderation_transparency_categories IS DISTINCT FROM NEW.moderation_transparency_categories THEN
    RAISE EXCEPTION 'clearance moderation transparency categories are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER moderation_transparency_clearance_categories_guard
  BEFORE UPDATE OF moderation_transparency_categories ON post_clearance_changes
  FOR EACH ROW EXECUTE FUNCTION fn_protect_clearance_transparency_categories();
CREATE FUNCTION fn_protect_post_clearance_change_type() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.change_type IS DISTINCT FROM NEW.change_type THEN
    RAISE EXCEPTION 'post clearance change type is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER moderation_transparency_clearance_type_guard
  BEFORE UPDATE OF change_type ON post_clearance_changes
  FOR EACH ROW EXECUTE FUNCTION fn_protect_post_clearance_change_type();
CREATE FUNCTION fn_moderation_transparency_clearance_insert_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cohort record;
BEGIN
  FOR cohort IN
    SELECT (uuid_extract_timestamp(change.id) AT TIME ZONE 'UTC')::date AS day,
      change.moderation_transparency_community_id AS community_id,
      'automated_moderation'::text AS metric,
      category, count(*)::integer AS delta
    FROM new_clearance_changes change
    CROSS JOIN LATERAL unnest(change.moderation_transparency_categories) AS category
    WHERE change.change_type = 'reject'
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2 NULLS FIRST, 3, 4
  LOOP
    PERFORM fn_apply_moderation_transparency_daily_rollup(
      cohort.day::timestamp AT TIME ZONE 'UTC', cohort.community_id,
      cohort.metric, cohort.category, cohort.delta
    );
  END LOOP;
  RETURN NULL;
END $$;
CREATE FUNCTION fn_moderation_transparency_clearance_delete_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cohort record;
BEGIN
  FOR cohort IN
    SELECT (uuid_extract_timestamp(change.id) AT TIME ZONE 'UTC')::date AS day,
      change.moderation_transparency_community_id AS community_id,
      'automated_moderation'::text AS metric,
      category, count(*)::integer AS count
    FROM deleted_clearance_changes change
    CROSS JOIN LATERAL unnest(change.moderation_transparency_categories) AS category
    WHERE change.change_type = 'reject'
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2 NULLS FIRST, 3, 4
  LOOP
    PERFORM fn_apply_moderation_transparency_daily_rollup(
      cohort.day::timestamp AT TIME ZONE 'UTC', cohort.community_id,
      cohort.metric, cohort.category, -cohort.count
    );
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER moderation_transparency_clearance_rollup
  AFTER INSERT ON post_clearance_changes
  REFERENCING NEW TABLE AS new_clearance_changes
  FOR EACH STATEMENT EXECUTE FUNCTION fn_moderation_transparency_clearance_insert_rollup();
CREATE TRIGGER moderation_transparency_clearance_delete_rollup
  AFTER DELETE ON post_clearance_changes
  REFERENCING OLD TABLE AS deleted_clearance_changes
  FOR EACH STATEMENT EXECUTE FUNCTION fn_moderation_transparency_clearance_delete_rollup();
