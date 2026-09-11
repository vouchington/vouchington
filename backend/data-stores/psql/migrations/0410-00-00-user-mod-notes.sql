CREATE TABLE IF NOT EXISTS user_mod_notes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  -- guardrails-disable-next-line uuid-must-be-key
  target_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- guardrails-disable-next-line uuid-must-be-key
  author_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- guardrails-disable-next-line uuid-must-be-key
  community_id uuid REFERENCES communities (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 2000),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_mod_notes__target__id
  ON user_mod_notes (target_user_id, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_mod_notes__target__community
  ON user_mod_notes (target_user_id, community_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_mod_notes__author_user_id
  ON user_mod_notes (author_user_id);

CREATE INDEX IF NOT EXISTS idx_user_mod_notes__community_id
  ON user_mod_notes (community_id);

COMMENT ON TABLE user_mod_notes IS 'Private moderator notes on a user. community_id NULL = global/site-level note.';
COMMENT ON COLUMN user_mod_notes.target_user_id IS 'The user the note is about.';
COMMENT ON COLUMN user_mod_notes.author_user_id IS 'Moderator who wrote the note.';
COMMENT ON COLUMN user_mod_notes.community_id IS 'Community scope; NULL means a global/site-level note visible only to site moderation staff.';
COMMENT ON COLUMN user_mod_notes.body IS 'Note text, max 2000 chars.';
COMMENT ON COLUMN user_mod_notes.deleted_at IS 'When set, the note is soft-deleted.';
