-- Shared fixed-classifier run lifecycle: one receipt per classifier, subject, content and
-- configuration identity, plus the durable request that makes a subject recoverable by the sweep
-- before any receipt exists. C3 batches retain remote results; C4 retains votes. Remote work
-- reserves its real C3 batch and exact candidate snapshots before provider execution.
--
-- The table is unpartitioned: a unique index on a partitioned table must include the partition key,
-- and the identity index below is per subject kind.

CREATE TABLE IF NOT EXISTS classifier_runs (
  id UUID NOT NULL DEFAULT uuidv7(),
  classifier_id UUID NOT NULL REFERENCES classifiers (id) ON DELETE RESTRICT,
  post_id UUID REFERENCES posts (id) ON DELETE CASCADE,
  rss_feed_item_id UUID REFERENCES rss_feed_items (id) ON DELETE CASCADE,
  input_sha256 BYTEA NOT NULL CHECK (OCTET_LENGTH(input_sha256) = 32),
  configuration_json JSONB NOT NULL CHECK (jsonb_typeof(configuration_json) = 'object'),
  configuration_sha256 BYTEA NOT NULL CHECK (
    OCTET_LENGTH(configuration_sha256) = 32
    AND configuration_sha256 = digest(configuration_json::text, 'sha256')
  ),
  shared_actor_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  community_identity_id UUID REFERENCES post_publication_community_identities (id) ON DELETE RESTRICT,
  decision_batch_id UUID,
  provider_attempts_started INTEGER NOT NULL DEFAULT 0 CHECK (provider_attempts_started >= 0),
  sweep_enqueue_count INTEGER NOT NULL DEFAULT 0 CHECK (sweep_enqueue_count >= 0),
  terminal_failure_kind TEXT CHECK (
    terminal_failure_kind IN (
      'provider-error', 'invalid-result', 'context-rejected', 'attempts-exhausted',
      'client-unavailable', 'sweep-bound-exceeded'
    )
  ),
  terminal_failed_at TIMESTAMPTZ,
  lease_token UUID,
  leased_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  outcomes_persisted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_classifier_runs PRIMARY KEY (id),
  CONSTRAINT chk_classifier_runs__one_subject CHECK (num_nonnulls(post_id, rss_feed_item_id) = 1),
  CONSTRAINT chk_classifier_runs__community_identity
    CHECK (community_identity_id IS NULL OR post_id IS NOT NULL),
  CONSTRAINT uq_classifier_runs__decision_batch UNIQUE (decision_batch_id),
  CONSTRAINT chk_classifier_runs__terminal_failure
    CHECK (
      (terminal_failure_kind IS NULL) = (terminal_failed_at IS NULL)
      AND (terminal_failed_at IS NULL OR completed_at IS NULL)
    ),
  CONSTRAINT chk_classifier_runs__lease
    CHECK (
      (lease_token IS NULL) = (leased_at IS NULL)
      AND (lease_token IS NULL) = (lease_expires_at IS NULL)
      AND (leased_at IS NULL OR lease_expires_at > leased_at)
      AND (completed_at IS NULL OR lease_token IS NULL)
      AND (terminal_failed_at IS NULL OR lease_token IS NULL)
      AND (superseded_at IS NULL OR lease_token IS NULL)
    ),
  CONSTRAINT chk_classifier_runs__phases
    CHECK (
      completed_at IS NULL
      OR (outcomes_persisted_at IS NOT NULL AND outcomes_persisted_at <= completed_at)
    )
);

-- One receipt per classifier, subject, content and configuration identity. Kept per subject kind
-- so each index is a plain unique btree over concrete columns.
CREATE UNIQUE INDEX IF NOT EXISTS uq_classifier_runs__identity_post
  ON classifier_runs (classifier_id, post_id, input_sha256, configuration_sha256)
  WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_classifier_runs__identity_rss_feed_item
  ON classifier_runs (classifier_id, rss_feed_item_id, input_sha256, configuration_sha256)
  WHERE rss_feed_item_id IS NOT NULL;

-- The batch table is defined by C2/C3, so add and validate its concrete same-classifier and
-- same-subject FKs here. A NULL subject column skips its composite FK (MATCH SIMPLE).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_classifier_runs__batch_classifier'
  ) THEN
    ALTER TABLE classifier_runs
      ADD CONSTRAINT fk_classifier_runs__batch_classifier
      FOREIGN KEY (decision_batch_id, classifier_id)
      REFERENCES classifier_decision_batches (id, classifier_id)
      ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_classifier_runs__batch_post'
  ) THEN
    ALTER TABLE classifier_runs
      ADD CONSTRAINT fk_classifier_runs__batch_post
      FOREIGN KEY (decision_batch_id, post_id)
      REFERENCES classifier_decision_batches (id, post_id)
      ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_classifier_runs__batch_rss_feed_item'
  ) THEN
    ALTER TABLE classifier_runs
      ADD CONSTRAINT fk_classifier_runs__batch_rss_feed_item
      FOREIGN KEY (decision_batch_id, rss_feed_item_id)
      REFERENCES classifier_decision_batches (id, rss_feed_item_id)
      ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED NOT VALID;
  END IF;
