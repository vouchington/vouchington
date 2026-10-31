-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: added moderation_appeal_id and community_ban_id to all CHECK branches (FK wired in 0450-00-00)
-- edited-in-place: removed upgrade-only drop/re-add of fk_notifications__moderation_report_id and chk_notifications__entity_columns (0120 creates the final CHECK)
-- edited-in-place: scoped idx_notifications__user_id__moderation_report to entity_type = 'moderation_report'
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
