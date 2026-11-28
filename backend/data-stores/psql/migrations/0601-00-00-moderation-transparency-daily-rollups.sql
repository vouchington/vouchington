-- Public daily moderation-transparency cohorts are computed from the source tables by a bounded
-- scheduled job and stored only here, once the UTC day is closed and the cohort is large enough
-- to disclose. This is the privacy boundary for paid transparency: no user, post, prompt, or
-- action id is retained. Source tables keep immutable scope stamps (below); there is no live counter.

-- Once a qualifying daily cohort is released, retain only this aggregate snapshot.
-- It deliberately has no foreign keys: source, community, and actor deletion cannot
-- rewrite a published disclosure.
CREATE TABLE moderation_transparency_released_daily_rollups (
  day date NOT NULL,
  community_id uuid,
  metric moderation_transparency_metrics NOT NULL CHECK (metric IN ('reports', 'moderation_actions', 'automated_moderation', 'appeals')),
  category moderation_transparency_categories NOT NULL,
  count integer NOT NULL CHECK (count >= 20),
  latest_occurred_at timestamptz NOT NULL,
  released_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT moderation_transparency_released_daily_rollups_key
    UNIQUE NULLS NOT DISTINCT (day, community_id, metric, category)
);
CREATE INDEX idx_moderation_transparency_released_daily_rollups__global_page
  ON moderation_transparency_released_daily_rollups (day DESC)
  WHERE community_id IS NULL;
CREATE INDEX idx_moderatio_transparen_released_daily_rollups__community_page
  ON moderation_transparency_released_daily_rollups (community_id, day DESC)
  WHERE community_id IS NOT NULL;
COMMENT ON TABLE moderation_transparency_released_daily_rollups IS 'Immutable aggregate-only daily moderation transparency disclosures; no source or community foreign key is retained.';
COMMENT ON COLUMN moderation_transparency_released_daily_rollups.day IS 'UTC day of the permanently released aggregate cohort.';
COMMENT ON COLUMN moderation_transparency_released_daily_rollups.community_id IS 'Immutable community scope, or NULL for the global transparency projection.';
COMMENT ON COLUMN moderation_transparency_released_daily_rollups.metric IS 'Public transparency metric dimension fixed at release.';
COMMENT ON COLUMN moderation_transparency_released_daily_rollups.category IS 'Public transparency category dimension fixed at release.';
COMMENT ON COLUMN moderation_transparency_released_daily_rollups.count IS 'Exact released cohort count; API sanitization applies nearest-five rounding.';
COMMENT ON COLUMN moderation_transparency_released_daily_rollups.latest_occurred_at IS 'Latest source event timestamp counted in the released cohort.';
COMMENT ON COLUMN moderation_transparency_released_daily_rollups.released_at IS 'Transaction timestamp when the aggregate cohort became immutable.';

CREATE TRIGGER trigger_moderation_transparency_released_rollup_guard
  BEFORE UPDATE OR DELETE ON moderation_transparency_released_daily_rollups
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();

CREATE FUNCTION fn_update_transparency_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW := jsonb_populate_record(NEW, jsonb_build_object(
    TG_ARGV[0], to_jsonb(NEW) -> TG_ARGV[1]));
  RETURN NEW;
END $$;

CREATE FUNCTION fn_update_moderation_report_transparency_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.moderation_transparency_community_id IS NULL THEN
    IF NEW.community_id IS NOT NULL THEN
      NEW.moderation_transparency_community_id := NEW.community_id;
    ELSIF NEW.post_id IS NOT NULL THEN
      SELECT community_id INTO NEW.moderation_transparency_community_id FROM posts WHERE id = NEW.post_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trigger_moderation_transparency_reports_scope_stamp
  BEFORE INSERT ON moderation_reports FOR EACH ROW
  EXECUTE FUNCTION fn_update_moderation_report_transparency_scope();

CREATE TRIGGER trigger_moderation_transparency_reports_scope_guard
  BEFORE UPDATE OF moderation_transparency_community_id ON moderation_reports
  FOR EACH ROW
  WHEN (ROW(OLD.moderation_transparency_community_id) IS DISTINCT FROM ROW(NEW.moderation_transparency_community_id)) EXECUTE FUNCTION fn_reject_mutation();

CREATE TRIGGER trigger_moderation_transparency_reports_original_reason_guard
  BEFORE UPDATE OF original_reason ON moderation_reports
  FOR EACH ROW
  WHEN (ROW(OLD.original_reason) IS DISTINCT FROM ROW(NEW.original_reason)) EXECUTE FUNCTION fn_reject_mutation();

CREATE TRIGGER trigger_moderation_transparency_actions_scope_stamp
  BEFORE INSERT ON moderator_actions FOR EACH ROW
  EXECUTE FUNCTION fn_update_transparency_scope('moderation_transparency_community_id', 'community_id');
CREATE TRIGGER trigger_moderation_transparency_actions_scope_guard
  BEFORE UPDATE OF moderation_transparency_community_id ON moderator_actions
  FOR EACH ROW
  WHEN (ROW(OLD.moderation_transparency_community_id) IS DISTINCT FROM ROW(NEW.moderation_transparency_community_id)) EXECUTE FUNCTION fn_reject_mutation();

