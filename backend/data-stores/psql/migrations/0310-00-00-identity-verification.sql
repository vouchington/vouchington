--
-- Identity Verification: paid government-ID check via Stripe Identity.
-- edited-in-place: pre-launch, never deployed to production
-- A government ID may verify only one active account at a time (partial unique index).
-- Raw document numbers are never stored; only a 64-char HMAC fingerprint.

CREATE TYPE identity_verification_attempt_sources AS ENUM (
  'self_paid', 'membership_included', 'support_grant'
);

-- ============================================================================
-- verified_identities table
-- ============================================================================

CREATE TABLE IF NOT EXISTS verified_identities (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider identity_verification_providers NOT NULL,
  provider_session_id TEXT NOT NULL,
  identity_fingerprint TEXT NOT NULL CHECK (char_length(identity_fingerprint) = 64),
  issuing_country TEXT NOT NULL,
  document_type TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL,
  checkout_session_id TEXT NOT NULL,
  revoked_at TIMESTAMPTZ,
  transferred_to_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trigger_verified_identities_updated_at
  BEFORE UPDATE ON verified_identities FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE verified_identities IS 'Records of successfully verified identities. Raw document numbers are never stored; only a 64-char HMAC fingerprint.';
COMMENT ON COLUMN verified_identities.user_id IS 'The account that completed the verification.';
COMMENT ON COLUMN verified_identities.provider IS 'Provider that performed the verification.';
COMMENT ON COLUMN verified_identities.provider_session_id IS 'Provider-specific session or report ID.';
COMMENT ON COLUMN verified_identities.identity_fingerprint IS '64-char hex HMAC-SHA256 fingerprint of (country:type:document_number). Never store the raw document number.';
COMMENT ON COLUMN verified_identities.issuing_country IS 'ISO country code of the issuing authority.';
COMMENT ON COLUMN verified_identities.document_type IS 'Document type (passport, id_card, driving_license, etc.).';
COMMENT ON COLUMN verified_identities.verified_at IS 'When the provider confirmed the identity.';
COMMENT ON COLUMN verified_identities.checkout_session_id IS 'Stripe Checkout Session that collected payment for this verification.';
COMMENT ON COLUMN verified_identities.revoked_at IS 'Set when the record is revoked by an admin.';
COMMENT ON COLUMN verified_identities.transferred_to_user_id IS 'When transferred, the account that now holds the active record.';
COMMENT ON COLUMN verified_identities.created_at IS 'Row creation timestamp.';
COMMENT ON COLUMN verified_identities.updated_at IS 'Row last-updated timestamp.';

-- One active verified identity per fingerprint (one document = one active account)
CREATE UNIQUE INDEX IF NOT EXISTS uq_verified_identities__fingerprint_active
  ON verified_identities (identity_fingerprint)
  WHERE revoked_at IS NULL AND transferred_to_user_id IS NULL;

-- One active verified identity per user (a user can hold only one active identity)
CREATE UNIQUE INDEX IF NOT EXISTS uq_verified_identities__user_active
  ON verified_identities (user_id)
  WHERE revoked_at IS NULL AND transferred_to_user_id IS NULL;

-- Support grants are durable entitlements. Each funded Checkout uses a separate
-- child row so releasing it preserves the original Checkout audit record.
CREATE TABLE identity_verification_attempts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source identity_verification_attempt_sources NOT NULL,
  grant_entitlement_id UUID REFERENCES identity_verification_attempts(id) ON DELETE RESTRICT,
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
    (source = 'support_grant' AND grant_entitlement_id IS NULL AND granted_by_id IS NOT NULL
      AND grant_note IS NOT NULL AND btrim(grant_note) <> '')
    OR (source = 'support_grant' AND grant_entitlement_id IS NOT NULL AND granted_by_id IS NULL
      AND grant_note IS NULL)
    OR (source <> 'support_grant' AND grant_entitlement_id IS NULL AND granted_by_id IS NULL
      AND grant_note IS NULL)
  ),
  CHECK (released_at IS NULL OR consumed_at IS NULL),
  CHECK (consumed_at IS NULL OR provider_creation_started_at IS NOT NULL)
);

CREATE OR REPLACE TRIGGER trigger_identity_verification_attempts_updated_at
  BEFORE UPDATE ON identity_verification_attempts FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX uq_identity_verification_attempts__included_active_or_consumed
  ON identity_verification_attempts (user_id)
  WHERE source = 'membership_included'
    AND released_at IS NULL
    AND user_id <> '00000000-0000-7000-8000-000000000000'::uuid;

CREATE UNIQUE INDEX uq_identity_verification_attempts__support_grant_active_child
  ON identity_verification_attempts (grant_entitlement_id)
  WHERE grant_entitlement_id IS NOT NULL AND released_at IS NULL;

CREATE INDEX ix_identity_verification_attempts__user
  ON identity_verification_attempts (user_id);

CREATE INDEX ix_identity_verification_attempts__grant_entitlement
  ON identity_verification_attempts (grant_entitlement_id)
  WHERE grant_entitlement_id IS NOT NULL;

CREATE INDEX ix_identity_verification_attempts__granted_by
  ON identity_verification_attempts (granted_by_id)
  WHERE granted_by_id IS NOT NULL;

CREATE INDEX ix_identity_verification_attempts__checkout_session
  ON identity_verification_attempts (checkout_session_id)
  WHERE checkout_session_id IS NOT NULL;

COMMENT ON TABLE identity_verification_attempts IS 'Durable identity-verification payment-attempt and entitlement audit. Support grants are parent entitlements; each Checkout is an immutable child attempt.';
COMMENT ON COLUMN identity_verification_attempts.user_id IS 'Account that owns this entitlement or Checkout attempt.';
COMMENT ON COLUMN identity_verification_attempts.source IS 'Whether the attempt was self-paid, included with membership, or funded by a support grant.';
COMMENT ON COLUMN identity_verification_attempts.grant_entitlement_id IS 'Parent support-grant entitlement funding this Checkout attempt. Released child attempts retain their Checkout audit history.';
COMMENT ON COLUMN identity_verification_attempts.checkout_session_id IS 'Stripe Checkout Session that funded this attempt.';
COMMENT ON COLUMN identity_verification_attempts.checkout_claimed_at IS 'When the guarded user payment-pending transition durably claimed this exact Checkout. Reconciles acknowledgement loss without returning a concurrent loser session.';
COMMENT ON COLUMN identity_verification_attempts.provider_session_id IS 'Stripe Identity verification session created for this Checkout attempt.';
COMMENT ON COLUMN identity_verification_attempts.provider_creation_started_at IS 'When creation of the Stripe Identity session began, used to recover interrupted creation.';
COMMENT ON COLUMN identity_verification_attempts.reserved_at IS 'When this entitlement or attempt was reserved for verification.';
COMMENT ON COLUMN identity_verification_attempts.released_at IS 'When an unused entitlement or attempt was released.';
COMMENT ON COLUMN identity_verification_attempts.consumed_at IS 'When this entitlement or attempt was consumed to create a provider verification session.';
COMMENT ON COLUMN identity_verification_attempts.granted_by_id IS 'Administrator who issued a parent support-grant entitlement.';
COMMENT ON COLUMN identity_verification_attempts.grant_note IS 'Required support rationale recorded on a parent support-grant entitlement.';
