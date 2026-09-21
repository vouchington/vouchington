-- Classifiers are decision configuration, not autonomous agents. Keep their durable
-- configuration and result history independent of the agent tables retired by Epic A.

DO $$ BEGIN
CREATE TYPE classifier_primitive AS ENUM ('noul', 'choice', 'score');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE classifier_candidate_kind AS ENUM ('topic', 'story');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE classifier_model_provider AS ENUM ('typesafe', 'openrouter');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS classifiers (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  slug TEXT NOT NULL UNIQUE,
  primitive classifier_primitive NOT NULL,
  candidate_kind classifier_candidate_kind NOT NULL,
  activated_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID REFERENCES users ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,
  CONSTRAINT chk_classifiers__lifecycle CHECK (
    deactivated_at IS NULL
    OR (activated_at IS NOT NULL AND deactivated_at >= activated_at)
  ),
  CONSTRAINT uq_classifiers__id__candidate_kind UNIQUE (id, candidate_kind)
);

CREATE INDEX IF NOT EXISTS idx_classifiers__active
  ON classifiers (candidate_kind, slug)
  WHERE activated_at IS NOT NULL AND deactivated_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_classifiers__created_by
  ON classifiers (created_by_id);
CREATE INDEX IF NOT EXISTS idx_classifiers__updated_by
  ON classifiers (updated_by_id);
CREATE INDEX IF NOT EXISTS idx_classifiers__deleted_by
  ON classifiers (deleted_by_id);

CREATE OR REPLACE TRIGGER trigger_classifiers_updated_at
  BEFORE UPDATE ON classifiers
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE FUNCTION fn_reject_classifier_identity_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.primitive IS DISTINCT FROM OLD.primitive
    OR NEW.candidate_kind IS DISTINCT FROM OLD.candidate_kind THEN
    RAISE EXCEPTION 'classifier identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trigger_classifiers_identity_immutable
  BEFORE UPDATE ON classifiers
  FOR EACH ROW EXECUTE FUNCTION fn_reject_classifier_identity_mutation();

CREATE OR REPLACE FUNCTION fn_require_classifier_activation_lifecycle()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.activated_at IS NOT DISTINCT FROM OLD.activated_at
    AND NEW.deactivated_at IS NOT DISTINCT FROM OLD.deactivated_at THEN
    RETURN NEW;
  END IF;
  IF OLD.activated_at IS NULL
    AND OLD.deactivated_at IS NULL
    AND NEW.activated_at IS NOT NULL
    AND NEW.deactivated_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.activated_at IS NOT NULL
    AND OLD.deactivated_at IS NULL
    AND NEW.activated_at IS NOT DISTINCT FROM OLD.activated_at
    AND NEW.deactivated_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% activation lifecycle is immutable after each transition', TG_TABLE_NAME USING ERRCODE = '23514';
END $$;

CREATE OR REPLACE TRIGGER trigger_classifiers_activation_lifecycle
  BEFORE UPDATE ON classifiers
  FOR EACH ROW EXECUTE FUNCTION fn_require_classifier_activation_lifecycle();

