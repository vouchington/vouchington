-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Replayable browser-push delivery state. Notifications remain the product record; these rows
-- capture the asynchronous effect and endpoint-level completion independently.
CREATE TYPE notification_push_intent_statuses AS ENUM ('pending', 'delivered', 'suppressed');
CREATE TYPE notification_push_endpoint_statuses AS ENUM ('pending', 'delivered', 'permanently_failed');

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE notification_push_intents (
  user_id UUID NOT NULL,
  notification_id UUID NOT NULL,
  status notification_push_intent_statuses GENERATED ALWAYS AS (
    CASE WHEN suppressed_at IS NOT NULL THEN 'suppressed'::notification_push_intent_statuses
      WHEN delivered_at IS NOT NULL THEN 'delivered'::notification_push_intent_statuses
      ELSE 'pending'::notification_push_intent_statuses END
  ) STORED NOT NULL,
  lease_token UUID UNIQUE,
  leased_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  suppressed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, notification_id),
  FOREIGN KEY (user_id, notification_id)
    REFERENCES notifications (user_id, id) ON UPDATE CASCADE ON DELETE CASCADE,
  CHECK ((lease_token IS NULL) = (leased_at IS NULL)),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK (num_nonnulls(suppressed_at, delivered_at) <= 1)
);

CREATE INDEX idx_notification_push_intents__available
  ON notification_push_intents (updated_at, user_id, notification_id)
  WHERE status = 'pending';

CREATE INDEX idx_notification_push_intents__pending_retention
  ON notification_push_intents (created_at, notification_id, user_id)
  WHERE status = 'pending';

CREATE TABLE notification_push_intent_retention_cursors (
  is_singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (is_singleton),
  cursor_created_at TIMESTAMPTZ,
  cursor_notification_id UUID,
  cursor_notification_owner_id UUID,
  sweep_upper_bound_created_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((cursor_created_at IS NULL) = (cursor_notification_id IS NULL)),
  CHECK ((cursor_notification_id IS NULL) = (cursor_notification_owner_id IS NULL))
);

CREATE OR REPLACE TRIGGER trigger_notification_push_intent_retention_cursors_updated_at
BEFORE UPDATE ON notification_push_intent_retention_cursors
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE notification_push_intent_retention_cursors IS 'Singleton position for the pending push intent age sweep.';
COMMENT ON COLUMN notification_push_intent_retention_cursors.is_singleton IS 'Restricts the pending intent sweep to one persisted cursor.';
COMMENT ON COLUMN notification_push_intent_retention_cursors.cursor_created_at IS 'Exact creation timestamp of the last scanned pending intent.';
COMMENT ON COLUMN notification_push_intent_retention_cursors.cursor_notification_id IS 'Notification tie breaker for the last scanned pending intent.';
COMMENT ON COLUMN notification_push_intent_retention_cursors.cursor_notification_owner_id IS 'Tie breaker for the last scanned notification identity.';
COMMENT ON COLUMN notification_push_intent_retention_cursors.sweep_upper_bound_created_at IS 'Frozen exclusive intent age bound for the current sweep.';


CREATE OR REPLACE TRIGGER trigger_notification_push_intents_updated_at
BEFORE UPDATE ON notification_push_intents
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();


COMMENT ON TABLE notification_push_intents IS 'One durable browser-push effect per notification. Lease fencing permits recovery after worker loss without changing notification state.';
COMMENT ON COLUMN notification_push_intents.user_id IS 'Notification owner and first half of the durable intent identity.';
COMMENT ON COLUMN notification_push_intents.notification_id IS 'Notification identifier and second half of the durable intent identity.';
COMMENT ON COLUMN notification_push_intents.status IS 'Generated enum derived exclusively from mutually exclusive terminal delivery facts.';
COMMENT ON COLUMN notification_push_intents.lease_token IS 'Unique worker fencing token rotated for each delivery claim.';
COMMENT ON COLUMN notification_push_intents.leased_at IS 'Timestamp when the current delivery claim began.';
COMMENT ON COLUMN notification_push_intents.lease_expires_at IS 'Deadline after which another worker may reclaim pending delivery.';
COMMENT ON COLUMN notification_push_intents.suppressed_at IS 'Timestamp when live eligibility prevented push delivery.';
COMMENT ON COLUMN notification_push_intents.delivered_at IS 'Timestamp when every reachable endpoint reached a terminal outcome.';

-- Current indexes for fresh schema bootstrap.
CREATE INDEX IF NOT EXISTS idx_notification_push_intents__terminal_retention
  ON notification_push_intents (COALESCE(delivered_at, suppressed_at), user_id, notification_id)
  WHERE status IN ('delivered', 'suppressed');
