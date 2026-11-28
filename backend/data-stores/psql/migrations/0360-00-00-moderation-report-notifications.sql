ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications__moderation_report_id
    FOREIGN KEY (moderation_report_id)
    REFERENCES moderation_reports(id)
    ON DELETE SET NULL
    NOT VALID;

ALTER TABLE notifications
  VALIDATE CONSTRAINT fk_notifications__moderation_report_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications__user_id__moderation_report
ON notifications (user_id, moderation_report_id)
WHERE entity_type = 'moderation_report'
  AND moderation_report_id IS NOT NULL
  AND deleted_at IS NULL
  AND delivery_type = 'subscription';

CREATE INDEX IF NOT EXISTS idx_notifications__moderation_report
ON notifications (moderation_report_id)
WHERE moderation_report_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN notifications.moderation_report_id IS 'Moderation report this notification refers to; set when entity_type is moderation_report.';