CREATE TABLE IF NOT EXISTS classifier_prompt_versions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  classifier_id UUID NOT NULL REFERENCES classifiers ON DELETE RESTRICT,
  prompt TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_provider classifier_model_provider NOT NULL,
  default_lower_threshold NUMERIC(5,4) NOT NULL,
  default_upper_threshold NUMERIC(5,4) NOT NULL,
  activated_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID REFERENCES users ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,
  CONSTRAINT chk_classifier_prompt_versions__lifecycle CHECK (
    deactivated_at IS NULL
    OR (activated_at IS NOT NULL AND deactivated_at >= activated_at)
  ),
  CONSTRAINT chk_classifier_prompt_versions__default_thresholds CHECK (
    default_lower_threshold >= 0 AND default_upper_threshold <= 1
    AND default_lower_threshold < default_upper_threshold
  ),
  CONSTRAINT uq_classifier_prompt_versions__id__classifier UNIQUE (id, classifier_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_classifier_prompt_versions__classifier_active
  ON classifier_prompt_versions (classifier_id)
  WHERE activated_at IS NOT NULL AND deactivated_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_classifier_prompt_versions__classifier
  ON classifier_prompt_versions (classifier_id);
CREATE INDEX IF NOT EXISTS idx_classifier_prompt_versions__created_by
  ON classifier_prompt_versions (created_by_id);
CREATE INDEX IF NOT EXISTS idx_classifier_prompt_versions__updated_by
  ON classifier_prompt_versions (updated_by_id);
CREATE INDEX IF NOT EXISTS idx_classifier_prompt_versions__deleted_by
  ON classifier_prompt_versions (deleted_by_id);

CREATE OR REPLACE FUNCTION fn_reject_classifier_prompt_version_identity_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.classifier_id IS DISTINCT FROM OLD.classifier_id
    OR NEW.prompt IS DISTINCT FROM OLD.prompt
    OR NEW.model_name IS DISTINCT FROM OLD.model_name
    OR NEW.model_provider IS DISTINCT FROM OLD.model_provider
    OR NEW.default_lower_threshold IS DISTINCT FROM OLD.default_lower_threshold
    OR NEW.default_upper_threshold IS DISTINCT FROM OLD.default_upper_threshold THEN
    RAISE EXCEPTION 'classifier prompt version identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trigger_classifier_prompt_versions_identity_immutable
  BEFORE UPDATE ON classifier_prompt_versions
  FOR EACH ROW EXECUTE FUNCTION fn_reject_classifier_prompt_version_identity_mutation();

CREATE OR REPLACE TRIGGER trigger_classifier_prompt_versions_activation_lifecycle
  BEFORE UPDATE ON classifier_prompt_versions
  FOR EACH ROW EXECUTE FUNCTION fn_require_classifier_activation_lifecycle();

CREATE OR REPLACE TRIGGER trigger_classifier_prompt_versions_updated_at
  BEFORE UPDATE ON classifier_prompt_versions
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE IF NOT EXISTS classifier_candidates (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  classifier_id UUID NOT NULL,
  candidate_kind classifier_candidate_kind NOT NULL,
  topic_id UUID REFERENCES topics ON DELETE CASCADE,
  story_id UUID REFERENCES stories ON DELETE CASCADE,
  community_id UUID REFERENCES communities ON DELETE CASCADE,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID REFERENCES users ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,
  CONSTRAINT chk_classifier_candidates__one_entity CHECK (num_nonnulls(topic_id, story_id) = 1),
  CONSTRAINT chk_classifier_candidates__entity_kind CHECK (
    (candidate_kind = 'topic' AND topic_id IS NOT NULL)
    OR (candidate_kind = 'story' AND story_id IS NOT NULL)
  ),
  CONSTRAINT fk_classifier_candidates__classifier_kind
    FOREIGN KEY (classifier_id, candidate_kind)
    REFERENCES classifiers (id, candidate_kind) ON DELETE CASCADE,
  CONSTRAINT uq_classifier_candidates__id__classifier UNIQUE (id, classifier_id),
  CONSTRAINT uq_classifier_candidates__id__classifier_topic UNIQUE (id, classifier_id, topic_id),
  CONSTRAINT uq_classifier_candidates__id__classifier_story UNIQUE (id, classifier_id, story_id)
);

CREATE INDEX IF NOT EXISTS idx_classifier_candidates__community
  ON classifier_candidates (community_id, classifier_id) WHERE community_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_classifier_candidates__classifier_kind
  ON classifier_candidates (classifier_id, candidate_kind);
CREATE INDEX IF NOT EXISTS idx_classifier_candidates__topic
  ON classifier_candidates (topic_id);
CREATE INDEX IF NOT EXISTS idx_classifier_candidates__story
  ON classifier_candidates (story_id);
CREATE INDEX IF NOT EXISTS idx_classifier_candidates__community_bare
  ON classifier_candidates (community_id);
CREATE INDEX IF NOT EXISTS idx_classifier_candidates__created_by
  ON classifier_candidates (created_by_id);
CREATE INDEX IF NOT EXISTS idx_classifier_candidates__updated_by
  ON classifier_candidates (updated_by_id);
CREATE INDEX IF NOT EXISTS idx_classifier_candidates__deleted_by
  ON classifier_candidates (deleted_by_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_classifier_candidates__active_topic
  ON classifier_candidates (classifier_id, topic_id, community_id) NULLS NOT DISTINCT
  WHERE topic_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_classifier_candidates__active_story
  ON classifier_candidates (classifier_id, story_id, community_id) NULLS NOT DISTINCT
  WHERE story_id IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION fn_reject_classifier_candidate_identity_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.classifier_id IS DISTINCT FROM OLD.classifier_id
    OR NEW.candidate_kind IS DISTINCT FROM OLD.candidate_kind
    OR NEW.topic_id IS DISTINCT FROM OLD.topic_id
    OR NEW.story_id IS DISTINCT FROM OLD.story_id
    OR NEW.community_id IS DISTINCT FROM OLD.community_id THEN
    RAISE EXCEPTION 'classifier candidate identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trigger_classifier_candidates_identity_immutable
  BEFORE UPDATE ON classifier_candidates
  FOR EACH ROW EXECUTE FUNCTION fn_reject_classifier_candidate_identity_mutation();

CREATE OR REPLACE TRIGGER trigger_classifier_candidates_updated_at
  BEFORE UPDATE ON classifier_candidates
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE IF NOT EXISTS classifier_candidate_thresholds (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  classifier_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  prompt_version_id UUID NOT NULL,
  lower_threshold_override NUMERIC(5,4),
  upper_threshold_override NUMERIC(5,4),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deactivated_by_id UUID REFERENCES users ON DELETE SET NULL,
  CONSTRAINT chk_classifier_candidate_thresholds__override_bounds CHECK (
    (lower_threshold_override IS NULL OR lower_threshold_override >= 0)
    AND (upper_threshold_override IS NULL OR upper_threshold_override <= 1)
  ),
  CONSTRAINT chk_classifier_candidate_thresholds__lifecycle CHECK (
    (deactivated_at IS NULL AND deactivated_by_id IS NULL)
    OR (deactivated_at IS NOT NULL AND deactivated_at >= activated_at)
  ),
  CONSTRAINT fk_classifier_candidate_thresholds__candidate_classifier
    FOREIGN KEY (candidate_id, classifier_id)
    REFERENCES classifier_candidates (id, classifier_id) ON DELETE CASCADE,
  CONSTRAINT fk_classifier_candidate_thresholds__prompt_classifier
    FOREIGN KEY (prompt_version_id, classifier_id)
    REFERENCES classifier_prompt_versions (id, classifier_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_classifier_candidate_thresholds__classifier
  ON classifier_candidate_thresholds (classifier_id);
CREATE INDEX IF NOT EXISTS idx_classifier_candidate_thresholds__candidate
  ON classifier_candidate_thresholds (candidate_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_classifier_candidate_thresholds__active_candidate_prompt
  ON classifier_candidate_thresholds (candidate_id, prompt_version_id)
  WHERE deactivated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_classifier_candidate_thresholds__prompt_classifier
  ON classifier_candidate_thresholds (prompt_version_id, classifier_id);
CREATE INDEX IF NOT EXISTS idx_classifier_candidate_thresholds__created_by
  ON classifier_candidate_thresholds (created_by_id);
CREATE INDEX IF NOT EXISTS idx_classifier_candidate_thresholds__deactivated_by
  ON classifier_candidate_thresholds (deactivated_by_id);

CREATE OR REPLACE FUNCTION fn_require_classifier_candidate_effective_thresholds()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  defaults classifier_prompt_versions%ROWTYPE;
  effective_lower NUMERIC(5,4);
  effective_upper NUMERIC(5,4);
BEGIN
  SELECT * INTO defaults FROM classifier_prompt_versions
  WHERE id = NEW.prompt_version_id FOR SHARE;
  effective_lower := COALESCE(NEW.lower_threshold_override, defaults.default_lower_threshold);
  effective_upper := COALESCE(NEW.upper_threshold_override, defaults.default_upper_threshold);
  IF effective_lower < 0 OR effective_upper > 1 OR effective_lower >= effective_upper THEN
    RAISE EXCEPTION 'classifier candidate effective thresholds must be ordered probabilities' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trigger_classifier_candidate_thresholds_effective
  BEFORE INSERT OR UPDATE OF prompt_version_id, lower_threshold_override, upper_threshold_override
  ON classifier_candidate_thresholds
  FOR EACH ROW EXECUTE FUNCTION fn_require_classifier_candidate_effective_thresholds();

CREATE OR REPLACE FUNCTION fn_classifier_audit_actor_was_deleted(actor_id UUID)
RETURNS BOOLEAN LANGUAGE sql VOLATILE AS $$
  SELECT actor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id = actor_id)
$$;

CREATE OR REPLACE FUNCTION fn_require_classifier_candidate_threshold_lifecycle()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.classifier_id IS DISTINCT FROM OLD.classifier_id
    OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
    OR NEW.prompt_version_id IS DISTINCT FROM OLD.prompt_version_id
    OR NEW.lower_threshold_override IS DISTINCT FROM OLD.lower_threshold_override
    OR NEW.upper_threshold_override IS DISTINCT FROM OLD.upper_threshold_override
    OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
    OR (
      NEW.created_by_id IS DISTINCT FROM OLD.created_by_id
      AND NOT (
        NEW.created_by_id IS NULL
        AND fn_classifier_audit_actor_was_deleted(OLD.created_by_id)
      )
    )
    OR NOT (
      NEW.deactivated_at IS NOT DISTINCT FROM OLD.deactivated_at
      OR (OLD.deactivated_at IS NULL AND NEW.deactivated_at IS NOT NULL)
    )
    OR (
      NEW.deactivated_by_id IS DISTINCT FROM OLD.deactivated_by_id
      AND NOT (
        OLD.deactivated_at IS NULL AND NEW.deactivated_at IS NOT NULL
        OR (
          NEW.deactivated_by_id IS NULL
          AND fn_classifier_audit_actor_was_deleted(OLD.deactivated_by_id)
        )
      )
    ) THEN
    RAISE EXCEPTION 'classifier candidate threshold revision is immutable except for deactivation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trigger_classifier_candidate_thresholds_lifecycle
  BEFORE UPDATE ON classifier_candidate_thresholds
  FOR EACH ROW EXECUTE FUNCTION fn_require_classifier_candidate_threshold_lifecycle();

CREATE OR REPLACE TRIGGER trigger_classifier_candidate_thresholds_updated_at
  BEFORE UPDATE ON classifier_candidate_thresholds
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE IF NOT EXISTS classifier_candidate_community_overrides (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES classifier_candidates ON DELETE CASCADE,
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enabled_by_id UUID REFERENCES users ON DELETE SET NULL,
  disabled_at TIMESTAMPTZ,
  disabled_by_id UUID REFERENCES users ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_classifier_candidate_community_overrides__lifecycle CHECK (
    (disabled_at IS NULL AND disabled_by_id IS NULL)
    OR (disabled_at IS NOT NULL AND disabled_at >= enabled_at)
  )
);

CREATE INDEX IF NOT EXISTS idx_classifier_candidate_community_overrides__candidate
  ON classifier_candidate_community_overrides (candidate_id);
CREATE INDEX IF NOT EXISTS idx_classifier_candidate_community_overrides__community
  ON classifier_candidate_community_overrides (community_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_classifier_candidate_community_overrides__enabled
  ON classifier_candidate_community_overrides (community_id, candidate_id) WHERE disabled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_classifier_candidate_community_overrides__enabled_by
  ON classifier_candidate_community_overrides (enabled_by_id);
CREATE INDEX IF NOT EXISTS idx_classifier_candidate_community_overrides__disabled_by
  ON classifier_candidate_community_overrides (disabled_by_id);

CREATE OR REPLACE FUNCTION fn_require_global_classifier_candidate_override()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM classifier_candidates candidate
    WHERE candidate.id = NEW.candidate_id AND candidate.community_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'community overrides may target only global classifier candidates' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trigger_classifier_candidate_community_overrides_global
  BEFORE INSERT OR UPDATE OF candidate_id ON classifier_candidate_community_overrides
  FOR EACH ROW EXECUTE FUNCTION fn_require_global_classifier_candidate_override();

CREATE OR REPLACE FUNCTION fn_require_classifier_candidate_community_override_lifecycle()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.community_id IS DISTINCT FROM OLD.community_id
    OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
    OR NEW.enabled_at IS DISTINCT FROM OLD.enabled_at
    OR (
      NEW.enabled_by_id IS DISTINCT FROM OLD.enabled_by_id
      AND NOT (
        NEW.enabled_by_id IS NULL
        AND fn_classifier_audit_actor_was_deleted(OLD.enabled_by_id)
      )
    )
    OR NOT (
      NEW.disabled_at IS NOT DISTINCT FROM OLD.disabled_at
      OR (OLD.disabled_at IS NULL AND NEW.disabled_at IS NOT NULL)
    )
    OR (
      NEW.disabled_by_id IS DISTINCT FROM OLD.disabled_by_id
      AND NOT (
        OLD.disabled_at IS NULL AND NEW.disabled_at IS NOT NULL
        OR (
          NEW.disabled_by_id IS NULL
          AND fn_classifier_audit_actor_was_deleted(OLD.disabled_by_id)
        )
      )
    ) THEN
    RAISE EXCEPTION 'classifier candidate community override is immutable except for deactivation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trigger_classifier_candidate_community_overrides_lifecycle
  BEFORE UPDATE ON classifier_candidate_community_overrides
  FOR EACH ROW EXECUTE FUNCTION fn_require_classifier_candidate_community_override_lifecycle();

CREATE OR REPLACE TRIGGER trigger_classifier_candidate_community_overrides_updated_at
  BEFORE UPDATE ON classifier_candidate_community_overrides
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE IF NOT EXISTS classifier_decision_batches (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  classifier_id UUID NOT NULL REFERENCES classifiers ON DELETE RESTRICT,
  prompt_version_id UUID NOT NULL,
  post_id UUID REFERENCES posts ON DELETE CASCADE,
  rss_feed_item_id UUID REFERENCES rss_feed_items ON DELETE CASCADE,
  scope_category TEXT NOT NULL,
  scope_community_id UUID,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_classifier_decision_batches__one_subject CHECK (num_nonnulls(post_id, rss_feed_item_id) = 1),
  CONSTRAINT chk_classifier_decision_batches__scope CHECK (
    (scope_category = 'global' AND scope_community_id IS NULL)
    OR (scope_category = 'community_ai' AND scope_community_id IS NOT NULL)
  ),
  CONSTRAINT fk_classifier_decision_batches__prompt_classifier
    FOREIGN KEY (prompt_version_id, classifier_id)
    REFERENCES classifier_prompt_versions (id, classifier_id) ON DELETE RESTRICT,
  CONSTRAINT uq_classifier_decision_batches__id__classifier UNIQUE (id, classifier_id),
  CONSTRAINT uq_classifier_decision_batches__id__prompt UNIQUE (id, prompt_version_id),
  CONSTRAINT uq_classifier_decision_batches__id__scope UNIQUE (id, scope_category, scope_community_id)
);

CREATE INDEX IF NOT EXISTS idx_classifier_decision_batches__post
  ON classifier_decision_batches (post_id, id);
CREATE INDEX IF NOT EXISTS idx_classifier_decision_batches__rss_feed_item
  ON classifier_decision_batches (rss_feed_item_id, id);
CREATE INDEX IF NOT EXISTS idx_classifier_decision_batches__scope
  ON classifier_decision_batches (scope_community_id, id) WHERE scope_category = 'community_ai';
CREATE INDEX IF NOT EXISTS idx_classifier_decision_batches__classifier
  ON classifier_decision_batches (classifier_id);
CREATE INDEX IF NOT EXISTS idx_classifier_decision_batches__prompt_classifier
  ON classifier_decision_batches (prompt_version_id, classifier_id);

CREATE OR REPLACE FUNCTION fn_reject_classifier_append_only_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '23514';
END $$;

CREATE OR REPLACE TRIGGER trigger_classifier_decision_batches_append_only
  BEFORE UPDATE ON classifier_decision_batches
  FOR EACH ROW EXECUTE FUNCTION fn_reject_classifier_append_only_update();

CREATE TABLE IF NOT EXISTS classifier_decision_batch_candidates (
  batch_id UUID NOT NULL,
  classifier_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  prompt_version_id UUID NOT NULL,
  threshold_id UUID NOT NULL,
  effective_lower_threshold NUMERIC(5,4) NOT NULL,
  effective_upper_threshold NUMERIC(5,4) NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(batch_id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (batch_id, candidate_id),
  CONSTRAINT chk_classifier_decision_batch_candidates__effective_thresholds CHECK (
    effective_lower_threshold >= 0 AND effective_upper_threshold <= 1
    AND effective_lower_threshold < effective_upper_threshold
  ),
  CONSTRAINT fk_classifier_decision_batch_candidates__batch_classifier
    FOREIGN KEY (batch_id, classifier_id)
    REFERENCES classifier_decision_batches (id, classifier_id) ON DELETE CASCADE,
  CONSTRAINT fk_classifier_decision_batch_candidates__batch_prompt
    FOREIGN KEY (batch_id, prompt_version_id)
    REFERENCES classifier_decision_batches (id, prompt_version_id) ON DELETE CASCADE,
  CONSTRAINT fk_classifier_decision_batch_candidates__candidate_classifier
    FOREIGN KEY (candidate_id, classifier_id)
    REFERENCES classifier_candidates (id, classifier_id) ON DELETE CASCADE,
  CONSTRAINT fk_classifier_decision_batch_candidates__threshold
    FOREIGN KEY (threshold_id)
    REFERENCES classifier_candidate_thresholds (id)
    ON DELETE RESTRICT,
  CONSTRAINT uq_classifier_decision_batch_candidates__result_lineage
    UNIQUE (
      batch_id, candidate_id, classifier_id, prompt_version_id, threshold_id,
      effective_lower_threshold, effective_upper_threshold
    )
) PARTITION BY RANGE (batch_id);

CREATE INDEX IF NOT EXISTS idx_classifier_decision_batch_candidates__classifier
  ON classifier_decision_batch_candidates (classifier_id);
CREATE INDEX IF NOT EXISTS idx_classifier_decision_batch_candidates__candidate
  ON classifier_decision_batch_candidates (candidate_id);
CREATE INDEX IF NOT EXISTS idx_classifier_decision_batch_candidates__prompt
  ON classifier_decision_batch_candidates (prompt_version_id);
CREATE INDEX IF NOT EXISTS idx_classifier_decision_batch_candidates__threshold
  ON classifier_decision_batch_candidates (threshold_id);

CREATE OR REPLACE FUNCTION fn_require_classifier_batch_candidate_configuration()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  batch classifier_decision_batches%ROWTYPE;
  candidate classifier_candidates%ROWTYPE;
  prompt classifier_prompt_versions%ROWTYPE;
  threshold classifier_candidate_thresholds%ROWTYPE;
  effective_lower NUMERIC(5,4);
  effective_upper NUMERIC(5,4);
BEGIN
  SELECT * INTO batch FROM classifier_decision_batches
  WHERE id = NEW.batch_id FOR SHARE;
  SELECT * INTO candidate FROM classifier_candidates
  WHERE id = NEW.candidate_id FOR SHARE;
  IF candidate.community_id IS NOT NULL
    AND (
      batch.scope_category <> 'community_ai'
      OR batch.scope_community_id IS DISTINCT FROM candidate.community_id
    ) THEN
    RAISE EXCEPTION 'community classifier candidate scope must match its batch' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO prompt FROM classifier_prompt_versions
  WHERE id = NEW.prompt_version_id FOR SHARE;
  SELECT * INTO threshold FROM classifier_candidate_thresholds
  WHERE id = NEW.threshold_id FOR SHARE;
  IF threshold.id IS NULL
    OR threshold.classifier_id IS DISTINCT FROM NEW.classifier_id
    OR threshold.candidate_id IS DISTINCT FROM NEW.candidate_id
    OR threshold.prompt_version_id IS DISTINCT FROM NEW.prompt_version_id
    OR threshold.deactivated_at IS NOT NULL THEN
    RAISE EXCEPTION 'classifier batch candidate threshold must be its active configuration revision' USING ERRCODE = '23514';
  END IF;
  effective_lower := COALESCE(threshold.lower_threshold_override, prompt.default_lower_threshold);
  effective_upper := COALESCE(threshold.upper_threshold_override, prompt.default_upper_threshold);
  IF NEW.effective_lower_threshold IS DISTINCT FROM effective_lower
    OR NEW.effective_upper_threshold IS DISTINCT FROM effective_upper THEN
    RAISE EXCEPTION 'classifier batch candidate thresholds must match captured configuration' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trigger_classifier_decision_batch_candidates_configuration
  BEFORE INSERT ON classifier_decision_batch_candidates
  FOR EACH ROW EXECUTE FUNCTION fn_require_classifier_batch_candidate_configuration();

CREATE OR REPLACE TRIGGER trigger_classifier_decision_batch_candidates_append_only
  BEFORE UPDATE ON classifier_decision_batch_candidates
  FOR EACH ROW EXECUTE FUNCTION fn_reject_classifier_append_only_update();

CREATE OR REPLACE FUNCTION fn_require_classifier_batch_candidate_owner_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM classifier_decision_batches WHERE id = OLD.batch_id)
    AND EXISTS (SELECT 1 FROM classifier_candidates WHERE id = OLD.candidate_id) THEN
    RAISE EXCEPTION 'classifier batch candidate snapshots can only be deleted with their batch or candidate' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END $$;

CREATE OR REPLACE TRIGGER trigger_classifier_decision_batch_candidates_owner_delete
  BEFORE DELETE ON classifier_decision_batch_candidates
  FOR EACH ROW EXECUTE FUNCTION fn_require_classifier_batch_candidate_owner_delete();

CREATE TABLE IF NOT EXISTS classifier_decision_calls (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  batch_id UUID NOT NULL REFERENCES classifier_decision_batches ON DELETE CASCADE,
  shard_ordinal INTEGER NOT NULL CHECK (shard_ordinal >= 0),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_classifier_decision_calls__batch_ordinal UNIQUE (batch_id, shard_ordinal),
  CONSTRAINT uq_classifier_decision_calls__id__batch UNIQUE (id, batch_id)
);

CREATE OR REPLACE TRIGGER trigger_classifier_decision_calls_append_only
  BEFORE UPDATE ON classifier_decision_calls
  FOR EACH ROW EXECUTE FUNCTION fn_reject_classifier_append_only_update();

CREATE TABLE IF NOT EXISTS topic_classifier_results (
  topic_id UUID NOT NULL REFERENCES topics ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT uuidv7(),
  batch_id UUID NOT NULL,
  decision_call_id UUID NOT NULL,
  classifier_id UUID NOT NULL,
  candidate_kind classifier_candidate_kind NOT NULL DEFAULT 'topic'
    CHECK (candidate_kind = 'topic'),
  candidate_id UUID,
  threshold_id UUID,
  prompt_version_id UUID NOT NULL,
  probability NUMERIC NOT NULL CHECK (probability >= 0 AND probability <= 1),
  effective_lower_threshold NUMERIC(5,4) NOT NULL,
  effective_upper_threshold NUMERIC(5,4) NOT NULL,
  raw_response JSONB NOT NULL,
  scope_category TEXT NOT NULL,
  scope_community_id UUID,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (topic_id, id),
  CONSTRAINT chk_topic_classifier_results__scope CHECK (
    (scope_category = 'global' AND scope_community_id IS NULL)
    OR (scope_category = 'community_ai' AND scope_community_id IS NOT NULL)
  ),
  CONSTRAINT chk_topic_classifier_results__effective_thresholds CHECK (
    effective_lower_threshold >= 0 AND effective_upper_threshold <= 1
    AND effective_lower_threshold < effective_upper_threshold
  ),
  CONSTRAINT chk_topic_classifier_results__stored_configuration CHECK (
    (candidate_id IS NULL AND threshold_id IS NULL)
    OR (candidate_id IS NOT NULL AND threshold_id IS NOT NULL)
  ),
  CONSTRAINT fk_topic_classifier_results__classifier_kind
    FOREIGN KEY (classifier_id, candidate_kind)
    REFERENCES classifiers (id, candidate_kind) ON DELETE RESTRICT,
  CONSTRAINT fk_topic_classifier_results__candidate
    FOREIGN KEY (candidate_id, classifier_id, topic_id)
    REFERENCES classifier_candidates (id, classifier_id, topic_id) ON DELETE CASCADE,
  CONSTRAINT fk_topic_classifier_results__batch_candidate
    FOREIGN KEY (
      batch_id, candidate_id, classifier_id, prompt_version_id, threshold_id,
      effective_lower_threshold, effective_upper_threshold
    )
    REFERENCES classifier_decision_batch_candidates (
      batch_id, candidate_id, classifier_id, prompt_version_id, threshold_id,
      effective_lower_threshold, effective_upper_threshold
    ) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_topic_classifier_results__threshold
    FOREIGN KEY (threshold_id)
    REFERENCES classifier_candidate_thresholds (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_topic_classifier_results__batch_classifier
    FOREIGN KEY (batch_id, classifier_id)
    REFERENCES classifier_decision_batches (id, classifier_id) ON DELETE CASCADE,
  CONSTRAINT fk_topic_classifier_results__batch_prompt
    FOREIGN KEY (batch_id, prompt_version_id)
    REFERENCES classifier_decision_batches (id, prompt_version_id) ON DELETE CASCADE,
  CONSTRAINT fk_topic_classifier_results__batch_scope
    FOREIGN KEY (batch_id, scope_category, scope_community_id)
    REFERENCES classifier_decision_batches (id, scope_category, scope_community_id) ON DELETE CASCADE,
  CONSTRAINT fk_topic_classifier_results__call_batch
    FOREIGN KEY (decision_call_id, batch_id)
    REFERENCES classifier_decision_calls (id, batch_id) ON DELETE CASCADE
) PARTITION BY RANGE (topic_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_classifier_results__topic_batch
  ON topic_classifier_results (topic_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_topic_classifier_results__candidate_probability
  ON topic_classifier_results (candidate_id, probability, topic_id DESC);
CREATE INDEX IF NOT EXISTS idx_topic_classifier_results__batch
  ON topic_classifier_results (batch_id, topic_id DESC);
CREATE INDEX IF NOT EXISTS idx_topic_classifier_results__call_batch
  ON topic_classifier_results (decision_call_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_topic_classifier_results__classifier_kind
  ON topic_classifier_results (classifier_id, candidate_kind);
CREATE INDEX IF NOT EXISTS idx_topic_classifier_results__threshold
  ON topic_classifier_results (threshold_id, topic_id DESC);

CREATE TABLE IF NOT EXISTS classifier_topic_vote_applications (
  shared_actor_id UUID NOT NULL REFERENCES users ON DELETE RESTRICT,
  topic_id UUID NOT NULL REFERENCES topics ON DELETE CASCADE,
  post_id UUID REFERENCES posts ON DELETE CASCADE,
  rss_feed_item_id UUID REFERENCES rss_feed_items ON DELETE CASCADE,
  classifier_id UUID NOT NULL,
  prompt_version_id UUID NOT NULL,
  batch_id UUID NOT NULL,
  result_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_classifier_topic_vote_applications__actor_topic_subject
    UNIQUE NULLS NOT DISTINCT (shared_actor_id, topic_id, post_id, rss_feed_item_id),
  CONSTRAINT chk_classifier_topic_vote_applications__one_subject CHECK (
    num_nonnulls(post_id, rss_feed_item_id) = 1
  ),
  CONSTRAINT fk_classifier_topic_vote_applications__batch_classifier
    FOREIGN KEY (batch_id, classifier_id)
    REFERENCES classifier_decision_batches (id, classifier_id) ON DELETE CASCADE,
  CONSTRAINT fk_classifier_topic_vote_applications__batch_prompt
    FOREIGN KEY (batch_id, prompt_version_id)
    REFERENCES classifier_decision_batches (id, prompt_version_id) ON DELETE CASCADE,
  CONSTRAINT fk_classifier_topic_vote_applications__result
    FOREIGN KEY (topic_id, result_id)
    REFERENCES topic_classifier_results (topic_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_classifier_topic_vote_applications__batch
  ON classifier_topic_vote_applications (batch_id);
CREATE INDEX IF NOT EXISTS idx_classifier_topic_vote_applications__topic
  ON classifier_topic_vote_applications (topic_id);
CREATE INDEX IF NOT EXISTS idx_classifier_topic_vote_applications__post
  ON classifier_topic_vote_applications (post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classifier_topic_vote_applications__rss_feed_item
  ON classifier_topic_vote_applications (rss_feed_item_id) WHERE rss_feed_item_id IS NOT NULL;

CREATE OR REPLACE TRIGGER trigger_classifier_topic_vote_applications_updated_at
  BEFORE UPDATE ON classifier_topic_vote_applications
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE IF NOT EXISTS story_classifier_results (
  story_id UUID NOT NULL REFERENCES stories ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT uuidv7(),
  batch_id UUID NOT NULL,
  decision_call_id UUID NOT NULL,
  classifier_id UUID NOT NULL,
  candidate_kind classifier_candidate_kind NOT NULL DEFAULT 'story'
    CHECK (candidate_kind = 'story'),
  candidate_id UUID,
  threshold_id UUID,
  prompt_version_id UUID NOT NULL,
  probability NUMERIC NOT NULL CHECK (probability >= 0 AND probability <= 1),
  effective_lower_threshold NUMERIC(5,4) NOT NULL,
  effective_upper_threshold NUMERIC(5,4) NOT NULL,
  raw_response JSONB NOT NULL,
  scope_category TEXT NOT NULL,
  scope_community_id UUID,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (story_id, id),
  CONSTRAINT chk_story_classifier_results__scope CHECK (
    (scope_category = 'global' AND scope_community_id IS NULL)
    OR (scope_category = 'community_ai' AND scope_community_id IS NOT NULL)
  ),
  CONSTRAINT chk_story_classifier_results__effective_thresholds CHECK (
    effective_lower_threshold >= 0 AND effective_upper_threshold <= 1
    AND effective_lower_threshold < effective_upper_threshold
  ),
  CONSTRAINT chk_story_classifier_results__stored_configuration CHECK (
    (candidate_id IS NULL AND threshold_id IS NULL)
    OR (candidate_id IS NOT NULL AND threshold_id IS NOT NULL)
  ),
  CONSTRAINT fk_story_classifier_results__classifier_kind
    FOREIGN KEY (classifier_id, candidate_kind)
    REFERENCES classifiers (id, candidate_kind) ON DELETE RESTRICT,
  CONSTRAINT fk_story_classifier_results__candidate
    FOREIGN KEY (candidate_id, classifier_id, story_id)
    REFERENCES classifier_candidates (id, classifier_id, story_id) ON DELETE CASCADE,
  CONSTRAINT fk_story_classifier_results__batch_candidate
    FOREIGN KEY (
      batch_id, candidate_id, classifier_id, prompt_version_id, threshold_id,
      effective_lower_threshold, effective_upper_threshold
    )
    REFERENCES classifier_decision_batch_candidates (
      batch_id, candidate_id, classifier_id, prompt_version_id, threshold_id,
      effective_lower_threshold, effective_upper_threshold
    ) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_story_classifier_results__threshold
    FOREIGN KEY (threshold_id)
    REFERENCES classifier_candidate_thresholds (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_story_classifier_results__batch_classifier
    FOREIGN KEY (batch_id, classifier_id)
    REFERENCES classifier_decision_batches (id, classifier_id) ON DELETE CASCADE,
  CONSTRAINT fk_story_classifier_results__batch_prompt
    FOREIGN KEY (batch_id, prompt_version_id)
    REFERENCES classifier_decision_batches (id, prompt_version_id) ON DELETE CASCADE,
  CONSTRAINT fk_story_classifier_results__batch_scope
    FOREIGN KEY (batch_id, scope_category, scope_community_id)
    REFERENCES classifier_decision_batches (id, scope_category, scope_community_id) ON DELETE CASCADE,
  CONSTRAINT fk_story_classifier_results__call_batch
    FOREIGN KEY (decision_call_id, batch_id)
    REFERENCES classifier_decision_calls (id, batch_id) ON DELETE CASCADE
) PARTITION BY RANGE (story_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_story_classifier_results__story_batch
  ON story_classifier_results (story_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_story_classifier_results__candidate_probability
  ON story_classifier_results (candidate_id, probability, story_id DESC);
CREATE INDEX IF NOT EXISTS idx_story_classifier_results__batch
  ON story_classifier_results (batch_id, story_id DESC);
CREATE INDEX IF NOT EXISTS idx_story_classifier_results__call_batch
  ON story_classifier_results (decision_call_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_story_classifier_results__classifier_kind
  ON story_classifier_results (classifier_id, candidate_kind);
CREATE INDEX IF NOT EXISTS idx_story_classifier_results__threshold
  ON story_classifier_results (threshold_id, story_id DESC);

CREATE OR REPLACE FUNCTION fn_require_classifier_result_batch_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  batch classifier_decision_batches%ROWTYPE;
  candidate classifier_candidates%ROWTYPE;
  prompt classifier_prompt_versions%ROWTYPE;
  batch_candidate classifier_decision_batch_candidates%ROWTYPE;
  effective_lower NUMERIC(5,4);
  effective_upper NUMERIC(5,4);
BEGIN
  SELECT * INTO batch FROM classifier_decision_batches WHERE id = NEW.batch_id FOR SHARE;
  SELECT * INTO candidate FROM classifier_candidates WHERE id = NEW.candidate_id FOR SHARE;
  SELECT * INTO prompt FROM classifier_prompt_versions
  WHERE id = NEW.prompt_version_id FOR SHARE;
  IF NEW.candidate_id IS NOT NULL THEN
    SELECT * INTO batch_candidate FROM classifier_decision_batch_candidates
    WHERE batch_id = NEW.batch_id AND candidate_id = NEW.candidate_id
    FOR SHARE;
  END IF;
  IF NEW.scope_category IS DISTINCT FROM batch.scope_category
    OR NEW.scope_community_id IS DISTINCT FROM batch.scope_community_id THEN
    RAISE EXCEPTION 'classifier result scope must match its batch' USING ERRCODE = '23514';
  END IF;
  IF candidate.community_id IS NOT NULL
    AND (
      batch.scope_category <> 'community_ai'
      OR batch.scope_community_id IS DISTINCT FROM candidate.community_id
    ) THEN
    RAISE EXCEPTION 'community classifier candidate scope must match its owning community' USING ERRCODE = '23514';
  END IF;
  IF NEW.candidate_id IS NOT NULL AND batch_candidate.batch_id IS NULL THEN
    RETURN NEW;
  END IF;
  effective_lower := COALESCE(
    batch_candidate.effective_lower_threshold,
    prompt.default_lower_threshold
  );
  effective_upper := COALESCE(
    batch_candidate.effective_upper_threshold,
    prompt.default_upper_threshold
  );
  IF NEW.effective_lower_threshold IS DISTINCT FROM effective_lower
    OR NEW.effective_upper_threshold IS DISTINCT FROM effective_upper THEN
    RAISE EXCEPTION 'classifier result thresholds must match prompt and candidate configuration' USING ERRCODE = '23514';
  END IF;
  IF NEW.threshold_id IS DISTINCT FROM batch_candidate.threshold_id THEN
    RAISE EXCEPTION 'classifier result threshold revision must match its batch candidate snapshot' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trigger_topic_classifier_results_batch_scope
  BEFORE INSERT OR UPDATE OF batch_id, scope_category, scope_community_id ON topic_classifier_results
  FOR EACH ROW EXECUTE FUNCTION fn_require_classifier_result_batch_scope();

CREATE OR REPLACE TRIGGER trigger_story_classifier_results_batch_scope
  BEFORE INSERT OR UPDATE OF batch_id, scope_category, scope_community_id ON story_classifier_results
  FOR EACH ROW EXECUTE FUNCTION fn_require_classifier_result_batch_scope();

CREATE OR REPLACE TRIGGER trigger_topic_classifier_results_append_only
  BEFORE UPDATE ON topic_classifier_results
  FOR EACH ROW EXECUTE FUNCTION fn_reject_classifier_append_only_update();

CREATE OR REPLACE TRIGGER trigger_story_classifier_results_append_only
  BEFORE UPDATE ON story_classifier_results
  FOR EACH ROW EXECUTE FUNCTION fn_reject_classifier_append_only_update();

COMMENT ON TABLE classifiers IS 'Agent-independent classifier definitions with fixed primitive and candidate kind.';
COMMENT ON TABLE classifier_prompt_versions IS 'Immutable classifier prompt/model revisions; activation lifecycle remains mutable.';
COMMENT ON TABLE classifier_candidates IS 'Stored topic or story candidate identities, independent of prompt revisions.';
COMMENT ON TABLE classifier_candidate_thresholds IS 'Immutable per-candidate threshold revisions with an explicit deactivation lifecycle.';
COMMENT ON TABLE classifier_candidate_community_overrides IS 'Per-community enablement lifecycle for global classifier candidates.';
COMMENT ON TABLE classifier_decision_batch_candidates IS 'Immutable per-batch snapshots of stored candidate threshold configuration.';
COMMENT ON COLUMN classifier_decision_batch_candidates.batch_id IS 'Decision batch that captured this candidate configuration.';
COMMENT ON COLUMN classifier_decision_batch_candidates.classifier_id IS 'Classifier constrained to the owning batch and candidate.';
COMMENT ON COLUMN classifier_decision_batch_candidates.candidate_id IS 'Stored candidate included in the decision batch.';
COMMENT ON COLUMN classifier_decision_batch_candidates.prompt_version_id IS 'Prompt revision constrained to the owning decision batch.';
COMMENT ON COLUMN classifier_decision_batch_candidates.threshold_id IS 'Exact active threshold revision captured for this candidate.';
COMMENT ON COLUMN classifier_decision_batch_candidates.effective_lower_threshold IS 'Captured lower decision bound after prompt-default inheritance.';
COMMENT ON COLUMN classifier_decision_batch_candidates.effective_upper_threshold IS 'Captured upper decision bound after prompt-default inheritance.';
COMMENT ON TABLE classifier_decision_batches IS 'One classified post or RSS item decision, including scope provenance and prompt revision.';
COMMENT ON TABLE classifier_decision_calls IS 'Ordered shards for one classifier decision batch.';
COMMENT ON TABLE topic_classifier_results IS 'Per-candidate classifier results for topic candidates, RANGE-partitioned by topic_id.';
COMMENT ON TABLE story_classifier_results IS 'Per-candidate classifier results for story candidates, RANGE-partitioned by story_id.';

COMMENT ON COLUMN classifiers.slug IS 'Stable machine-readable classifier identifier.';
COMMENT ON COLUMN classifiers.primitive IS 'Structured-decision primitive used for every prompt version.';
COMMENT ON COLUMN classifiers.candidate_kind IS 'Concrete entity kind accepted as a candidate.';
COMMENT ON COLUMN classifiers.activated_at IS 'Time this classifier became active, or NULL when inactive.';
COMMENT ON COLUMN classifiers.deactivated_at IS 'Time this classifier became inactive, or NULL when not deactivated.';

COMMENT ON COLUMN classifier_prompt_versions.classifier_id IS 'Classifier whose immutable prompt revision this row records.';
COMMENT ON COLUMN classifier_prompt_versions.prompt IS 'Exact instruction text sent for this revision.';
COMMENT ON COLUMN classifier_prompt_versions.model_name IS 'Provider model identifier used by this revision.';
COMMENT ON COLUMN classifier_prompt_versions.model_provider IS 'Transport/provider identifier used by this revision.';
COMMENT ON COLUMN classifier_prompt_versions.default_lower_threshold IS 'Prompt-revision boundary below which a probability maps to downvote.';
COMMENT ON COLUMN classifier_prompt_versions.default_upper_threshold IS 'Prompt-revision boundary above which a probability maps to upvote.';
COMMENT ON COLUMN classifier_prompt_versions.activated_at IS 'Time this prompt revision became active, or NULL when inactive.';
COMMENT ON COLUMN classifier_prompt_versions.deactivated_at IS 'Time this prompt revision became inactive, or NULL when not deactivated.';

COMMENT ON COLUMN classifier_candidates.classifier_id IS 'Classifier that owns this stored candidate.';
COMMENT ON COLUMN classifier_candidates.candidate_kind IS 'Concrete candidate kind, constrained to the classifier kind.';
COMMENT ON COLUMN classifier_candidates.topic_id IS 'Topic candidate; mutually exclusive with story_id.';
COMMENT ON COLUMN classifier_candidates.story_id IS 'Story candidate; mutually exclusive with topic_id.';
COMMENT ON COLUMN classifier_candidates.community_id IS 'Owning community for a custom candidate, or NULL for a global candidate.';

COMMENT ON COLUMN classifier_candidate_thresholds.classifier_id IS 'Classifier copied from candidate and prompt for relational alignment.';
COMMENT ON COLUMN classifier_candidate_thresholds.candidate_id IS 'Stored candidate receiving prompt-revision-specific bounds.';
COMMENT ON COLUMN classifier_candidate_thresholds.prompt_version_id IS 'Prompt revision whose defaults the overrides inherit.';
COMMENT ON COLUMN classifier_candidate_thresholds.lower_threshold_override IS 'Candidate-specific lower boundary, or NULL to inherit the prompt revision default.';
COMMENT ON COLUMN classifier_candidate_thresholds.upper_threshold_override IS 'Candidate-specific upper boundary, or NULL to inherit the prompt revision default.';
COMMENT ON COLUMN classifier_candidate_thresholds.activated_at IS 'Time this immutable threshold revision became active.';
COMMENT ON COLUMN classifier_candidate_thresholds.deactivated_at IS 'Time this threshold revision was superseded, or NULL while active.';
COMMENT ON COLUMN classifier_candidate_thresholds.deactivated_by_id IS 'User who superseded this threshold revision, retained only while the user exists.';

COMMENT ON COLUMN classifier_candidate_community_overrides.community_id IS 'Community changing availability of a global candidate.';
COMMENT ON COLUMN classifier_candidate_community_overrides.candidate_id IS 'Global candidate whose availability is overridden.';
COMMENT ON COLUMN classifier_candidate_community_overrides.enabled_at IS 'Time the community enabled the candidate.';
COMMENT ON COLUMN classifier_candidate_community_overrides.enabled_by_id IS 'User who enabled the candidate, retained only while the user exists.';
COMMENT ON COLUMN classifier_candidate_community_overrides.disabled_at IS 'Time the override was disabled, or NULL while enabled.';
COMMENT ON COLUMN classifier_candidate_community_overrides.disabled_by_id IS 'User who disabled the override, retained only while the user exists.';

COMMENT ON COLUMN classifier_decision_batches.classifier_id IS 'Classifier used for this logical decision.';
COMMENT ON COLUMN classifier_decision_batches.prompt_version_id IS 'Exact prompt revision used for this logical decision.';
COMMENT ON COLUMN classifier_decision_batches.post_id IS 'Classified post subject; mutually exclusive with rss_feed_item_id.';
COMMENT ON COLUMN classifier_decision_batches.rss_feed_item_id IS 'Classified RSS item subject; mutually exclusive with post_id.';
COMMENT ON COLUMN classifier_decision_batches.scope_category IS 'Decision scope: global or community_ai.';
COMMENT ON COLUMN classifier_decision_batches.scope_community_id IS 'Immutable community provenance for community_ai scope; no FK so history survives community deletion.';

COMMENT ON COLUMN classifier_decision_calls.batch_id IS 'Logical decision batch containing this provider call.';
COMMENT ON COLUMN classifier_decision_calls.shard_ordinal IS 'Zero-based order of this context-window shard within its batch.';

COMMENT ON COLUMN topic_classifier_results.topic_id IS 'Topic candidate scored by this result and the partition key.';
COMMENT ON COLUMN topic_classifier_results.batch_id IS 'Logical decision batch that produced this result.';
COMMENT ON COLUMN topic_classifier_results.decision_call_id IS 'Specific provider call or shard that produced this result.';
COMMENT ON COLUMN topic_classifier_results.classifier_id IS 'Classifier copied from the owning batch for relational enforcement.';
COMMENT ON COLUMN topic_classifier_results.candidate_kind IS 'Fixed topic discriminator used only for the classifier-kind foreign key.';
COMMENT ON COLUMN topic_classifier_results.candidate_id IS 'Stored topic candidate scored by this result, or NULL for a runtime-prefiltered candidate.';
COMMENT ON COLUMN topic_classifier_results.threshold_id IS 'Exact stored-candidate threshold revision used, or NULL for a runtime-prefiltered candidate without stored configuration.';
COMMENT ON COLUMN topic_classifier_results.prompt_version_id IS 'Prompt revision copied from the owning batch for relational enforcement.';
COMMENT ON COLUMN topic_classifier_results.probability IS 'Native per-candidate probability preserved without threshold mapping.';
COMMENT ON COLUMN topic_classifier_results.effective_lower_threshold IS 'Resolved lower boundary used for this immutable decision result.';
COMMENT ON COLUMN topic_classifier_results.effective_upper_threshold IS 'Resolved upper boundary used for this immutable decision result.';
COMMENT ON COLUMN topic_classifier_results.raw_response IS 'Full native structured-decision answer for audit and diagnostics.';
COMMENT ON COLUMN topic_classifier_results.scope_category IS 'Decision scope copied from the owning batch.';
COMMENT ON COLUMN topic_classifier_results.scope_community_id IS 'Immutable community provenance copied from the owning batch.';

COMMENT ON COLUMN story_classifier_results.story_id IS 'Story candidate scored by this result and the partition key.';
COMMENT ON COLUMN story_classifier_results.batch_id IS 'Logical decision batch that produced this result.';
COMMENT ON COLUMN story_classifier_results.decision_call_id IS 'Specific provider call or shard that produced this result.';
COMMENT ON COLUMN story_classifier_results.classifier_id IS 'Classifier copied from the owning batch for relational enforcement.';
COMMENT ON COLUMN story_classifier_results.candidate_kind IS 'Fixed story discriminator used only for the classifier-kind foreign key.';
COMMENT ON COLUMN story_classifier_results.candidate_id IS 'Stored story candidate scored by this result, or NULL for a runtime-prefiltered candidate.';
COMMENT ON COLUMN story_classifier_results.threshold_id IS 'Exact stored-candidate threshold revision used, or NULL for a runtime-prefiltered candidate without stored configuration.';
COMMENT ON COLUMN story_classifier_results.prompt_version_id IS 'Prompt revision copied from the owning batch for relational enforcement.';
COMMENT ON COLUMN story_classifier_results.probability IS 'Native per-candidate probability preserved without threshold mapping.';
COMMENT ON COLUMN story_classifier_results.effective_lower_threshold IS 'Resolved lower boundary used for this immutable decision result.';
COMMENT ON COLUMN story_classifier_results.effective_upper_threshold IS 'Resolved upper boundary used for this immutable decision result.';
COMMENT ON COLUMN story_classifier_results.raw_response IS 'Full native structured-decision answer for audit and diagnostics.';
COMMENT ON COLUMN story_classifier_results.scope_category IS 'Decision scope copied from the owning batch.';
COMMENT ON COLUMN story_classifier_results.scope_community_id IS 'Immutable community provenance copied from the owning batch.';