END $$;
ALTER TABLE classifier_runs VALIDATE CONSTRAINT fk_classifier_runs__batch_classifier;
ALTER TABLE classifier_runs VALIDATE CONSTRAINT fk_classifier_runs__batch_post;
ALTER TABLE classifier_runs VALIDATE CONSTRAINT fk_classifier_runs__batch_rss_feed_item;

CREATE INDEX IF NOT EXISTS idx_classifier_runs__classifier
  ON classifier_runs (classifier_id, id);
CREATE INDEX IF NOT EXISTS idx_classifier_runs__post
  ON classifier_runs (post_id, id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classifier_runs__rss_feed_item
  ON classifier_runs (rss_feed_item_id, id) WHERE rss_feed_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classifier_runs__shared_actor
  ON classifier_runs (shared_actor_id);
CREATE INDEX IF NOT EXISTS idx_classifier_runs__community_identity
  ON classifier_runs (community_identity_id, id) WHERE community_identity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classifier_runs__recoverable
  ON classifier_runs (id)
  WHERE completed_at IS NULL AND superseded_at IS NULL AND terminal_failed_at IS NULL;

-- The usage ledger (0490) is created earlier, so add and validate its run attribution FK here. A
-- deleted run leaves its cost rows in place: the ledger is a financial record, not run state.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_usage_records__classifier_run'
  ) THEN
    ALTER TABLE ai_usage_records
      ADD CONSTRAINT fk_ai_usage_records__classifier_run
      FOREIGN KEY (classifier_run_id) REFERENCES classifier_runs (id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
ALTER TABLE ai_usage_records VALIDATE CONSTRAINT fk_ai_usage_records__classifier_run;

CREATE TABLE IF NOT EXISTS classifier_run_requests (
  id UUID NOT NULL DEFAULT uuidv7(),
  classifier_id UUID NOT NULL REFERENCES classifiers (id) ON DELETE RESTRICT,
  post_id UUID REFERENCES posts (id) ON DELETE CASCADE,
  rss_feed_item_id UUID REFERENCES rss_feed_items (id) ON DELETE CASCADE,
  input_sha256 BYTEA NOT NULL CHECK (OCTET_LENGTH(input_sha256) = 32),
  run_id UUID REFERENCES classifier_runs (id) ON DELETE SET NULL,
  no_work_at TIMESTAMPTZ,
  stale_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_classifier_run_requests PRIMARY KEY (id),
  CONSTRAINT chk_classifier_run_requests__one_subject
    CHECK (num_nonnulls(post_id, rss_feed_item_id) = 1),
  CONSTRAINT chk_classifier_run_requests__one_settlement
    CHECK (num_nonnulls(run_id, no_work_at, stale_at) <= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_classifier_run_requests__identity_post
  ON classifier_run_requests (classifier_id, post_id, input_sha256)
  WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_classifier_run_requests__identity_rss_feed_item
  ON classifier_run_requests (classifier_id, rss_feed_item_id, input_sha256)
  WHERE rss_feed_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classifier_run_requests__classifier
  ON classifier_run_requests (classifier_id, id);
CREATE INDEX IF NOT EXISTS idx_classifier_run_requests__post
  ON classifier_run_requests (post_id, id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classifier_run_requests__rss_feed_item
  ON classifier_run_requests (rss_feed_item_id, id) WHERE rss_feed_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classifier_run_requests__run
  ON classifier_run_requests (run_id, id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classifier_run_requests__pending
  ON classifier_run_requests (id)
  WHERE run_id IS NULL AND no_work_at IS NULL AND stale_at IS NULL;

-- The candidate set a run captured once when it was reserved: C6's topics, or C9's stories and
-- standalone RSS items. The set is deliberately outside the run identity, so a later search that
-- finds different candidates can only reuse this receipt. One nullable foreign key per candidate
-- kind keeps every id a real relation; exactly one is set per row.
CREATE TABLE IF NOT EXISTS classifier_run_candidates (
  run_id UUID NOT NULL REFERENCES classifier_runs (id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics (id) ON DELETE CASCADE,
  story_id UUID REFERENCES stories (id) ON DELETE CASCADE,
  rss_feed_item_id UUID REFERENCES rss_feed_items (id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  CONSTRAINT pk_classifier_run_candidates PRIMARY KEY (run_id, ordinal),
  CONSTRAINT ck_classifier_run_candidates__one_candidate
    CHECK (num_nonnulls(topic_id, story_id, rss_feed_item_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_classifier_run_candidates__topic
  ON classifier_run_candidates (run_id, topic_id) WHERE topic_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_classifier_run_candidates__story
  ON classifier_run_candidates (run_id, story_id) WHERE story_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_classifier_run_candidates__rss_feed_item
  ON classifier_run_candidates (run_id, rss_feed_item_id) WHERE rss_feed_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_classifier_run_candidates__topic
  ON classifier_run_candidates (topic_id, run_id) WHERE topic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classifier_run_candidates__story
  ON classifier_run_candidates (story_id, run_id) WHERE story_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classifier_run_candidates__rss_feed_item
  ON classifier_run_candidates (rss_feed_item_id, run_id) WHERE rss_feed_item_id IS NOT NULL;

-- C5's local detector outcome, retained once per run so every terminal kind can keep it.
CREATE TABLE IF NOT EXISTS post_classifier_local_outcomes (
  run_id UUID NOT NULL REFERENCES classifier_runs (id) ON DELETE CASCADE,
  local_topic_id UUID NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  flagged BOOLEAN NOT NULL,
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  confidence_score DOUBLE PRECISION NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  confidence_threshold DOUBLE PRECISION NOT NULL CHECK (confidence_threshold BETWEEN 0 AND 1),
  classification TEXT NOT NULL CHECK (classification IN ('ai', 'human')),
  detector TEXT NOT NULL CHECK (btrim(detector) <> ''),
  detector_model_version TEXT NOT NULL CHECK (btrim(detector_model_version) <> ''),
  CONSTRAINT pk_post_classifier_local_outcomes PRIMARY KEY (run_id)
);

CREATE INDEX IF NOT EXISTS idx_post_classifier_local_outcomes__local_topic
  ON post_classifier_local_outcomes (local_topic_id, run_id);

COMMENT ON TABLE classifier_runs IS
  'One classifier/subject/content/configuration run receipt shared by every fixed classifier; C3 and C4 retain remote results and votes.';
COMMENT ON COLUMN classifier_runs.classifier_id IS
  'Fixed classifier that owns this run; its adapter supplies input building and outcome application only.';
COMMENT ON COLUMN classifier_runs.post_id IS
  'Post subject whose approved content is classified; deleting the post removes its run receipts. Exactly one subject column is set.';
COMMENT ON COLUMN classifier_runs.rss_feed_item_id IS
  'RSS feed item subject classified by the run; deleting the item removes its run receipts. Exactly one subject column is set.';
COMMENT ON COLUMN classifier_runs.input_sha256 IS
  'Subject content digest used to fence stale classification effects.';
COMMENT ON COLUMN classifier_runs.configuration_json IS
  'PostgreSQL-canonical JSONB replay envelope preserving question array order; relational facts are materialized in sibling typed columns.';
COMMENT ON COLUMN classifier_runs.configuration_sha256 IS
  'SHA256 of the PostgreSQL JSONB text representation, identifying the exact replay configuration.';
COMMENT ON COLUMN classifier_runs.shared_actor_id IS
  'Shared classifier system user attributing automatic topic votes and tags.';
COMMENT ON COLUMN classifier_runs.community_identity_id IS
  'Concrete retained community provenance identity for post subjects; its live community link may be cleared on deletion.';
COMMENT ON COLUMN classifier_runs.decision_batch_id IS
  'Concrete same-subject C3 batch reserved before provider execution; NULL for local-only work.';
COMMENT ON COLUMN classifier_runs.provider_attempts_started IS
  'Physical provider calls started under lease; effect-only retries and committed-result replay do not increment it.';
COMMENT ON COLUMN classifier_runs.sweep_enqueue_count IS
  'Recovery-sweep enqueues that actually added a job for this run; monotone and bounded, and a run at the bound is made terminal once its last job is gone.';
COMMENT ON COLUMN classifier_runs.terminal_failure_kind IS
  'Durable reason the run stopped for good; client-unavailable means the provider client could not be built, sweep-bound-exceeded means the recovery sweep re-enqueued the run its bounded number of times.';
COMMENT ON COLUMN classifier_runs.terminal_failed_at IS
  'Time the run became terminal for this content and configuration identity; a terminal run is never dispatched again.';
COMMENT ON COLUMN classifier_runs.lease_token IS
  'Opaque fencing token for the current exclusive claimant; rotated on transfer and unrelated to any durable entity.';
COMMENT ON COLUMN classifier_runs.leased_at IS
  'Start of the current exclusive run claim.';
COMMENT ON COLUMN classifier_runs.lease_expires_at IS
  'Deadline after which another worker may replace the current claim.';
COMMENT ON COLUMN classifier_runs.outcomes_persisted_at IS
  'Time the complete configured outcomes became durable and eligible for effect application.';
COMMENT ON COLUMN classifier_runs.completed_at IS
  'Time all durable effects completed atomically and the exclusive claim was released.';
COMMENT ON COLUMN classifier_runs.superseded_at IS
  'Current obsolete-run marker; cleared when the exact subject content/configuration identity becomes current again. Outcomes and attempt budget remain immutable.';

COMMENT ON TABLE classifier_run_requests IS
  'Durable per-subject request for a classifier run, written in the same transaction as the fact that makes a subject eligible so the sweep can recover a subject that never got a run receipt; independent of classifier configuration.';
COMMENT ON COLUMN classifier_run_requests.classifier_id IS
  'Fixed classifier the subject is requested for.';
COMMENT ON COLUMN classifier_run_requests.post_id IS
  'Post subject of the request; deleting the post removes the request. Exactly one subject column is set.';
COMMENT ON COLUMN classifier_run_requests.rss_feed_item_id IS
  'RSS feed item subject of the request; deleting the item removes the request. Exactly one subject column is set.';
COMMENT ON COLUMN classifier_run_requests.input_sha256 IS
  'Subject content digest current when the request was written; a request settles once per content version.';
COMMENT ON COLUMN classifier_run_requests.run_id IS
  'Run receipt reserved for the request; NULL while unsettled, and cleared again if the run is deleted so the sweep recovers it.';
COMMENT ON COLUMN classifier_run_requests.no_work_at IS
  'Time the classifier resolved to no configured work for the subject; a settled request is not swept again until a new approval re-arms it.';
COMMENT ON COLUMN classifier_run_requests.stale_at IS
  'Time the request was superseded by a newer content version of the same subject.';

COMMENT ON TABLE classifier_run_candidates IS
  'Insert-only candidate set a run captured when it was reserved (topics, or stories and standalone RSS items); outside the run identity, so a changed search result never creates a second receipt.';
COMMENT ON COLUMN classifier_run_candidates.run_id IS
  'Run whose remote decision covers exactly these candidates; the set is removed with the run.';
COMMENT ON COLUMN classifier_run_candidates.topic_id IS
  'Topic candidate asked about in the run''s single provider call; a topic removed from the platform leaves the set with it. Exactly one candidate column is set.';
COMMENT ON COLUMN classifier_run_candidates.story_id IS
  'Story candidate asked about in the run''s single provider call; a story removed from the platform leaves the set with it. Exactly one candidate column is set.';
COMMENT ON COLUMN classifier_run_candidates.rss_feed_item_id IS
  'Standalone RSS item candidate asked about in the run''s single provider call; an item removed from the platform leaves the set with it. Exactly one candidate column is set.';
COMMENT ON COLUMN classifier_run_candidates.ordinal IS
  'Zero-based position of the candidate in the captured candidate order, preserved for deterministic question order.';

COMMENT ON TABLE post_classifier_local_outcomes IS
  'Insert-only C5 local detector outcome retained once per run, including runs that ended terminal before their remote outcomes became durable.';
COMMENT ON COLUMN post_classifier_local_outcomes.run_id IS
  'Run that produced this local detector outcome; the outcome is removed with the run.';
COMMENT ON COLUMN post_classifier_local_outcomes.local_topic_id IS
  'Concrete local detector topic relationship the outcome applies to; the outcome is removed with the topic.';
COMMENT ON COLUMN post_classifier_local_outcomes.flagged IS
  'Local detector decision retained unchanged for retry-safe topic application.';
COMMENT ON COLUMN post_classifier_local_outcomes.reason IS
  'Explanation returned by the local AI-generated detector.';
COMMENT ON COLUMN post_classifier_local_outcomes.confidence_score IS
  'Local detector confidence, bounded to the inclusive zero-to-one interval.';
COMMENT ON COLUMN post_classifier_local_outcomes.confidence_threshold IS
  'Pinned local detector confidence boundary used for this decision.';
COMMENT ON COLUMN post_classifier_local_outcomes.classification IS
  'Local detector classification of the content as AI-generated or human-written.';
COMMENT ON COLUMN post_classifier_local_outcomes.detector IS
  'Local detector identifier retained with its complete outcome.';
COMMENT ON COLUMN post_classifier_local_outcomes.detector_model_version IS
  'Local detector model version returned with this outcome.';