CREATE TRIGGER trigger_moderation_transparency_actions_type_guard
  BEFORE UPDATE OF action_type ON moderator_actions
  FOR EACH ROW
  WHEN (ROW(OLD.action_type) IS DISTINCT FROM ROW(NEW.action_type)) EXECUTE FUNCTION fn_reject_mutation();

CREATE FUNCTION fn_update_agent_moderation_transparency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_community_id uuid; v_post_community_id uuid;
  v_agent_deleted_at timestamptz; v_prompt_deleted_at timestamptz; v_cap_deleted_at timestamptz;
BEGIN
  -- Stamp the event's category and scope once, from one statement snapshot. The stamp is
  -- needed because the source scope can change or disappear later (a community prompt is
  -- reassigned or deleted, an agent or prompt is soft-deleted) while a closed day still has to
  -- count the event where it happened. A concurrent uncommitted soft-delete is ordered after
  -- this insert; the stamp takes no lock because a hard delete removes the source row, and the
  -- job only counts rows that still exist.
  SELECT CASE WHEN community.id IS NULL THEN NULL ELSE cap.community_id END,
    CASE WHEN community.id IS NULL THEN NULL ELSE cap.deleted_at END,
    agent.deleted_at, prompt.deleted_at, post.community_id
  INTO v_community_id, v_cap_deleted_at, v_agent_deleted_at, v_prompt_deleted_at, v_post_community_id
  FROM agents agent
  JOIN agent_prompts prompt ON prompt.id = NEW.prompt_id
  LEFT JOIN community_agent_prompts cap ON cap.id = prompt.id
  LEFT JOIN communities community ON community.id = cap.community_id
  LEFT JOIN posts post ON post.id = NEW.post_id
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
CREATE TRIGGER trigger_moderation_transparency_agent_stamp
  BEFORE INSERT OR UPDATE OF deleted_at ON agent_moderations
  FOR EACH ROW EXECUTE FUNCTION fn_update_agent_moderation_transparency();
CREATE FUNCTION fn_reject_agent_moderation_transparency_projection() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER trigger_moderation_transparency_agent_projection_guard
  BEFORE UPDATE OF id, agent_id, prompt_id, moderation_transparency_category,
    moderation_transparency_community_id ON agent_moderations
  FOR EACH ROW EXECUTE FUNCTION fn_reject_agent_moderation_transparency_projection();
CREATE TRIGGER trigger_moderation_transparency_appeals_scope_stamp
  BEFORE INSERT ON moderation_appeals FOR EACH ROW
  EXECUTE FUNCTION fn_update_transparency_scope('moderation_transparency_community_id', 'community_id');
CREATE TRIGGER trigger_moderation_transparency_appeals_scope_guard
  BEFORE UPDATE OF moderation_transparency_community_id ON moderation_appeals
  FOR EACH ROW
  WHEN (ROW(OLD.moderation_transparency_community_id) IS DISTINCT FROM ROW(NEW.moderation_transparency_community_id)) EXECUTE FUNCTION fn_reject_mutation();
CREATE FUNCTION fn_reject_moderation_appeal_resolution() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER trigger_moderation_transparency_appeals_resolution_guard
  BEFORE UPDATE OF resolved_at, resolution_action ON moderation_appeals
  FOR EACH ROW EXECUTE FUNCTION fn_reject_moderation_appeal_resolution();
CREATE FUNCTION fn_update_clearance_transparency_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT community_id INTO NEW.moderation_transparency_community_id FROM posts WHERE id = NEW.post_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trigger_moderation_transparency_clearance_scope_stamp
  BEFORE INSERT ON post_clearance_changes FOR EACH ROW
  EXECUTE FUNCTION fn_update_clearance_transparency_scope();
CREATE TRIGGER trigger_moderation_transparency_clearance_scope_guard
  BEFORE UPDATE OF moderation_transparency_community_id ON post_clearance_changes
  FOR EACH ROW
  WHEN (ROW(OLD.moderation_transparency_community_id) IS DISTINCT FROM ROW(NEW.moderation_transparency_community_id)) EXECUTE FUNCTION fn_reject_mutation();

CREATE TRIGGER trigger_moderation_transparency_clearance_categories_guard
  BEFORE UPDATE OF moderation_transparency_categories ON post_clearance_changes
  FOR EACH ROW
  WHEN (ROW(OLD.moderation_transparency_categories) IS DISTINCT FROM ROW(NEW.moderation_transparency_categories)) EXECUTE FUNCTION fn_reject_mutation();

CREATE TRIGGER trigger_moderation_transparency_clearance_type_guard
  BEFORE UPDATE OF change_type ON post_clearance_changes
  FOR EACH ROW
  WHEN (ROW(OLD.change_type) IS DISTINCT FROM ROW(NEW.change_type)) EXECUTE FUNCTION fn_reject_mutation();
