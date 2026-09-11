-- Replayable browser-push delivery state. Notifications remain the product record; these rows
-- capture the asynchronous effect and endpoint-level completion independently.
CREATE TYPE notification_push_intent_status AS ENUM ('pending', 'delivered', 'suppressed');
CREATE TYPE notification_push_endpoint_status AS ENUM ('pending', 'delivered', 'permanently_failed');

CREATE TABLE notification_push_intents (
  user_id UUID NOT NULL,
  notification_id UUID NOT NULL,
  status notification_push_intent_status NOT NULL DEFAULT 'pending',
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
  CHECK ((status = 'pending') = (suppressed_at IS NULL AND delivered_at IS NULL)),
  CHECK ((status <> 'suppressed') OR suppressed_at IS NOT NULL),
  CHECK ((status <> 'delivered') OR delivered_at IS NOT NULL)
);

CREATE INDEX idx_notification_push_intents__available
  ON notification_push_intents (updated_at, user_id, notification_id)
  WHERE status = 'pending';

CREATE TABLE notification_push_intent_endpoints (
  user_id UUID NOT NULL,
  notification_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  status notification_push_endpoint_status NOT NULL DEFAULT 'pending',
  delivered_at TIMESTAMPTZ,
  permanently_failed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, notification_id, endpoint),
  FOREIGN KEY (user_id, notification_id)
    REFERENCES notification_push_intents (user_id, notification_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CHECK ((status = 'delivered') = (delivered_at IS NOT NULL)),
  CHECK ((status = 'permanently_failed') = (permanently_failed_at IS NOT NULL))
);

-- The trigger makes durable push capture structural: every notification writer participates in
-- the same transaction without relying on each caller to remember a second insert.
CREATE FUNCTION fn_capture_notification_push_intent() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    DELETE FROM notification_push_intent_endpoints
    WHERE user_id = NEW.user_id AND notification_id IN (OLD.id, NEW.id);
  END IF;

  INSERT INTO notification_push_intents (user_id, notification_id)
  VALUES (NEW.user_id, NEW.id)
  ON CONFLICT (user_id, notification_id) DO UPDATE
  SET status = 'pending',
      lease_token = NULL,
      leased_at = NULL,
      lease_expires_at = NULL,
      suppressed_at = NULL,
      delivered_at = NULL,
      updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notifications_capture_push_intent
AFTER INSERT OR UPDATE OF id ON notifications
FOR EACH ROW EXECUTE FUNCTION fn_capture_notification_push_intent();

CREATE OR REPLACE TRIGGER trigger_notification_push_intents_updated_at
BEFORE UPDATE ON notification_push_intents
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE TRIGGER trigger_notification_push_intent_endpoints_updated_at
BEFORE UPDATE ON notification_push_intent_endpoints
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE notification_push_intents IS 'One durable browser-push effect per notification. Lease fencing permits recovery after worker loss without changing notification state.';
COMMENT ON COLUMN notification_push_intents.user_id IS 'Notification owner and first half of the durable intent identity.';
COMMENT ON COLUMN notification_push_intents.notification_id IS 'Notification identifier and second half of the durable intent identity.';
COMMENT ON COLUMN notification_push_intents.status IS 'Terminal or pending state for the notification push effect.';
COMMENT ON COLUMN notification_push_intents.lease_token IS 'Unique worker fencing token rotated for each delivery claim.';
COMMENT ON COLUMN notification_push_intents.leased_at IS 'Timestamp when the current delivery claim began.';
COMMENT ON COLUMN notification_push_intents.lease_expires_at IS 'Deadline after which another worker may reclaim pending delivery.';
COMMENT ON COLUMN notification_push_intents.suppressed_at IS 'Timestamp when live eligibility prevented push delivery.';
COMMENT ON COLUMN notification_push_intents.delivered_at IS 'Timestamp when every reachable endpoint reached a terminal outcome.';
COMMENT ON TABLE notification_push_intent_endpoints IS 'Per-endpoint delivery completion for a notification push intent. Delivered endpoints are never resent during retries.';
COMMENT ON COLUMN notification_push_intent_endpoints.user_id IS 'Notification owner and first half of the parent intent identity.';
COMMENT ON COLUMN notification_push_intent_endpoints.notification_id IS 'Notification identifier and second half of the parent intent identity.';
COMMENT ON COLUMN notification_push_intent_endpoints.endpoint IS 'Exact browser push endpoint recorded for retry-safe delivery.';
COMMENT ON COLUMN notification_push_intent_endpoints.status IS 'Delivery outcome for this endpoint and notification.';
COMMENT ON COLUMN notification_push_intent_endpoints.delivered_at IS 'Timestamp of successful delivery to this endpoint.';
COMMENT ON COLUMN notification_push_intent_endpoints.permanently_failed_at IS 'Timestamp when a gone or missing endpoint became non-retryable.';
COMMENT ON FUNCTION fn_capture_notification_push_intent() IS 'Atomically records new and renewed notification push effects, clearing endpoint outcomes when an upsert creates a new notification generation.';
