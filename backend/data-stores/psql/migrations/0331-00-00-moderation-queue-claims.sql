CREATE TABLE IF NOT EXISTS moderation_queue_claims (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  created_at    timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  community_id  uuid        NOT NULL REFERENCES communities ON DELETE CASCADE,
  -- Exactly one entity FK is set per row (enforced by CHECK constraint below).
  -- report_id references a moderation_reports row; post_id references a community_post_reviews row.
  report_id     uuid        REFERENCES moderation_reports ON DELETE CASCADE,
  post_id       uuid        REFERENCES posts ON DELETE CASCADE,
  claimed_by_id uuid        NOT NULL REFERENCES users ON DELETE CASCADE,
  -- claimed_at is a real (mutable) column because re-claim/takeover overwrites it.
  -- It must NOT be a virtual column derived from id, since the upsert updates it in place.
  claimed_at    timestamptz NOT NULL DEFAULT now(),
  released_at   timestamptz,
  CHECK (num_nonnulls(report_id, post_id) = 1)
);

COMMENT ON TABLE moderation_queue_claims IS 'Advisory claims on community moderation queue items. One live (un-released) claim per report or post-review; auto-expires after 15 minutes of inactivity (evaluated lazily at read time).';
COMMENT ON COLUMN moderation_queue_claims.community_id IS 'The community whose moderation queue this claim belongs to.';
COMMENT ON COLUMN moderation_queue_claims.report_id IS 'The moderation report being claimed. Mutually exclusive with post_id.';
COMMENT ON COLUMN moderation_queue_claims.post_id IS 'The community post review being claimed (keyed by post_id, the PK of community_post_reviews). Mutually exclusive with report_id.';
COMMENT ON COLUMN moderation_queue_claims.claimed_by_id IS 'The moderator who holds this claim.';
COMMENT ON COLUMN moderation_queue_claims.claimed_at IS 'When this claim was last set or renewed. Updated on re-claim or takeover of an expired claim.';
COMMENT ON COLUMN moderation_queue_claims.released_at IS 'When this claim was explicitly released. NULL means the claim is live (subject to the 15-minute inactivity window).';

-- One live (un-released) claim per item. Lazy 15-minute expiry is evaluated at read time
-- and in the upsert takeover predicate — NOT in the index predicate, since now() is not IMMUTABLE.
CREATE UNIQUE INDEX IF NOT EXISTS uq_modq_claims__active_report
  ON moderation_queue_claims (report_id)
  WHERE report_id IS NOT NULL AND released_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_modq_claims__active_post
  ON moderation_queue_claims (post_id)
  WHERE post_id IS NOT NULL AND released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_modq_claims__community
  ON moderation_queue_claims (community_id);

-- FK for conversations.moderation_report_id (column defined in 0110-00-00 without FK due to
-- table ordering; moderation_reports is created in 0330-00-00).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_conversations_moderation_report_id'
      AND conrelid = 'conversations'::regclass
  ) THEN
    ALTER TABLE conversations ADD CONSTRAINT fk_conversations_moderation_report_id
      FOREIGN KEY (moderation_report_id) REFERENCES moderation_reports(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE conversations VALIDATE CONSTRAINT fk_conversations_moderation_report_id;
