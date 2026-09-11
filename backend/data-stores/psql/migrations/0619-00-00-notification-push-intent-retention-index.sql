-- migration-mode: online

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_push_intents__terminal_retention
  ON notification_push_intents (COALESCE(delivered_at, suppressed_at), user_id, notification_id)
  WHERE status IN ('delivered', 'suppressed');
