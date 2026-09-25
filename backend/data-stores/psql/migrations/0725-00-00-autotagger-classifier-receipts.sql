-- Durable claim/lease/completion ledger for the C6 embedding-path tagging classifier.
-- One receipt row exists per (subject, digest_version, digest) ever attempted; a changed
-- digest is a new identity and gets its own row and its own immutable batch_id. See
-- docs/overview/architecture/structured-decisions.md for the receipt/lease/outcome model.

CREATE TABLE IF NOT EXISTS autotagger_receipts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  post_id UUID REFERENCES posts ON DELETE CASCADE,
  rss_feed_item_id UUID REFERENCES rss_feed_items ON DELETE CASCADE,
  digest_version SMALLINT NOT NULL CHECK (digest_version >= 1),
  digest BYTEA NOT NULL CHECK (OCTET_LENGTH(digest) = 32),
  batch_id UUID NOT NULL,
  lease_token UUID,
  leased_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_autotagger_receipts__one_subject
    CHECK (num_nonnulls(post_id, rss_feed_item_id) = 1),
  CONSTRAINT chk_autotagger_receipts__lease_token_leased_at
    CHECK ((lease_token IS NULL) = (leased_at IS NULL)),
  CONSTRAINT chk_autotagger_receipts__lease_token_expires_at
    CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CONSTRAINT chk_autotagger_receipts__not_completed_while_leased
    CHECK (completed_at IS NULL OR lease_token IS NULL),
  CONSTRAINT uq_autotagger_receipts__batch_id UNIQUE (batch_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_autotagger_receipts__post_digest
ON autotagger_receipts (post_id, digest_version, digest) WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_autotagger_receipts__rss_feed_item_digest
ON autotagger_receipts (rss_feed_item_id, digest_version, digest) WHERE rss_feed_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_autotagger_receipts__lease_expires_at
ON autotagger_receipts (lease_expires_at) WHERE lease_token IS NOT NULL;

CREATE OR REPLACE TRIGGER trigger_autotagger_receipts_updated_at
BEFORE UPDATE ON autotagger_receipts
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE autotagger_receipts IS
  'Claim/lease/completion ledger for the C6 embedding-path tagging classifier. A changed digest is a new identity with its own row and batch_id.';
COMMENT ON COLUMN autotagger_receipts.post_id IS
  'Post subject of this receipt. Exactly one of post_id/rss_feed_item_id is set.';
COMMENT ON COLUMN autotagger_receipts.rss_feed_item_id IS
  'RSS feed item subject of this receipt. Exactly one of post_id/rss_feed_item_id is set.';
COMMENT ON COLUMN autotagger_receipts.digest_version IS
  'Version of the receipt digest composition, bumped whenever the hashed request shape changes.';
COMMENT ON COLUMN autotagger_receipts.digest IS
  'SHA-256 of the exact sanitized request state: wrapped state, rendered candidate IDs/text, ordered candidates, scope, effective cap, classifier/prompt IDs, and provider/model revision.';
COMMENT ON COLUMN autotagger_receipts.batch_id IS
  'Assigned at receipt creation; reused as classifier_decision_batches.id once a decision commits. Not a foreign key: the batch may not exist yet.';
COMMENT ON COLUMN autotagger_receipts.lease_token IS
  'Fencing token identifying the current exclusive claimant. NULL when unclaimed or completed.';
COMMENT ON COLUMN autotagger_receipts.leased_at IS
  'Clock time the current lease was acquired. NULL when unclaimed; cleared together with lease_token.';
COMMENT ON COLUMN autotagger_receipts.lease_expires_at IS
  'Clock time after which the current lease is stale and eligible for reclaim. NULL when unclaimed.';
COMMENT ON COLUMN autotagger_receipts.completed_at IS
  'Clock time at which the classifier decision committed and downstream vote application became safe to run idempotently.';

CREATE TABLE IF NOT EXISTS autotagger_receipt_attempts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  receipt_id UUID NOT NULL REFERENCES autotagger_receipts ON DELETE CASCADE,
  attempt_number SMALLINT NOT NULL CHECK (attempt_number >= 1),
  lease_token UUID NOT NULL,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('provider-error', 'invalid-result', 'expired')),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT uq_autotagger_receipt_attempts__receipt_attempt UNIQUE (receipt_id, attempt_number),
  CONSTRAINT uq_autotagger_receipt_attempts__receipt_lease_token UNIQUE (receipt_id, lease_token),
  CONSTRAINT chk_autotagger_receipt_attempts__terminal_exclusive
    CHECK (num_nonnulls(completed_at, failed_at) <= 1),
  CONSTRAINT chk_autotagger_receipt_attempts__outcome_requires_failure
    CHECK (failed_at IS NOT NULL OR outcome IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_autotagger_receipt_attempts__receipt_id__id
ON autotagger_receipt_attempts (receipt_id, id DESC);

COMMENT ON TABLE autotagger_receipt_attempts IS
  'Durable per-claim attempt ledger for autotagger_receipts. Records why a claim ended: completed, a provider error, an invalid result, or lease expiry.';
COMMENT ON COLUMN autotagger_receipt_attempts.receipt_id IS
  'Receipt this attempt was claimed against.';
COMMENT ON COLUMN autotagger_receipt_attempts.attempt_number IS
  'Ordinal of this attempt within its receipt, starting at 1.';
COMMENT ON COLUMN autotagger_receipt_attempts.lease_token IS
  'Fencing token matching the receipt lease active during this attempt.';
COMMENT ON COLUMN autotagger_receipt_attempts.completed_at IS
  'Clock time this attempt completed successfully. Mutually exclusive with failed_at.';
COMMENT ON COLUMN autotagger_receipt_attempts.failed_at IS
  'Clock time this attempt ended in failure. Mutually exclusive with completed_at.';
COMMENT ON COLUMN autotagger_receipt_attempts.outcome IS
  'Stable failure reason. NULL when the attempt completed successfully.';
