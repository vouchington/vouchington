-- One keyset position for the scheduled orphaned queued-grant repair. NULL starts
-- the next pass so a finished sweep sees grants whose eligibility changed.
CREATE TABLE IF NOT EXISTS membership_queued_grant_repair_cursors (
  is_singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (is_singleton),
  cursor_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_membership_queued_grant_repair_cursors_updated_at
BEFORE UPDATE ON membership_queued_grant_repair_cursors
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE membership_queued_grant_repair_cursors IS 'Durable user keyset for the scheduled repair of queued grants behind a cancelled or expired projection.';
COMMENT ON COLUMN membership_queued_grant_repair_cursors.is_singleton IS 'One repair cursor for the membership grant expiry job.';
COMMENT ON COLUMN membership_queued_grant_repair_cursors.cursor_user_id IS 'Last inspected user id in the current pass. NULL starts at the first grant. It is not a reference to a surviving user.';
COMMENT ON COLUMN membership_queued_grant_repair_cursors.created_at IS 'When this cursor row was first inserted.';
COMMENT ON COLUMN membership_queued_grant_repair_cursors.updated_at IS 'When this repair pass last checkpointed.';
