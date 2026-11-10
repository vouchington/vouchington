-- One keyset position for the scheduled orphaned queued-grant repair. Both columns
-- NULL start the next pass so a finished sweep sees grants whose eligibility changed.
CREATE TABLE IF NOT EXISTS membership_queued_grant_repair_cursors (
  is_singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (is_singleton),
  cursor_id UUID,
  cursor_grant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((cursor_id IS NULL) = (cursor_grant_id IS NULL))
);

CREATE OR REPLACE TRIGGER trigger_membership_queued_grant_repair_cursors_updated_at
BEFORE UPDATE ON membership_queued_grant_repair_cursors
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE membership_queued_grant_repair_cursors IS 'Durable (user, grant) keyset for the scheduled repair of queued grants behind a cancelled or expired projection.';
COMMENT ON COLUMN membership_queued_grant_repair_cursors.is_singleton IS 'One repair cursor for the membership grant expiry job.';
COMMENT ON COLUMN membership_queued_grant_repair_cursors.cursor_id IS 'User id of the last inspected grant row. NULL, with cursor_grant_id, starts at the first grant. It is not a reference to a surviving user.';
COMMENT ON COLUMN membership_queued_grant_repair_cursors.cursor_grant_id IS 'Grant id of the last inspected row. NULL, with cursor_id, starts at the first grant. It is not a reference to a surviving grant.';
COMMENT ON COLUMN membership_queued_grant_repair_cursors.created_at IS 'When this cursor row was first inserted.';
COMMENT ON COLUMN membership_queued_grant_repair_cursors.updated_at IS 'When this repair pass last checkpointed.';
