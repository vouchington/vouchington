-- Global endpoint ownership is deliberately unpartitioned: it is the serialization point that
-- prevents a physical browser endpoint from being active for more than one user generation.
CREATE TABLE web_push_endpoint_owners (
  endpoint_digest BYTEA PRIMARY KEY
    CHECK (endpoint_digest = digest(endpoint, 'sha256')),
  endpoint TEXT NOT NULL UNIQUE CHECK (endpoint LIKE 'https://%'),
  user_id UUID NOT NULL,
  subscription_id UUID NOT NULL,
  CONSTRAINT web_push_endpoint_owners_subscription_fkey FOREIGN KEY (user_id, subscription_id)
    REFERENCES web_push_subscriptions (user_id, id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, subscription_id)
);

CREATE OR REPLACE TRIGGER trigger_web_push_endpoint_owners_updated_at
BEFORE UPDATE ON web_push_endpoint_owners
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE notification_push_intent_subscription_receipts (
  user_id UUID NOT NULL,
  notification_id UUID NOT NULL,
  subscription_id UUID NOT NULL,
  CONSTRAINT notification_push_receipts_intent_fkey FOREIGN KEY (user_id, notification_id)
    REFERENCES notification_push_intents (user_id, notification_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT notification_push_receipts_subscription_fkey FOREIGN KEY (user_id, subscription_id)
    REFERENCES web_push_subscriptions (user_id, id) ON UPDATE CASCADE ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  status notification_push_endpoint_status NOT NULL DEFAULT 'pending',
  delivered_at TIMESTAMPTZ,
  permanently_failed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, notification_id, subscription_id),
  CHECK ((status = 'delivered') = (delivered_at IS NOT NULL)),
  CHECK ((status = 'permanently_failed') = (permanently_failed_at IS NOT NULL))
);

CREATE INDEX idx_push_intent_subscription_receipts_user_subscription
  ON notification_push_intent_subscription_receipts (user_id, subscription_id);

CREATE OR REPLACE TRIGGER trigger_notification_push_receipts_updated_at
BEFORE UPDATE ON notification_push_intent_subscription_receipts
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE FUNCTION fn_assert_web_push_subscription_owner() RETURNS TRIGGER AS $$
DECLARE
  checked_user_id UUID := COALESCE(NEW.user_id, OLD.user_id);
  checked_subscription_id UUID := COALESCE(NEW.id, OLD.id);
BEGIN
  IF EXISTS (
    SELECT 1
    FROM web_push_subscriptions subscription
    WHERE subscription.user_id = checked_user_id
      AND subscription.id = checked_subscription_id
      AND subscription.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM web_push_endpoint_owners owner
        WHERE owner.endpoint_digest = digest(subscription.endpoint, 'sha256')
          AND owner.endpoint = subscription.endpoint
          AND owner.user_id = subscription.user_id
          AND owner.subscription_id = subscription.id
      )
  ) THEN
    RAISE EXCEPTION 'active web push subscription requires one exact endpoint owner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM web_push_endpoint_owners owner
    WHERE owner.user_id = checked_user_id
      AND owner.subscription_id = checked_subscription_id
      AND NOT EXISTS (
        SELECT 1
        FROM web_push_subscriptions subscription
        WHERE subscription.user_id = owner.user_id
          AND subscription.id = owner.subscription_id
          AND subscription.endpoint = owner.endpoint
          AND subscription.deleted_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'web push endpoint owner requires one exact active subscription';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_assert_web_push_endpoint_owner_subscription() RETURNS TRIGGER AS $$
DECLARE
  checked_endpoint_digest BYTEA := COALESCE(NEW.endpoint_digest, OLD.endpoint_digest);
BEGIN
  IF EXISTS (
    SELECT 1
    FROM web_push_endpoint_owners owner
    WHERE owner.endpoint_digest = checked_endpoint_digest
      AND NOT EXISTS (
        SELECT 1
        FROM web_push_subscriptions subscription
        WHERE subscription.user_id = owner.user_id
          AND subscription.id = owner.subscription_id
          AND subscription.endpoint = owner.endpoint
          AND subscription.deleted_at IS NULL
      )
  ) OR (
    TG_OP <> 'INSERT'
    AND EXISTS (
      SELECT 1
      FROM web_push_subscriptions subscription
      WHERE subscription.user_id = OLD.user_id
        AND subscription.id = OLD.subscription_id
        AND subscription.endpoint = OLD.endpoint
        AND subscription.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM web_push_endpoint_owners owner
          WHERE owner.endpoint_digest = OLD.endpoint_digest
            AND owner.endpoint = OLD.endpoint
            AND owner.user_id = OLD.user_id
            AND owner.subscription_id = OLD.subscription_id
        )
    )
  ) THEN
    RAISE EXCEPTION 'web push endpoint owner requires one exact active subscription';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trigger_assert_web_push_subscription_owner
AFTER INSERT OR UPDATE OR DELETE ON web_push_subscriptions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_assert_web_push_subscription_owner();

CREATE CONSTRAINT TRIGGER trigger_assert_web_push_owner_subscription
AFTER INSERT OR UPDATE OR DELETE ON web_push_endpoint_owners
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_assert_web_push_endpoint_owner_subscription();

CREATE OR REPLACE FUNCTION fn_capture_notification_push_intent() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    DELETE FROM notification_push_intent_subscription_receipts
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

COMMENT ON TABLE web_push_endpoint_owners IS 'Global exact browser endpoint owner; SHA-256 digest serializes endpoint claims while exact endpoint comparison detects digest collisions.';
COMMENT ON COLUMN web_push_endpoint_owners.endpoint_digest IS 'SHA-256 digest of endpoint, used as the global registry primary key.';
COMMENT ON COLUMN web_push_endpoint_owners.endpoint IS 'Canonical HTTPS browser push endpoint whose ownership is globally serialized.';
COMMENT ON COLUMN web_push_endpoint_owners.user_id IS 'Authenticated user who owns the current endpoint activation generation.';
COMMENT ON COLUMN web_push_endpoint_owners.subscription_id IS 'Current web push activation generation for this endpoint.';
COMMENT ON TABLE notification_push_intent_subscription_receipts IS 'Generation-fenced delivery completion for a notification push intent.';
COMMENT ON COLUMN notification_push_intent_subscription_receipts.user_id IS 'Notification owner and first half of the parent intent identity.';
COMMENT ON COLUMN notification_push_intent_subscription_receipts.notification_id IS 'Notification identifier and second half of the parent intent identity.';
COMMENT ON COLUMN notification_push_intent_subscription_receipts.subscription_id IS 'Exact subscription generation that received this outcome.';
COMMENT ON COLUMN notification_push_intent_subscription_receipts.endpoint IS 'Provider endpoint retained as delivery audit data for the exact generation.';
COMMENT ON COLUMN notification_push_intent_subscription_receipts.status IS 'Delivery outcome for this subscription generation and notification.';
COMMENT ON COLUMN notification_push_intent_subscription_receipts.delivered_at IS 'Timestamp of successful delivery to this subscription generation.';
COMMENT ON COLUMN notification_push_intent_subscription_receipts.permanently_failed_at IS 'Timestamp when this subscription generation became non-retryable.';
