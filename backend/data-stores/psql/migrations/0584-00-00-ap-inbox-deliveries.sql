-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS activitypub_inbox_delivery_work_items (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  request_method http_request_methods NOT NULL,
  request_target TEXT NOT NULL,
  expected_host TEXT NOT NULL,
  signature_header TEXT NOT NULL,
  digest_header TEXT NOT NULL,
  date_header TEXT NOT NULL,
  content_type_header TEXT,
  raw_body BYTEA NOT NULL,
  claimed_activity_id TEXT NOT NULL,
  claimed_activity_type TEXT NOT NULL,
  claimed_actor_uri TEXT NOT NULL,
  sender_hostname TEXT NOT NULL,
  lease_token UUID NOT NULL DEFAULT uuidv7(),
  remote_actor_id UUID REFERENCES remote_actors ON DELETE RESTRICT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dispatched_at TIMESTAMPTZ,
  leased_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  verified_at TIMESTAMPTZ,
  sender_allowed_at TIMESTAMPTZ,
  available_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  first_failed_at TIMESTAMPTZ,
  retention_expires_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((leased_at IS NULL) = (lease_expires_at IS NULL)),
  CHECK (lease_expires_at IS NULL OR lease_expires_at > leased_at),
  CONSTRAINT activitypub_inbox_work_items__request_method_uppercase CHECK (request_method::text = UPPER(request_method::text)),
  CONSTRAINT activitypub_inbox_work_items__request_method_length CHECK (LENGTH(request_method::text) BETWEEN 1 AND 16),
  CONSTRAINT activitypub_inbox_work_items__sender_hostname_lowercase CHECK (sender_hostname = LOWER(sender_hostname)),
  CONSTRAINT activitypub_inbox_work_items__raw_body_bounded CHECK (OCTET_LENGTH(raw_body) <= 1048576),
  CONSTRAINT activitypub_inbox_work_items__verified_actor_paired CHECK ((verified_at IS NULL) = (remote_actor_id IS NULL)),
  CONSTRAINT activitypub_inbox_work_items__sender_requires_verification CHECK (
    sender_allowed_at IS NULL OR (verified_at IS NOT NULL AND remote_actor_id IS NOT NULL)
  ),
  CONSTRAINT activitypub_inbox_work_items__deferral_state_valid CHECK (
    available_at IS NULL OR (
      verified_at IS NOT NULL
      AND remote_actor_id IS NOT NULL
      AND leased_at IS NULL
      AND dispatched_at IS NULL
      AND sender_allowed_at IS NULL
      AND failed_at IS NULL
      AND last_error IS NOT NULL
    )
  ),
  CONSTRAINT activitypub_inbox_work_items__failure_state_valid CHECK (
    failed_at IS NULL OR (
      leased_at IS NOT NULL
      AND available_at IS NULL
      AND last_error IS NOT NULL
    )
  ),
  CONSTRAINT activitypub_inbox_work_items__terminal_diagnostics_present CHECK (
    (available_at IS NULL AND failed_at IS NULL) OR last_error IS NOT NULL
  ),
  CONSTRAINT activitypub_inbox_work_items__last_error_bounded CHECK (last_error IS NULL OR LENGTH(last_error) <= 1000),
  CONSTRAINT activitypub_inbox_work_items__failed_requires_first_failed CHECK (failed_at IS NULL OR first_failed_at IS NOT NULL),
  CONSTRAINT activitypub_inbox_work_items__first_failed_requires_retention CHECK (first_failed_at IS NULL OR retention_expires_at IS NOT NULL),
  CONSTRAINT activitypub_inbox_work_items__verified_first_failure_retention CHECK (verified_at IS NULL OR first_failed_at IS NOT NULL OR retention_expires_at IS NULL),
  CONSTRAINT activitypub_inbox_work_items__unverified_requires_retention CHECK (verified_at IS NOT NULL OR retention_expires_at IS NOT NULL),
  CONSTRAINT activitypub_inbox_work_items__first_failed_precedes_failure CHECK (failed_at IS NULL OR first_failed_at <= failed_at),
  CONSTRAINT activitypub_inbox_work_items__unverified_retention_bounded CHECK (verified_at IS NOT NULL OR retention_expires_at <= received_at + INTERVAL '1 hour'),
  CONSTRAINT activitypub_inbox_work_items__verified_bounded_retention CHECK (
    verified_at IS NULL OR first_failed_at IS NULL OR retention_expires_at <= first_failed_at + INTERVAL '7 days'
  )
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_activitypub_inbox_work_items_updated_at
BEFORE UPDATE ON activitypub_inbox_delivery_work_items
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_activitypub_inbox_work_items__recovery
  ON activitypub_inbox_delivery_work_items (failed_at, available_at, leased_at, dispatched_at, received_at, id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_activitypub_inbox_work_items__remote_actor_id
  ON activitypub_inbox_delivery_work_items (remote_actor_id) WHERE remote_actor_id IS NOT NULL;

COMMENT ON TABLE activitypub_inbox_delivery_work_items IS 'Durable, unverified ActivityPub inbox envelopes awaiting worker verification and dispatch. Rows and raw request bytes are deleted after a final protocol outcome.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.request_method IS 'Uppercase HTTP method from the exact inbound signed request; bounded to 16 characters.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.request_target IS 'Exact path and query string used to reconstruct the signed (request-target) value.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.expected_host IS 'Public Host value covered by the sender''s HTTP Signature.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.signature_header IS 'Exact inbound Signature header retained until verification reaches a final outcome.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.digest_header IS 'Exact inbound Digest header binding the signature to raw_body.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.date_header IS 'Exact inbound Date header evaluated relative to received_at during queued verification.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.content_type_header IS 'Optional exact Content-Type header for senders that include it in their signed headers.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.raw_body IS 'Exact inbound request bytes, bounded to 1 MiB and deleted after a final protocol outcome.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.claimed_activity_id IS 'Untrusted activity id parsed before signature verification. Intentionally not unique so an unsigned request cannot squat a legitimate id.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.claimed_activity_type IS 'Untrusted activity type parsed during the network-free request preflight.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.claimed_actor_uri IS 'Untrusted activity actor URI parsed during the network-free request preflight.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.sender_hostname IS 'Lowercase hostname derived from the unverified Signature keyId and revalidated by the worker.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.lease_token IS 'Fencing token rotated whenever recovery re-enqueues the delivery; stale queue jobs cannot process the row.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.remote_actor_id IS 'Verified signing actor checkpoint. Actor deletion is restricted while the durable delivery remains.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.received_at IS 'When the API durably accepted the unverified envelope.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.dispatched_at IS 'Latest dispatch lease timestamp; recovery waits five minutes before replacing a missing queue job.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.leased_at IS 'Active worker lease timestamp; non-final retryable failures release it and stale crashes recover after thirty minutes.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.verified_at IS 'When the worker first verified the exact request signature and actor match; always paired with remote_actor_id.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.sender_allowed_at IS 'Set after the sender-hostname delivery rate limit admits this envelope; retries do not charge the sender again.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.available_at IS 'Earliest retry time after a valid sender exceeds its hostname delivery allowance.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.failed_at IS 'Set only after the queue exhausts retryable operational attempts. Manual backfill clears it and rotates the fencing token.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.first_failed_at IS 'Immutable timestamp of the first retry-exhausting operational failure; survives rearm to anchor sticky retention.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.retention_expires_at IS 'Maximum retention deadline for an unverified or previously failed durable delivery.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.last_error IS 'Latest bounded operational failure message for recovery and operator diagnostics.';

COMMENT ON TABLE activitypub_inbox_activities IS 'Replay-dedup ledger for the ActivityPub inbox receiver. The marker commits atomically with the activity core database effect; a second delivery of the same activity id is rejected before it reaches any write-path.';

-- Current indexes for fresh schema bootstrap.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_activitypub_inbox_work_items__unverified_retention
  ON activitypub_inbox_delivery_work_items (retention_expires_at, id)
  WHERE verified_at IS NULL AND retention_expires_at IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_activitypub_inbox_work_items__verified_retention
  ON activitypub_inbox_delivery_work_items (retention_expires_at, id)
  WHERE verified_at IS NOT NULL AND retention_expires_at IS NOT NULL;

COMMENT ON COLUMN activitypub_inbox_delivery_work_items.lease_expires_at IS 'Deadline after which worker checkpoints and terminal outcomes are rejected.';
COMMENT ON COLUMN activitypub_inbox_delivery_work_items.attempt_count IS 'Number of successfully acquired processing attempts.';
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_activitypub_inbox_work_items__claim
  ON activitypub_inbox_delivery_work_items (available_at, id) WHERE failed_at IS NULL;
