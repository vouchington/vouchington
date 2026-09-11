-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
DO $$ BEGIN
  CREATE TYPE moderation_media_reveal_surfaces AS ENUM (
    'mod_queue',
    'review_queue',
    'reports',
    'post_page'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS moderation_media_reveals (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  created_at    timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  -- guardrails-disable-next-line uuid-must-be-key
  moderator_id  uuid        REFERENCES users (id) ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  post_id       uuid        REFERENCES posts (id) ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  report_id     uuid        REFERENCES moderation_reports (id) ON DELETE SET NULL,
  surface       moderation_media_reveal_surfaces NOT NULL,
  -- revealed_at is a real (mutable) column used for time-window counting.
  -- It must NOT be a virtual column derived from id, since queries filter by this range.
  revealed_at   timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_moderation_media_reveals__moderator_revealed
  ON moderation_media_reveals (moderator_id, revealed_at DESC);

COMMENT ON TABLE moderation_media_reveals IS 'Append-only log of disturbing-media reveals by moderators. Used to count session exposure and trigger cooldown prompts.';

COMMENT ON COLUMN moderation_media_reveals.created_at IS 'Row insertion time derived from the UUIDv7 id; used for schema convention only. Windowed queries use revealed_at.';

COMMENT ON COLUMN moderation_media_reveals.moderator_id IS 'Moderator who revealed the media (ON DELETE SET NULL for audit persistence).';

COMMENT ON COLUMN moderation_media_reveals.post_id IS 'Post whose media was revealed. NULL for report-entity reveals without a direct post.';

COMMENT ON COLUMN moderation_media_reveals.report_id IS 'Report entity being reviewed when media was revealed. NULL for direct post reveals.';

COMMENT ON COLUMN moderation_media_reveals.surface IS 'Queue surface where the reveal occurred: mod_queue (community queue), review_queue (admin review), reports (reports UI), post_page (public post page in mod context).';

COMMENT ON COLUMN moderation_media_reveals.revealed_at IS 'When the moderator clicked to reveal the media. Real column (not virtual) for time-window range queries.';

COMMENT ON COLUMN moderation_media_reveals.metadata IS 'Structured context (e.g. community_id, image_id).';
