-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: added moderation_appeal_id and community_ban_id to all CHECK branches (FK wired in 0450-00-00)
-- edited-in-place: scoped idx_notifications__user_id__moderation_report to entity_type = 'moderation_report'
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS fk_notifications__moderation_report_id;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications__moderation_report_id
    FOREIGN KEY (moderation_report_id)
    REFERENCES moderation_reports(id)
    ON DELETE SET NULL
    NOT VALID;

ALTER TABLE notifications
  VALIDATE CONSTRAINT fk_notifications__moderation_report_id;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS chk_notifications__entity_columns;

ALTER TABLE notifications
  ADD CONSTRAINT chk_notifications__entity_columns
    CHECK (
      (
        entity_type = 'post'
        AND post_id IS NOT NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND moderation_report_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
      )
      OR (
        entity_type = 'rss_feed_item'
        AND post_id IS NULL
        AND rss_feed_item_id IS NOT NULL
        AND actor_user_id IS NULL
        AND moderation_report_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
      )
      OR (
        entity_type IN ('follow', 'referral_signup')
        AND actor_user_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND moderation_report_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
      )
      OR (
        entity_type = 'moderation_report'
        AND moderation_report_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
      )
      OR (
        entity_type = 'review_dispute'
        AND review_dispute_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND moderation_report_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
      )
      OR (
        entity_type = 'user_warning'
        AND user_warning_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND moderation_report_id IS NULL
        AND review_dispute_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
      )
      OR (
        entity_type = 'moderation_appeal'
        AND moderation_appeal_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND moderation_report_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND community_ban_id IS NULL
      )
      OR (
        entity_type = 'community_ban'
        AND community_ban_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND moderation_report_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
      )
      OR (
        entity_type = 'critical_moderation_alert'
        AND moderation_report_id IS NOT NULL
        AND post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
      )
      OR (
        post_id IS NULL
        AND rss_feed_item_id IS NULL
        AND actor_user_id IS NULL
        AND moderation_report_id IS NULL
        AND review_dispute_id IS NULL
        AND user_warning_id IS NULL
        AND moderation_appeal_id IS NULL
        AND community_ban_id IS NULL
      )
    ) NOT VALID;

ALTER TABLE notifications
  VALIDATE CONSTRAINT chk_notifications__entity_columns;

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
