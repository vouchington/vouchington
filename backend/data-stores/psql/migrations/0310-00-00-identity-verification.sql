--
-- Identity Verification: paid government-ID check via Stripe Identity.
-- edited-in-place: pre-launch, never deployed to production
-- A government ID may verify only one account. The keyed fingerprint is retained for anti-reuse.
-- Raw document numbers are never stored; only the 32-byte HMAC-SHA256 fingerprint.

CREATE TYPE identity_verification_attempt_sources AS ENUM (
  'self_paid', 'membership_included', 'support_grant'
);

-- ============================================================================
-- verified_identities table
-- ============================================================================

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS verified_identities (
  identity_fingerprint BYTEA PRIMARY KEY CHECK (octet_length(identity_fingerprint) = 32),
  first_verified_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

COMMENT ON TABLE verified_identities IS 'Permanent minimum anti-reuse record: a keyed document hash with first-verification and revocation dates only, with no account or provider identity.';
COMMENT ON COLUMN verified_identities.identity_fingerprint IS '32-byte HMAC-SHA256 hash of (country:type:document_number). Never store the raw document number.';
COMMENT ON COLUMN verified_identities.first_verified_at IS 'First successful verification time.';
COMMENT ON COLUMN verified_identities.revoked_at IS 'When the document verification was revoked, if applicable.';

CREATE TABLE IF NOT EXISTS verified_identity_account_links (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  identity_fingerprint BYTEA NOT NULL UNIQUE REFERENCES verified_identities(identity_fingerprint) ON DELETE RESTRICT,
  provider_session_id TEXT NOT NULL UNIQUE
);
COMMENT ON TABLE verified_identity_account_links IS 'Live account and provider-session link for exact verification replay; removed on account deletion or revocation.';
COMMENT ON COLUMN verified_identity_account_links.user_id IS 'Live verified account.';
COMMENT ON COLUMN verified_identity_account_links.identity_fingerprint IS 'Keyed document fingerprint associated with this live account; the retained fingerprint row has no account link.';
COMMENT ON COLUMN verified_identity_account_links.provider_session_id IS 'Provider session retained only while the account link remains live for replay.';

-- Support grants are durable entitlements. Each funded Checkout uses a separate
-- child row so releasing it preserves the original Checkout audit record.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE identity_verification_attempts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source identity_verification_attempt_sources NOT NULL,
  grant_entitlement_attempt_id UUID REFERENCES identity_verification_attempts(id) ON DELETE RESTRICT,
  checkout_session_id TEXT UNIQUE,
  checkout_claimed_at TIMESTAMPTZ,
  provider_session_id TEXT UNIQUE,
  provider_creation_started_at TIMESTAMPTZ,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  granted_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  grant_note TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (source = 'support_grant' AND grant_entitlement_attempt_id IS NULL AND granted_by_id IS NOT NULL
      AND grant_note IS NOT NULL AND btrim(grant_note) <> '')
    OR (source = 'support_grant' AND grant_entitlement_attempt_id IS NOT NULL AND granted_by_id IS NULL
      AND grant_note IS NULL)
    OR (source <> 'support_grant' AND grant_entitlement_attempt_id IS NULL AND granted_by_id IS NULL
      AND grant_note IS NULL)
  ),
  CHECK (released_at IS NULL OR consumed_at IS NULL),
  CHECK (consumed_at IS NULL OR provider_creation_started_at IS NOT NULL)
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_identity_verification_attempts_updated_at
  BEFORE UPDATE ON identity_verification_attempts FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX uq_identity_verification_attempts__included_active_or_consumed
  ON identity_verification_attempts (user_id)
  WHERE source = 'membership_included'
    AND released_at IS NULL
    AND user_id <> '00000000-0000-7000-8000-000000000000'::uuid;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX uq_identity_verification_attempts__support_grant_active_child
  ON identity_verification_attempts (grant_entitlement_attempt_id)
  WHERE grant_entitlement_attempt_id IS NOT NULL AND released_at IS NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_identity_verification_attempts__user
  ON identity_verification_attempts (user_id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_identity_verification_attempts__grant_entitlement
  ON identity_verification_attempts (grant_entitlement_attempt_id)
  WHERE grant_entitlement_attempt_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_identity_verification_attempts__granted_by
  ON identity_verification_attempts (granted_by_id)
  WHERE granted_by_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_identity_verification_attempts__checkout_session
  ON identity_verification_attempts (checkout_session_id)
  WHERE checkout_session_id IS NOT NULL;

COMMENT ON TABLE identity_verification_attempts IS 'Durable identity-verification payment-attempt and entitlement audit. Support grants are parent entitlements; each Checkout is an immutable child attempt.';
COMMENT ON COLUMN identity_verification_attempts.user_id IS 'Account that owns this entitlement or Checkout attempt.';
COMMENT ON COLUMN identity_verification_attempts.source IS 'Whether the attempt was self-paid, included with membership, or funded by a support grant.';
COMMENT ON COLUMN identity_verification_attempts.grant_entitlement_attempt_id IS 'Parent support-grant entitlement funding this Checkout attempt. Released child attempts retain their Checkout audit history.';
COMMENT ON COLUMN identity_verification_attempts.checkout_session_id IS 'Stripe Checkout Session that funded this attempt.';
COMMENT ON COLUMN identity_verification_attempts.checkout_claimed_at IS 'When the guarded user payment-pending transition durably claimed this exact Checkout. Reconciles acknowledgement loss without returning a concurrent loser session.';
COMMENT ON COLUMN identity_verification_attempts.provider_session_id IS 'Stripe Identity verification session created for this Checkout attempt.';
COMMENT ON COLUMN identity_verification_attempts.provider_creation_started_at IS 'When creation of the Stripe Identity session began, used to recover interrupted creation.';
COMMENT ON COLUMN identity_verification_attempts.reserved_at IS 'When this entitlement or attempt was reserved for verification.';
COMMENT ON COLUMN identity_verification_attempts.released_at IS 'When an unused entitlement or attempt was released.';
COMMENT ON COLUMN identity_verification_attempts.consumed_at IS 'When this entitlement or attempt was consumed to create a provider verification session.';
COMMENT ON COLUMN identity_verification_attempts.granted_by_id IS 'Administrator who issued a parent support-grant entitlement.';
COMMENT ON COLUMN identity_verification_attempts.grant_note IS 'Required support rationale recorded on a parent support-grant entitlement.';
