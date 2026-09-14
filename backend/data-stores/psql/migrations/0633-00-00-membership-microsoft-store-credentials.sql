CREATE TABLE IF NOT EXISTS membership_microsoft_store_credentials (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  environment membership_provider_environments NOT NULL,
  application_id TEXT NOT NULL,
  publisher_user_id TEXT NOT NULL,
  collections_key_lookup_sha256 TEXT NOT NULL CHECK (collections_key_lookup_sha256 ~ '^[a-f0-9]{64}$'),
  encrypted_collections_key BYTEA NOT NULL,
  purchase_key_lookup_sha256 TEXT NOT NULL CHECK (purchase_key_lookup_sha256 ~ '^[a-f0-9]{64}$'),
  encrypted_purchase_key BYTEA NOT NULL,
  collections_issued_at TIMESTAMPTZ NOT NULL, collections_expires_at TIMESTAMPTZ NOT NULL,
  purchase_issued_at TIMESTAMPTZ NOT NULL, purchase_expires_at TIMESTAMPTZ NOT NULL,
  collection_item_id TEXT, last_verified_end_at TIMESTAMPTZ, last_verified_at TIMESTAMPTZ,
  next_reconciliation_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processing_claim_token UUID, processing_claimed_at TIMESTAMPTZ, processing_attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT, created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (char_length(application_id) BETWEEN 1 AND 255 AND application_id = TRIM(application_id)),
  CHECK (publisher_user_id = user_id::TEXT), CHECK (octet_length(encrypted_collections_key) BETWEEN 1 AND 65536),
  CHECK (octet_length(encrypted_purchase_key) BETWEEN 1 AND 65536), CHECK (processing_attempts >= 0),
  CHECK ((processing_claim_token IS NULL) = (processing_claimed_at IS NULL))
);
CREATE OR REPLACE TRIGGER trigger_membership_microsoft_store_credentials_updated_at BEFORE UPDATE ON membership_microsoft_store_credentials FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_microsoft_store_credentials__user_context ON membership_microsoft_store_credentials (user_id, environment, application_id);
CREATE INDEX IF NOT EXISTS idx_membership_microsoft_store_credentials__due ON membership_microsoft_store_credentials (next_reconciliation_at, id) WHERE processing_claim_token IS NULL;
CREATE INDEX IF NOT EXISTS idx_membership_verifications__pending_microsoft_source_recovery ON membership_verifications (user_id, environment, application_id, request_fingerprint) WHERE provider = 'microsoft_store' AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL;
CREATE TABLE IF NOT EXISTS membership_microsoft_store_recovery_cursors (
  id TEXT PRIMARY KEY, last_source_id UUID, sweep_upper_bound_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (id = 'active_sources')
);
CREATE OR REPLACE TRIGGER trigger_membership_microsoft_store_recovery_cursors_updated_at BEFORE UPDATE ON membership_microsoft_store_recovery_cursors FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
COMMENT ON TABLE membership_microsoft_store_credentials IS 'Encrypted account-scoped Microsoft Store ID keys, usable to reconcile every Microsoft recurrence for the same user, environment, and application.';
COMMENT ON COLUMN membership_microsoft_store_credentials.user_id IS 'Voucha account owning the Store ID credentials.';
COMMENT ON COLUMN membership_microsoft_store_credentials.environment IS 'Microsoft Store test or production environment for the credential.';
COMMENT ON COLUMN membership_microsoft_store_credentials.application_id IS 'Publisher application identity used for Store queries.';
COMMENT ON COLUMN membership_microsoft_store_credentials.publisher_user_id IS 'Account-bound publisher user identifier in the Store ID ticket.';
COMMENT ON COLUMN membership_microsoft_store_credentials.collections_key_lookup_sha256 IS 'Digest used to recognize an unchanged Collections ID key without retaining plaintext.';
COMMENT ON COLUMN membership_microsoft_store_credentials.encrypted_collections_key IS 'Encrypted Collections ID key used only for authoritative Store API queries.';
COMMENT ON COLUMN membership_microsoft_store_credentials.collections_issued_at IS 'Issued-at claim of the last authoritatively validated Collections ID key.';
COMMENT ON COLUMN membership_microsoft_store_credentials.purchase_key_lookup_sha256 IS 'Digest used to recognize an unchanged Purchase ID key without retaining plaintext.';
COMMENT ON COLUMN membership_microsoft_store_credentials.encrypted_purchase_key IS 'Encrypted Purchase ID key used only for authoritative Store API queries.';
COMMENT ON COLUMN membership_microsoft_store_credentials.purchase_issued_at IS 'Issued-at claim of the last authoritatively validated Purchase ID key.';
COMMENT ON COLUMN membership_microsoft_store_credentials.collections_expires_at IS 'Expiration of the refreshable Collections ID key.';
COMMENT ON COLUMN membership_microsoft_store_credentials.purchase_expires_at IS 'Expiration of the refreshable Purchase ID key.';
COMMENT ON COLUMN membership_microsoft_store_credentials.collection_item_id IS 'Last authoritative Collections item identifier observed for this account.';
COMMENT ON COLUMN membership_microsoft_store_credentials.last_verified_end_at IS 'Last authoritative paid-through time observed from Store recurrence state.';
COMMENT ON COLUMN membership_microsoft_store_credentials.last_verified_at IS 'Time of the most recent successful authoritative Store query.';
COMMENT ON COLUMN membership_microsoft_store_credentials.next_reconciliation_at IS 'Earliest time this credential becomes due for reconciliation.';
COMMENT ON COLUMN membership_microsoft_store_credentials.processing_claim_token IS 'Ephemeral fencing token for an active reconciliation claim.';
COMMENT ON COLUMN membership_microsoft_store_credentials.processing_claimed_at IS 'Time the current reconciliation claim was acquired.';
COMMENT ON COLUMN membership_microsoft_store_credentials.processing_attempts IS 'Number of unsuccessful reconciliation attempts in the current cycle.';
COMMENT ON COLUMN membership_microsoft_store_credentials.last_error IS 'Last retryable reconciliation error for operator diagnosis.';
COMMENT ON TABLE membership_microsoft_store_recovery_cursors IS 'Single durable high-water mark for Microsoft Store active-source recovery.';
COMMENT ON COLUMN membership_microsoft_store_recovery_cursors.last_source_id IS 'Last source UUID scanned in the current keyset recovery pass.';
COMMENT ON COLUMN membership_microsoft_store_recovery_cursors.sweep_upper_bound_id IS 'Frozen UUIDv7 upper bound for one finite active-source recovery sweep.';
