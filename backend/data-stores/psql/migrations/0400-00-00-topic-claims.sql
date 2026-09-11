-- edited-in-place: pre-launch, never deployed to production
DO $$
BEGIN
  CREATE TYPE topic_claim_verification_methods AS ENUM ('dns_txt', 'well_known_file', 'manual_admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS topic_claims (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  topic_id uuid NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  claimant_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  verification_method topic_claim_verification_methods,
  claimed_role text NOT NULL DEFAULT '' CHECK (char_length(claimed_role) <= 255),
  evidence text NOT NULL DEFAULT '',

  -- Lifecycle timestamps (state derived from these, no status column)
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  rejected_at timestamptz,
  rejected_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  rejection_reason text,
  revoked_at timestamptz,
  revoked_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  revocation_reason text,

  -- Domain verification columns
  verification_hostname_id uuid REFERENCES url_hostnames (id) ON DELETE SET NULL,
  verification_token_hash text,
  verification_token_issued_at timestamptz,
  domain_verified_at timestamptz,

  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- State consistency checks
  CONSTRAINT chk_topic_claims__verified_xor_rejected
    CHECK (NOT (verified_at IS NOT NULL AND rejected_at IS NOT NULL)),
  CONSTRAINT chk_topic_claims__revoke_requires_verify
    CHECK (revoked_at IS NULL OR verified_at IS NOT NULL),
  CONSTRAINT chk_topic_claims__rejection_reason
    CHECK (rejected_at IS NULL OR rejection_reason IS NOT NULL),
  CONSTRAINT chk_topic_claims__revocation_reason
    CHECK (revoked_at IS NULL OR revocation_reason IS NOT NULL)
);

-- One live claim per (topic, user): allows re-claim after rejection/revocation
CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_claims__topic_user_live
  ON topic_claims (topic_id, claimant_user_id)
  WHERE rejected_at IS NULL AND revoked_at IS NULL;

-- Hot path for dispute authorization: verified, non-revoked claims
CREATE INDEX IF NOT EXISTS idx_topic_claims__verified
  ON topic_claims (topic_id, claimant_user_id)
  WHERE verified_at IS NOT NULL AND revoked_at IS NULL;

-- "My claims" list
CREATE INDEX IF NOT EXISTS idx_topic_claims__claimant
  ON topic_claims (claimant_user_id, id DESC);

-- Staff pending-review queue
CREATE INDEX IF NOT EXISTS idx_topic_claims__pending
  ON topic_claims (submitted_at DESC)
  WHERE submitted_at IS NOT NULL AND verified_at IS NULL AND rejected_at IS NULL;

-- FK-backing indexes
CREATE INDEX IF NOT EXISTS idx_topic_claims__topic_id ON topic_claims (topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_claims__verified_by_id ON topic_claims (verified_by_id) WHERE verified_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_claims__rejected_by_id ON topic_claims (rejected_by_id) WHERE rejected_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_claims__revoked_by_id ON topic_claims (revoked_by_id) WHERE revoked_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topic_claims__verification_hostname_id ON topic_claims (verification_hostname_id) WHERE verification_hostname_id IS NOT NULL;

CREATE OR REPLACE TRIGGER trigger_topic_claims_updated_at
  BEFORE UPDATE ON topic_claims
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE topic_claims IS 'Ownership claims by users representing the real-world entity behind a topic (e.g. an issuer, brand, or operator). A verified claim grants the claimant standing to dispute reviews of that topic.';
COMMENT ON COLUMN topic_claims.topic_id IS 'The topic being claimed.';
COMMENT ON COLUMN topic_claims.claimant_user_id IS 'The user asserting ownership of the topic.';
COMMENT ON COLUMN topic_claims.verification_method IS 'How the claim was verified: dns_txt (DNS TXT record), well_known_file (HTTP well-known file), or manual_admin (staff approval).';
COMMENT ON COLUMN topic_claims.claimed_role IS 'Free-text description of the claimant''s role (e.g. "Card issuer", "Program operator").';
COMMENT ON COLUMN topic_claims.evidence IS 'Supporting evidence submitted for manual admin verification.';
COMMENT ON COLUMN topic_claims.submitted_at IS 'When the claimant submitted evidence for manual review.';
COMMENT ON COLUMN topic_claims.verified_at IS 'When the claim was verified. NULL for pending or rejected claims.';
COMMENT ON COLUMN topic_claims.verified_by_id IS 'Staff who approved the claim (NULL for self-serve domain verification).';
COMMENT ON COLUMN topic_claims.rejected_at IS 'When the claim was rejected.';
COMMENT ON COLUMN topic_claims.rejection_reason IS 'Reason for rejection, required when rejected_at is set.';
COMMENT ON COLUMN topic_claims.revoked_at IS 'When a verified claim was revoked by staff.';
COMMENT ON COLUMN topic_claims.revocation_reason IS 'Reason for revocation, required when revoked_at is set.';
COMMENT ON COLUMN topic_claims.verification_hostname_id IS 'The hostname used for domain verification (from topics.hostname_id at claim time).';
COMMENT ON COLUMN topic_claims.verification_token_hash IS 'HMAC-SHA256 of the issued verification token. The raw token is never persisted.';
COMMENT ON COLUMN topic_claims.verification_token_issued_at IS 'When the domain verification token was issued.';
COMMENT ON COLUMN topic_claims.domain_verified_at IS 'When domain control was successfully verified (DNS or well-known file probe).';
COMMENT ON COLUMN topic_claims.rejected_by_id IS 'Staff who rejected the claim.';
COMMENT ON COLUMN topic_claims.revoked_by_id IS 'Staff who revoked the verified claim.';
