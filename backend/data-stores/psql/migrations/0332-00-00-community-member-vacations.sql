CREATE TABLE IF NOT EXISTS community_member_vacations (
  community_id UUID        NOT NULL REFERENCES communities ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES users ON DELETE CASCADE,
  starts_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (community_id, user_id)
);

COMMENT ON TABLE community_member_vacations IS
  'Self-service vacation flag for community moderators. '
  'Active while starts_at <= now() AND (ends_at IS NULL OR ends_at > now()).';
COMMENT ON COLUMN community_member_vacations.community_id IS 'The community this vacation applies to.';
COMMENT ON COLUMN community_member_vacations.user_id IS 'The moderator on vacation.';
COMMENT ON COLUMN community_member_vacations.starts_at IS 'When this vacation period began. Reset to now() on each upsert (re-enable resets the clock).';
COMMENT ON COLUMN community_member_vacations.ends_at IS 'When this vacation ends. NULL means indefinite (until explicitly cleared).';
