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


CREATE OR REPLACE TRIGGER trigger_notification_push_intents_updated_at
BEFORE UPDATE ON notification_push_intents
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
