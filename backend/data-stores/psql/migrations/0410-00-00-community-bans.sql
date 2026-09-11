-- edited-in-place: pre-launch, never deployed to production
CREATE TABLE IF NOT EXISTS community_bans (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  banned_by_id UUID REFERENCES users ON DELETE SET NULL,
  reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  lifted_at TIMESTAMPTZ,
  lifted_by_id UUID REFERENCES users ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  case_id UUID NOT NULL REFERENCES moderation_cases (id) ON DELETE CASCADE
);

CREATE OR REPLACE TRIGGER trigger_community_bans_updated_at
  BEFORE UPDATE ON community_bans FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- Not-lifted bans (active or naturally expired) are looked up by (community_id, user_id). This is
-- intentionally NOT a unique index: multiple active bans per user are allowed (e.g. a re-ban on an
-- already-active user inserts a second row). Naturally expired bans (lifted_at IS NULL, expires_at
-- in the past) are left untouched so moderation history preserves their original expiry. A partial
-- unique index could not express "currently active" anyway, since CURRENT_TIMESTAMP is not immutable.
CREATE INDEX IF NOT EXISTS idx_community_bans__lookup ON community_bans (community_id, user_id) WHERE lifted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_community_bans__user
  ON community_bans (user_id, id DESC)
  WHERE lifted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_community_bans__case_id
  ON community_bans (case_id);

COMMENT ON TABLE community_bans IS 'Tracks community-scoped bans. A ban prevents the user from joining, posting, or commenting in the community. NULL lifted_at means the ban is active; NULL expires_at means permanent.';
COMMENT ON COLUMN community_bans.community_id IS 'The community this ban applies to.';
COMMENT ON COLUMN community_bans.user_id IS 'The banned user.';
COMMENT ON COLUMN community_bans.banned_by_id IS 'Moderator or owner who issued the ban.';
COMMENT ON COLUMN community_bans.reason IS 'Optional reason shown to the banned user and recorded for moderation history.';
COMMENT ON COLUMN community_bans.expires_at IS 'When the ban expires. NULL means permanent.';
COMMENT ON COLUMN community_bans.lifted_at IS 'When a moderator manually lifted the ban early. NULL means the ban was never manually lifted (it may still be active, or may have expired naturally via expires_at).';
COMMENT ON COLUMN community_bans.lifted_by_id IS 'Who lifted the ban early.';
COMMENT ON COLUMN community_bans.case_id IS 'The moderation case this ban belongs to.';
