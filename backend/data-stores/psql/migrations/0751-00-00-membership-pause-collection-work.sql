-- One in-flight Stripe pause_collection sync per user. Suspension and lift rewrite the
-- row in the same transaction; the worker calls Stripe only after commit.
CREATE TABLE membership_pause_collection_work_items (
  user_id uuid PRIMARY KEY,
  requested_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  leased_at timestamptz,
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_failed_at timestamptz,
  last_failure_message text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((lease_token IS NULL AND leased_at IS NULL AND lease_expires_at IS NULL)
    OR (lease_token IS NOT NULL AND leased_at IS NOT NULL AND lease_expires_at IS NOT NULL
      AND lease_expires_at > leased_at)),
  CHECK ((last_failed_at IS NULL) = (last_failure_message IS NULL))
);

CREATE UNIQUE INDEX idx_membership_pause_collection_work_items__lease_token
  ON membership_pause_collection_work_items (lease_token) WHERE lease_token IS NOT NULL;
CREATE INDEX idx_membership_pause_collection_work_items__available
  ON membership_pause_collection_work_items (available_at, user_id) WHERE lease_token IS NULL;
CREATE INDEX idx_membership_pause_collection_work_items__lease_expiry
  ON membership_pause_collection_work_items (lease_expires_at, user_id) WHERE lease_token IS NOT NULL;
CREATE TRIGGER trigger_membership_pause_collection_work_items_updated_at
  BEFORE UPDATE ON membership_pause_collection_work_items
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

ALTER TABLE membership_pause_collection_work_items
  ADD CONSTRAINT fk_membership_pause_collection_work_items__user
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE NOT VALID;
ALTER TABLE membership_pause_collection_work_items
  VALIDATE CONSTRAINT fk_membership_pause_collection_work_items__user;

COMMENT ON TABLE membership_pause_collection_work_items IS 'In-flight sync of Stripe pause_collection to the user''s open suspension. Completion deletes the row. Granted memberships never become a Stripe update.';
COMMENT ON COLUMN membership_pause_collection_work_items.user_id IS 'User whose direct Stripe subscription should match the open suspension. One row per user.';
COMMENT ON COLUMN membership_pause_collection_work_items.requested_at IS 'Generation of the latest suspension or lift, truncated to milliseconds. A newer value supersedes an in-flight lease.';
COMMENT ON COLUMN membership_pause_collection_work_items.available_at IS 'Earliest time an unleased row may be claimed by the recovery dispatcher.';
COMMENT ON COLUMN membership_pause_collection_work_items.lease_token IS 'Opaque fence for the worker that may call Stripe and delete this generation.';
COMMENT ON COLUMN membership_pause_collection_work_items.leased_at IS 'Time the current lease was taken.';
COMMENT ON COLUMN membership_pause_collection_work_items.lease_expires_at IS 'Time after which recovery may replace this lease.';
COMMENT ON COLUMN membership_pause_collection_work_items.attempt_count IS 'Leases acquired for the current requested_at. A newer suspension or lift resets it.';
COMMENT ON COLUMN membership_pause_collection_work_items.last_failed_at IS 'Time of the latest Stripe failure for this generation. A newer suspension or lift clears it.';
COMMENT ON COLUMN membership_pause_collection_work_items.last_failure_message IS 'Message from the latest Stripe failure for this generation. A newer suspension or lift clears it.';
COMMENT ON COLUMN membership_pause_collection_work_items.created_at IS 'Time this user first had pause-collection work. Later generations update requested_at.';
COMMENT ON COLUMN membership_pause_collection_work_items.updated_at IS 'Last lease, supersession, or schedule change. Maintained by trigger.';
