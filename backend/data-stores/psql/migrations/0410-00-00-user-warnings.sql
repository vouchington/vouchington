-- edited-in-place: pre-launch, never deployed to production
CREATE TABLE IF NOT EXISTS user_warnings (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  -- guardrails-disable-next-line uuid-must-be-key
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- guardrails-disable-next-line uuid-must-be-key
  community_id uuid REFERENCES communities (id) ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  issued_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  public_message text CHECK (public_message IS NULL OR char_length(public_message) <= 2000),
  -- guardrails-disable-next-line uuid-must-be-key
  report_id uuid REFERENCES moderation_reports (id) ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  case_id uuid NOT NULL REFERENCES moderation_cases (id) ON DELETE CASCADE,
  revoked_at timestamptz,
  -- guardrails-disable-next-line uuid-must-be-key
  revoked_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);

CREATE INDEX IF NOT EXISTS user_warnings_user_id ON user_warnings (user_id, id DESC);

CREATE INDEX IF NOT EXISTS user_warnings_community_id ON user_warnings (community_id, id DESC)
WHERE community_id IS NOT NULL;

-- Prevent duplicate warnings for the same report (idempotency on retry when report resolution fails).
CREATE UNIQUE INDEX IF NOT EXISTS user_warnings_report_id_unique ON user_warnings (report_id)
WHERE report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_warnings_case_id
  ON user_warnings (case_id);

COMMENT ON TABLE user_warnings IS 'Records of formal warnings issued to users by moderators or admins.';
COMMENT ON COLUMN user_warnings.user_id IS 'The user who received this warning.';
COMMENT ON COLUMN user_warnings.community_id IS 'The community scope of this warning, or NULL for a global warning.';
COMMENT ON COLUMN user_warnings.issued_by_id IS 'The moderator or admin who issued this warning.';
COMMENT ON COLUMN user_warnings.reason IS 'Internal reason for the warning (staff-visible only).';
COMMENT ON COLUMN user_warnings.public_message IS 'Optional public message shown to the warned user.';
COMMENT ON COLUMN user_warnings.report_id IS 'The moderation report that triggered this warning, if any.';
COMMENT ON COLUMN user_warnings.case_id IS 'The moderation case this warning belongs to.';

-- Add the user_warning entity type to the notifications enum. This value is also present in
-- the edited-in-place 0120 baseline for fresh databases; this ALTER is for databases whose
-- notifications table was created before the 0120 edit.
ALTER TYPE notification_entity_types ADD VALUE IF NOT EXISTS 'user_warning';

-- Add the FK from notifications.user_warning_id to user_warnings. The column was declared in
-- 0120 without a FK because user_warnings did not exist at that point.
-- guardrails: allow-alter-table
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_user_warning_id_fkey;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_user_warning_id_fkey
  FOREIGN KEY (user_warning_id) REFERENCES user_warnings (id) ON DELETE CASCADE NOT VALID;

ALTER TABLE notifications
  VALIDATE CONSTRAINT notifications_user_warning_id_fkey;
