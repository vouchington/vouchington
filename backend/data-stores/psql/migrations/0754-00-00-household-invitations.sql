-- Pre-launch household invitation baseline.
CREATE TABLE IF NOT EXISTS household_invitations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship TEXT CHECK (relationship IS NULL OR char_length(relationship) <= 64),
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_household_invitations__household_invited_user_id_id
    UNIQUE (household_id, invited_user_id, id),
  CONSTRAINT chk_household_invitations__terminal_state CHECK (
    num_nonnulls(accepted_at, declined_at, revoked_at) <= 1
  )
);

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications__household_invitation_scope
  FOREIGN KEY (household_id, user_id, household_invitation_id)
  REFERENCES household_invitations (household_id, invited_user_id, id)
  ON DELETE CASCADE NOT VALID;
ALTER TABLE notifications
  VALIDATE CONSTRAINT fk_notifications__household_invitation_scope;

CREATE INDEX IF NOT EXISTS idx_notifications__household_invitation_id
  ON notifications (household_invitation_id);

CREATE OR REPLACE TRIGGER trigger_household_invitations_updated_at
  BEFORE UPDATE ON household_invitations
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_household_invitations__pending_household_user
  ON household_invitations (household_id, invited_user_id)
  WHERE accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_household_invitations__pending_invitee_id
  ON household_invitations (invited_user_id, id DESC)
  WHERE accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_household_invitations__invited_user_id
  ON household_invitations (invited_user_id);

CREATE INDEX IF NOT EXISTS idx_household_invitations__household_id
  ON household_invitations (household_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_household_invitations__pending_household_id
  ON household_invitations (household_id, id DESC)
  WHERE accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_household_invitations__invited_by_id
  ON household_invitations (invited_by_id);

COMMENT ON TABLE household_invitations IS 'Invitations for an existing user to join a household as an individual member.';
COMMENT ON COLUMN household_invitations.household_id IS 'Household whose owner or administrator issued the invitation.';
COMMENT ON COLUMN household_invitations.invited_user_id IS 'Only this user may accept or decline the invitation.';
COMMENT ON COLUMN household_invitations.invited_by_id IS 'User who created the invitation.';
COMMENT ON COLUMN household_invitations.relationship IS 'Optional relationship assigned to the resulting membership.';
COMMENT ON COLUMN household_invitations.accepted_at IS 'Time the invitee accepted and gained membership.';
COMMENT ON COLUMN household_invitations.declined_at IS 'Time the invitee declined.';
COMMENT ON COLUMN household_invitations.revoked_at IS 'Time an owner or administrator revoked the invitation.';
