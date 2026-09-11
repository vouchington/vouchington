-- edited-in-place: pre-launch, never deployed to production
CREATE TABLE IF NOT EXISTS post_locks (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts ON DELETE CASCADE,
  locked_by_id UUID REFERENCES users ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  lifted_at TIMESTAMPTZ,
  lifted_by_id UUID REFERENCES users ON DELETE SET NULL
);

CREATE OR REPLACE TRIGGER trigger_post_locks_updated_at
  BEFORE UPDATE ON post_locks FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_post_locks__post ON post_locks (post_id) WHERE lifted_at IS NULL;

COMMENT ON TABLE post_locks IS 'Append-only history of post locks. A post is locked as long as any active row (lifted_at IS NULL) exists. Prevents new replies. Canonical insert-then-cancel pattern. See community_bans for reference.';
COMMENT ON COLUMN post_locks.post_id IS 'The locked post.';
COMMENT ON COLUMN post_locks.locked_by_id IS 'Moderator or author who locked the post.';
COMMENT ON COLUMN post_locks.reason IS 'Optional reason for the lock.';
COMMENT ON COLUMN post_locks.lifted_at IS 'When the lock was lifted. NULL means still active.';
COMMENT ON COLUMN post_locks.lifted_by_id IS 'Who lifted the lock.';
