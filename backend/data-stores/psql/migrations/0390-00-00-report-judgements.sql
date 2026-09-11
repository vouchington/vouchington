-- edited-in-place: pre-launch, never deployed to production
DO $$
BEGIN
  CREATE TYPE moderation_judgement_action AS ENUM ('no_action', 'warn', 'remove', 'escalate');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- AI-generated judgements on reported entities. Exactly one entity FK is set per row.
-- post_id covers both posts and comments (distinguished by posts.post_type).
CREATE TABLE IF NOT EXISTS moderation_report_judgements (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  post_id          uuid REFERENCES posts(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  hostname_id      uuid REFERENCES url_hostnames(id) ON DELETE CASCADE,
  rss_feed_item_id uuid REFERENCES rss_feed_items(id) ON DELETE CASCADE,
  -- guardrails-disable-next-line uuid-must-be-key
  case_id uuid REFERENCES moderation_cases (id) ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  triggering_report_id uuid REFERENCES moderation_reports (id) ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  rerun_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  recommended_action moderation_judgement_action NOT NULL,
  public_response text NOT NULL,
  internal_response text NOT NULL,
  model text NOT NULL,
  context_hash text,
  context_report_count integer,
  context_note_hash text,
  context_max_reason_rank integer,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  dispatched_at timestamptz,
  CHECK (num_nonnulls(post_id, reported_user_id, hostname_id, rss_feed_item_id) = 1)
);

-- Per-entity lookup (most-recent judgement per entity)
CREATE INDEX IF NOT EXISTS idx_moderation_report_judgements_post_id
  ON moderation_report_judgements (post_id, id DESC) WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_report_judgements_user_id
  ON moderation_report_judgements (reported_user_id, id DESC) WHERE reported_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_report_judgements_hostname_id
  ON moderation_report_judgements (hostname_id, id DESC) WHERE hostname_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_report_judgements_rss_id
  ON moderation_report_judgements (rss_feed_item_id, id DESC) WHERE rss_feed_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_report_judgements_case_id
  ON moderation_report_judgements (case_id) WHERE case_id IS NOT NULL;

COMMENT ON TABLE moderation_report_judgements IS 'AI-generated judgements on reported entities recommending a moderation action.';
COMMENT ON COLUMN moderation_report_judgements.post_id IS 'Judged post or comment; set when entity is a post or comment.';
COMMENT ON COLUMN moderation_report_judgements.reported_user_id IS 'Judged user; set when entity is a user.';
COMMENT ON COLUMN moderation_report_judgements.hostname_id IS 'Judged URL hostname; set when entity is url_hostname.';
COMMENT ON COLUMN moderation_report_judgements.rss_feed_item_id IS 'Judged RSS feed item; set when entity is rss_feed_item.';
COMMENT ON COLUMN moderation_report_judgements.triggering_report_id IS 'The moderation report that triggered this judgement run, if any.';
COMMENT ON COLUMN moderation_report_judgements.rerun_by_id IS 'Moderator who requested a re-run of the judgement, if applicable.';
COMMENT ON COLUMN moderation_report_judgements.recommended_action IS 'AI-recommended moderation action.';
COMMENT ON COLUMN moderation_report_judgements.public_response IS 'Public-facing explanation of the judgement.';
COMMENT ON COLUMN moderation_report_judgements.internal_response IS 'Internal reasoning visible to staff only.';
COMMENT ON COLUMN moderation_report_judgements.model IS 'OpenAI model used for this judgement.';
COMMENT ON COLUMN moderation_report_judgements.case_id IS 'The moderation case this judgement belongs to, if any.';
COMMENT ON COLUMN moderation_report_judgements.context_hash IS 'Hash of the bounded report context used to generate this judgement.';
COMMENT ON COLUMN moderation_report_judgements.context_report_count IS 'Total number of reports on the judged entity when this judgement was generated.';
COMMENT ON COLUMN moderation_report_judgements.context_note_hash IS 'Hash of report notes in the bounded context, used for refresh decisions.';
COMMENT ON COLUMN moderation_report_judgements.context_max_reason_rank IS 'Highest report reason severity rank in the bounded context when this judgement was generated.';
COMMENT ON COLUMN moderation_report_judgements.dispatched_at IS 'Timestamp when auto-dispatch successfully processed this judgement. NULL means not yet dispatched or auto-dispatch is disabled.';

-- Partial index for the reconciler: find judgements not yet dispatched that need re-enqueueing.
-- Indexes the real id column (created_at is a VIRTUAL generated column and cannot be indexed).
CREATE INDEX IF NOT EXISTS idx_moderation_report_judgements_undispatched
  ON moderation_report_judgements (id)
  WHERE dispatched_at IS NULL AND rerun_by_id IS NULL;
