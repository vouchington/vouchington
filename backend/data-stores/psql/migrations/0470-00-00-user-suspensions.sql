-- edited-in-place: pre-launch, never deployed to production
-- guardrails: allow-alter-table
CREATE TABLE IF NOT EXISTS user_suspensions (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  suspended_by_id UUID REFERENCES users ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  lifted_at TIMESTAMPTZ,
  lifted_by_id UUID REFERENCES users ON DELETE SET NULL
);

CREATE OR REPLACE TRIGGER trigger_user_suspensions_updated_at
  BEFORE UPDATE ON user_suspensions FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- Multiple concurrent active suspensions per user are allowed (mirrors community_bans design).
-- lifted_at IS NULL means active; lifted_at IS NOT NULL means manually lifted.
CREATE INDEX IF NOT EXISTS idx_user_suspensions__user ON user_suspensions (user_id) WHERE lifted_at IS NULL;

COMMENT ON TABLE user_suspensions IS 'Append-only history of user suspensions. A user is suspended as long as any active row (lifted_at IS NULL) exists. NULL lifted_at means active. Canonical insert-then-cancel pattern; never UPDATE timestamps in place. See community_bans for reference.';
COMMENT ON COLUMN user_suspensions.user_id IS 'The suspended user.';
COMMENT ON COLUMN user_suspensions.suspended_by_id IS 'Admin who issued the suspension.';
COMMENT ON COLUMN user_suspensions.reason IS 'Optional reason shown to the user and recorded for moderation history.';
COMMENT ON COLUMN user_suspensions.lifted_at IS 'When the suspension was manually lifted. NULL means still active.';
COMMENT ON COLUMN user_suspensions.lifted_by_id IS 'Who lifted the suspension.';

-- FK from moderation_appeals to user_suspensions: wired here because user_suspensions is created after moderation_appeals.
ALTER TABLE moderation_appeals
  DROP CONSTRAINT IF EXISTS fk_moderation_appeals__user_suspension_id;

ALTER TABLE moderation_appeals
  ADD CONSTRAINT fk_moderation_appeals__user_suspension_id
    FOREIGN KEY (user_suspension_id)
    REFERENCES user_suspensions (id)
    ON DELETE CASCADE
    NOT VALID;

ALTER TABLE moderation_appeals
  VALIDATE CONSTRAINT fk_moderation_appeals__user_suspension_id;
