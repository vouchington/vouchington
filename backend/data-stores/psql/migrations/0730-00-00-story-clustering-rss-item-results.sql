-- C9: story-clustering Choice classifier. Standalone RSS feed items become bound Choice
-- criteria alongside existing-story criteria under the same 'story'-kind classifier (see
-- docs/requirements/content/reference-stories-clustering-algorithm.md and
-- https://github.com/vouchington/vouchington/issues/319#issuecomment-5844121413). This
-- table mirrors story_classifier_results (0635-00-00-classifiers.sql) column-for-column,
-- but standalone RSS item candidates are never stored/pre-registered rows in
-- classifier_candidates, so candidate_id/threshold_id are always NULL here and the
-- candidate-scoped foreign keys/indexes that only make sense for a stored candidate are
-- dropped rather than carried over unused.
CREATE TABLE IF NOT EXISTS rss_feed_item_classifier_results (
  rss_feed_item_id UUID NOT NULL REFERENCES rss_feed_items ON DELETE CASCADE,
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
  PRIMARY KEY (rss_feed_item_id, id),
  CONSTRAINT chk_rss_feed_item_classifier_results__scope CHECK (
    (scope_category = 'global' AND scope_community_id IS NULL)
    OR (scope_category = 'community_ai' AND scope_community_id IS NOT NULL)
  ),
  CONSTRAINT chk_rss_feed_item_classifier_results__effective_thresholds CHECK (
    effective_lower_threshold >= 0 AND effective_upper_threshold <= 1
    AND effective_lower_threshold < effective_upper_threshold
  ),
  CONSTRAINT chk_rss_feed_item_classifier_results__stored_configuration CHECK (
    candidate_id IS NULL AND threshold_id IS NULL
  ),
  CONSTRAINT fk_rss_feed_item_classifier_results__classifier_kind
    FOREIGN KEY (classifier_id, candidate_kind)
    REFERENCES classifiers (id, candidate_kind) ON DELETE RESTRICT,
  CONSTRAINT fk_rss_feed_item_classifier_results__batch_classifier
    FOREIGN KEY (batch_id, classifier_id)
    REFERENCES classifier_decision_batches (id, classifier_id) ON DELETE CASCADE,
  CONSTRAINT fk_rss_feed_item_classifier_results__batch_prompt
    FOREIGN KEY (batch_id, prompt_version_id)
    REFERENCES classifier_decision_batches (id, prompt_version_id) ON DELETE CASCADE,
  CONSTRAINT fk_rss_feed_item_classifier_results__batch_scope
    FOREIGN KEY (batch_id, scope_category, scope_community_id)
    REFERENCES classifier_decision_batches (id, scope_category, scope_community_id) ON DELETE CASCADE,
  CONSTRAINT fk_rss_feed_item_classifier_results__call_batch
    FOREIGN KEY (decision_call_id, batch_id)
    REFERENCES classifier_decision_calls (id, batch_id) ON DELETE CASCADE
) PARTITION BY RANGE (rss_feed_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rss_feed_item_classifier_results__item_batch
  ON rss_feed_item_classifier_results (rss_feed_item_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_rss_feed_item_classifier_results__batch
  ON rss_feed_item_classifier_results (batch_id, rss_feed_item_id DESC);
CREATE INDEX IF NOT EXISTS idx_rss_feed_item_classifier_results__call_batch
  ON rss_feed_item_classifier_results (decision_call_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_rss_feed_item_classifier_results__classifier_kind
  ON rss_feed_item_classifier_results (classifier_id, candidate_kind);

-- Shared with topic_classifier_results/story_classifier_results (0635-00-00-classifiers.sql);
-- both trigger functions already tolerate a NULL candidate_id (an existing, tested code path
-- for story_classifier_results' own optional stored-candidate columns) and are table-name
-- agnostic, so neither needs a CREATE OR REPLACE here.
CREATE OR REPLACE TRIGGER trigger_rss_feed_item_classifier_results_batch_scope
  BEFORE INSERT OR UPDATE OF batch_id, scope_category, scope_community_id
  ON rss_feed_item_classifier_results
  FOR EACH ROW EXECUTE FUNCTION fn_require_classifier_result_batch_scope();

CREATE OR REPLACE TRIGGER trigger_rss_feed_item_classifier_results_append_only
  BEFORE UPDATE ON rss_feed_item_classifier_results
  FOR EACH ROW EXECUTE FUNCTION fn_reject_classifier_append_only_update();

COMMENT ON TABLE rss_feed_item_classifier_results IS 'Per-candidate classifier results for standalone RSS feed item candidates, RANGE-partitioned by rss_feed_item_id.';

COMMENT ON COLUMN rss_feed_item_classifier_results.rss_feed_item_id IS 'Standalone RSS feed item candidate scored by this result and the partition key.';
COMMENT ON COLUMN rss_feed_item_classifier_results.batch_id IS 'Logical decision batch that produced this result.';
COMMENT ON COLUMN rss_feed_item_classifier_results.decision_call_id IS 'Specific provider call or shard that produced this result.';
COMMENT ON COLUMN rss_feed_item_classifier_results.classifier_id IS 'Classifier copied from the owning batch for relational enforcement.';
COMMENT ON COLUMN rss_feed_item_classifier_results.candidate_kind IS 'Fixed story discriminator used only for the classifier-kind foreign key; the table itself, not this column, marks a row as a standalone-item candidate.';
COMMENT ON COLUMN rss_feed_item_classifier_results.candidate_id IS 'Always NULL: standalone RSS feed item candidates are never stored/pre-registered candidates.';
COMMENT ON COLUMN rss_feed_item_classifier_results.threshold_id IS 'Always NULL: standalone RSS feed item candidates have no stored threshold configuration.';
COMMENT ON COLUMN rss_feed_item_classifier_results.prompt_version_id IS 'Prompt revision copied from the owning batch for relational enforcement.';
COMMENT ON COLUMN rss_feed_item_classifier_results.probability IS 'Native per-candidate probability preserved without threshold mapping.';
COMMENT ON COLUMN rss_feed_item_classifier_results.effective_lower_threshold IS 'Resolved lower boundary used for this immutable decision result.';
COMMENT ON COLUMN rss_feed_item_classifier_results.effective_upper_threshold IS 'Resolved upper boundary used for this immutable decision result.';
COMMENT ON COLUMN rss_feed_item_classifier_results.raw_response IS 'Full native structured-decision answer for audit and diagnostics.';
COMMENT ON COLUMN rss_feed_item_classifier_results.scope_category IS 'Decision scope copied from the owning batch.';
COMMENT ON COLUMN rss_feed_item_classifier_results.scope_community_id IS 'Immutable community provenance copied from the owning batch.';
