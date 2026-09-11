-- edited-in-place: pre-launch, never deployed to production
CREATE TABLE IF NOT EXISTS ap_inbox_deliveries (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  request_method TEXT NOT NULL,
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
  processing_attempt_id UUID NOT NULL DEFAULT uuidv7(),
  remote_actor_id UUID REFERENCES remote_actors ON DELETE RESTRICT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enqueued_at TIMESTAMPTZ,
  processing_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  sender_allowed_at TIMESTAMPTZ,
  deferred_until TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ap_inbox_deliveries__request_method_uppercase CHECK (request_method = UPPER(request_method)),
  CONSTRAINT ap_inbox_deliveries__request_method_length CHECK (LENGTH(request_method) BETWEEN 1 AND 16),
  CONSTRAINT ap_inbox_deliveries__sender_hostname_lowercase CHECK (sender_hostname = LOWER(sender_hostname)),
  CONSTRAINT ap_inbox_deliveries__raw_body_bounded CHECK (OCTET_LENGTH(raw_body) <= 1048576),
  CONSTRAINT ap_inbox_deliveries__verified_actor_paired CHECK ((verified_at IS NULL) = (remote_actor_id IS NULL)),
  CONSTRAINT ap_inbox_deliveries__sender_admission_requires_verification CHECK (
    sender_allowed_at IS NULL OR (verified_at IS NOT NULL AND remote_actor_id IS NOT NULL)
  ),
  CONSTRAINT ap_inbox_deliveries__deferral_state_valid CHECK (
    deferred_until IS NULL OR (
      verified_at IS NOT NULL
      AND remote_actor_id IS NOT NULL
      AND processing_at IS NULL
      AND enqueued_at IS NULL
      AND sender_allowed_at IS NULL
      AND failed_at IS NULL
      AND last_error IS NOT NULL
    )
  ),
  CONSTRAINT ap_inbox_deliveries__failure_state_valid CHECK (
    failed_at IS NULL OR (
      processing_at IS NOT NULL
      AND deferred_until IS NULL
      AND last_error IS NOT NULL
    )
  ),
  CONSTRAINT ap_inbox_deliveries__terminal_diagnostics_present CHECK (
    (deferred_until IS NULL AND failed_at IS NULL) OR last_error IS NOT NULL
  ),
  CONSTRAINT ap_inbox_deliveries__last_error_bounded CHECK (last_error IS NULL OR LENGTH(last_error) <= 1000)
);

CREATE OR REPLACE TRIGGER trigger_ap_inbox_deliveries_updated_at
BEFORE UPDATE ON ap_inbox_deliveries
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_ap_inbox_deliveries__recovery
  ON ap_inbox_deliveries (failed_at, deferred_until, processing_at, enqueued_at, received_at, id);
CREATE INDEX IF NOT EXISTS idx_ap_inbox_deliveries__remote_actor_id
  ON ap_inbox_deliveries (remote_actor_id) WHERE remote_actor_id IS NOT NULL;

COMMENT ON TABLE ap_inbox_deliveries IS 'Durable, unverified ActivityPub inbox envelopes awaiting worker verification and dispatch. Rows and raw request bytes are deleted after a final protocol outcome.';
COMMENT ON COLUMN ap_inbox_deliveries.request_method IS 'Uppercase HTTP method from the exact inbound signed request; bounded to 16 characters.';
COMMENT ON COLUMN ap_inbox_deliveries.request_target IS 'Exact path and query string used to reconstruct the signed (request-target) value.';
COMMENT ON COLUMN ap_inbox_deliveries.expected_host IS 'Public Host value covered by the sender''s HTTP Signature.';
COMMENT ON COLUMN ap_inbox_deliveries.signature_header IS 'Exact inbound Signature header retained until verification reaches a final outcome.';
COMMENT ON COLUMN ap_inbox_deliveries.digest_header IS 'Exact inbound Digest header binding the signature to raw_body.';
COMMENT ON COLUMN ap_inbox_deliveries.date_header IS 'Exact inbound Date header evaluated relative to received_at during queued verification.';
COMMENT ON COLUMN ap_inbox_deliveries.content_type_header IS 'Optional exact Content-Type header for senders that include it in their signed headers.';
COMMENT ON COLUMN ap_inbox_deliveries.raw_body IS 'Exact inbound request bytes, bounded to 1 MiB and deleted after a final protocol outcome.';
COMMENT ON COLUMN ap_inbox_deliveries.claimed_activity_id IS 'Untrusted activity id parsed before signature verification. Intentionally not unique so an unsigned request cannot squat a legitimate id.';
COMMENT ON COLUMN ap_inbox_deliveries.claimed_activity_type IS 'Untrusted activity type parsed during the network-free request preflight.';
COMMENT ON COLUMN ap_inbox_deliveries.claimed_actor_uri IS 'Untrusted activity actor URI parsed during the network-free request preflight.';
COMMENT ON COLUMN ap_inbox_deliveries.sender_hostname IS 'Lowercase hostname derived from the unverified Signature keyId and revalidated by the worker.';
COMMENT ON COLUMN ap_inbox_deliveries.processing_attempt_id IS 'Fencing token rotated whenever recovery re-enqueues the delivery; stale queue jobs cannot process the row.';
COMMENT ON COLUMN ap_inbox_deliveries.remote_actor_id IS 'Verified signing actor checkpoint. Actor deletion is restricted while the durable delivery remains.';
COMMENT ON COLUMN ap_inbox_deliveries.received_at IS 'When the API durably accepted the unverified envelope.';
COMMENT ON COLUMN ap_inbox_deliveries.enqueued_at IS 'Latest dispatch lease timestamp; recovery waits five minutes before replacing a missing queue job.';
COMMENT ON COLUMN ap_inbox_deliveries.processing_at IS 'Active worker lease timestamp; non-final retryable failures release it and stale crashes recover after thirty minutes.';
COMMENT ON COLUMN ap_inbox_deliveries.verified_at IS 'When the worker first verified the exact request signature and actor match; always paired with remote_actor_id.';
COMMENT ON COLUMN ap_inbox_deliveries.sender_allowed_at IS 'Set after the sender-hostname delivery rate limit admits this envelope; retries do not charge the sender again.';
COMMENT ON COLUMN ap_inbox_deliveries.deferred_until IS 'Earliest retry time after a valid sender exceeds its hostname delivery allowance.';
COMMENT ON COLUMN ap_inbox_deliveries.failed_at IS 'Set only after the queue exhausts retryable operational attempts. Manual backfill clears it and rotates the fencing token.';
COMMENT ON COLUMN ap_inbox_deliveries.last_error IS 'Latest bounded operational failure message for recovery and operator diagnostics.';

COMMENT ON TABLE ap_inbox_activities IS 'Replay-dedup ledger for the ActivityPub inbox receiver. The marker commits atomically with the activity core database effect; a second delivery of the same activity id is rejected before it reaches any write-path.';
