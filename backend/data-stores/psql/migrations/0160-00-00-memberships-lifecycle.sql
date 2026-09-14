-- Coalesced pre-launch membership domain baseline. Never deployed to production.

DO $$ BEGIN CREATE TYPE membership_plan_slugs AS ENUM ('plus', 'pro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE membership_billing_intervals AS ENUM ('monthly', 'yearly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE membership_provider_kinds AS ENUM ('stripe', 'apple_app_store', 'google_play', 'microsoft_store', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE membership_provider_environments AS ENUM ('test', 'production'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE membership_source_kinds AS ENUM ('direct', 'family', 'admin_grant'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE membership_change_types AS ENUM ('source_observed', 'renewal', 'upgrade', 'downgrade', 'sku_migration', 'cancellation', 'pause', 'reactivation', 'expiration', 'admin_grant', 'admin_revoke', 'refund'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE membership_refund_reasons AS ENUM ('goodwill', 'requested', 'dispute', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE membership_refund_sources AS ENUM ('admin', 'stripe_dashboard'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE membership_operation_kinds AS ENUM ('cancel_source', 'automatic_refund', 'ineligible_purchase_reversal', 'collision_resolution', 'administrator_refund'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE membership_verification_result_codes AS ENUM ('verified', 'competing_direct_source', 'invalid_evidence', 'wrong_account', 'wrong_application', 'wrong_environment', 'wrong_product', 'revoked', 'expired', 'purchase_pending', 'missing_account_token', 'stale_evidence'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS membership_products (
  id UUID PRIMARY KEY DEFAULT uuidv7(), plan membership_plan_slugs NOT NULL,
  billing_interval membership_billing_intervals NOT NULL,
  retired_at TIMESTAMPTZ, created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trigger_membership_products_updated_at BEFORE UPDATE ON membership_products FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_products__active_plan_interval ON membership_products (plan, billing_interval) WHERE retired_at IS NULL;

CREATE TABLE IF NOT EXISTS membership_provider_products (
  id UUID PRIMARY KEY DEFAULT uuidv7(), membership_product_id UUID NOT NULL REFERENCES membership_products(id) ON DELETE RESTRICT,
  provider membership_provider_kinds NOT NULL, environment membership_provider_environments NOT NULL,
  application_id TEXT NOT NULL, provider_product_id TEXT NOT NULL, base_plan_id TEXT, offer_id TEXT, sku_id TEXT,
  price_minor_units BIGINT CHECK (price_minor_units BETWEEN 0 AND 9007199254740991),
  currency_code TEXT REFERENCES currencies(code) ON DELETE RESTRICT, retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (provider <> 'admin'),
  CHECK (num_nonnulls(price_minor_units, currency_code) IN (0, 2)),
  CHECK (char_length(application_id) BETWEEN 1 AND 255 AND application_id = TRIM(application_id)),
  CHECK (char_length(provider_product_id) BETWEEN 1 AND 255 AND provider_product_id = TRIM(provider_product_id)),
  CHECK (base_plan_id IS NULL OR (char_length(base_plan_id) BETWEEN 1 AND 255 AND base_plan_id = TRIM(base_plan_id))),
  CHECK (offer_id IS NULL OR (char_length(offer_id) BETWEEN 1 AND 255 AND offer_id = TRIM(offer_id))),
  CHECK (sku_id IS NULL OR (char_length(sku_id) BETWEEN 1 AND 255 AND sku_id = TRIM(sku_id)))
);
CREATE OR REPLACE TRIGGER trigger_membership_provider_products_updated_at BEFORE UPDATE ON membership_provider_products FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_provider_products__provider_identity ON membership_provider_products (provider, environment, application_id, provider_product_id, base_plan_id, offer_id, sku_id) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_provider_products__id_context ON membership_provider_products (id, membership_product_id, provider, environment, application_id);
CREATE INDEX IF NOT EXISTS idx_membership_provider_products__membership_product_id ON membership_provider_products (membership_product_id);
CREATE INDEX IF NOT EXISTS idx_membership_provider_products__currency_code ON membership_provider_products (currency_code);

CREATE TABLE IF NOT EXISTS membership_provider_lineages (
  id UUID PRIMARY KEY DEFAULT uuidv7(), provider membership_provider_kinds NOT NULL, environment membership_provider_environments NOT NULL, application_id TEXT NOT NULL, provider_lineage_id TEXT NOT NULL, provider_account_id TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (provider <> 'admin'), CHECK (char_length(application_id) BETWEEN 1 AND 255 AND application_id = TRIM(application_id)),
  CHECK (char_length(provider_lineage_id) BETWEEN 1 AND 255 AND provider_lineage_id = TRIM(provider_lineage_id)),
  CHECK (provider_account_id IS NULL OR (char_length(provider_account_id) BETWEEN 1 AND 255 AND provider_account_id = TRIM(provider_account_id)))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_provider_lineages__provider_lineage ON membership_provider_lineages (provider, environment, application_id, provider_lineage_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_provider_lineages__id_context ON membership_provider_lineages (id, provider, environment, application_id);
CREATE FUNCTION fn_reject_membership_provider_lineage_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.provider_account_id IS NULL
    AND NEW.provider_account_id IS NOT NULL
    AND ROW(
      NEW.id, NEW.provider, NEW.environment, NEW.application_id, NEW.provider_lineage_id
    ) IS NOT DISTINCT FROM ROW(
      OLD.id, OLD.provider, OLD.environment, OLD.application_id, OLD.provider_lineage_id
    )
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'membership provider lineages are immutable';
END $$;
CREATE TRIGGER trigger_membership_provider_lineages_immutable BEFORE UPDATE OR DELETE ON membership_provider_lineages FOR EACH ROW EXECUTE FUNCTION fn_reject_membership_provider_lineage_mutation();

-- The account reference is nullable on final purge; binding history remains durable after SET NULL.
CREATE TABLE IF NOT EXISTS membership_lineage_bindings (
  id UUID PRIMARY KEY DEFAULT uuidv7(), membership_provider_lineage_id UUID NOT NULL REFERENCES membership_provider_lineages(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, source_kind membership_source_kinds NOT NULL DEFAULT 'direct', bound_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, released_at TIMESTAMPTZ, release_reason TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (source_kind <> 'admin_grant'),
  CHECK ((released_at IS NULL) = (release_reason IS NULL)), CHECK (released_at IS NULL OR released_at >= bound_at),
  CHECK (released_at IS NOT NULL OR user_id IS NOT NULL),
  CHECK (release_reason IS NULL OR (char_length(release_reason) BETWEEN 1 AND 255 AND release_reason = TRIM(release_reason)))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_lineage_bindings__current_direct_lineage ON membership_lineage_bindings (membership_provider_lineage_id) WHERE released_at IS NULL AND source_kind = 'direct';
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_lineage_bindings__current_family_lineage_user ON membership_lineage_bindings (membership_provider_lineage_id, user_id) WHERE released_at IS NULL AND source_kind = 'family';
CREATE INDEX IF NOT EXISTS idx_membership_lineage_bindings__lineage_id ON membership_lineage_bindings (membership_provider_lineage_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_membership_lineage_bindings__user_id ON membership_lineage_bindings (user_id, id DESC);

CREATE TABLE IF NOT EXISTS membership_provider_evidence_records (
  id UUID PRIMARY KEY DEFAULT uuidv7(), provider membership_provider_kinds NOT NULL, environment membership_provider_environments NOT NULL, application_id TEXT NOT NULL,
  membership_provider_lineage_id UUID, provider_event_id TEXT, evidence_lookup_sha256 TEXT NOT NULL CHECK (evidence_lookup_sha256 ~ '^[a-f0-9]{64}$'), encrypted_evidence BYTEA NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, verified_at TIMESTAMPTZ, rejected_at TIMESTAMPTZ, rejection_reason TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (provider <> 'admin'), CHECK (char_length(application_id) BETWEEN 1 AND 255 AND application_id = TRIM(application_id)),
  CHECK (octet_length(encrypted_evidence) BETWEEN 1 AND 65536), CHECK (num_nonnulls(verified_at, rejected_at) <= 1),
  CHECK (rejection_reason IS NULL OR (rejected_at IS NOT NULL AND char_length(rejection_reason) BETWEEN 1 AND 1000 AND rejection_reason = TRIM(rejection_reason))),
  CHECK (provider_event_id IS NULL OR (char_length(provider_event_id) BETWEEN 1 AND 255 AND provider_event_id = TRIM(provider_event_id))),
  CONSTRAINT fk_membership_provider_evidence_records__lineage_context FOREIGN KEY (membership_provider_lineage_id, provider, environment, application_id) REFERENCES membership_provider_lineages(id, provider, environment, application_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_provider_evidence_records__id_context ON membership_provider_evidence_records (id, provider, environment, application_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_provider_evidence_records__id_lineage_context ON membership_provider_evidence_records (id, membership_provider_lineage_id, provider, environment, application_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_provider_evidence_records__context_event ON membership_provider_evidence_records (provider, environment, application_id, provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_provider_evidence_records__context_lookup ON membership_provider_evidence_records (provider, environment, application_id, evidence_lookup_sha256);
CREATE INDEX IF NOT EXISTS idx_membership_provider_evidence_records__lineage_id ON membership_provider_evidence_records (membership_provider_lineage_id, id DESC);

CREATE TABLE IF NOT EXISTS membership_provider_observations (
  id UUID PRIMARY KEY DEFAULT uuidv7(), provider membership_provider_kinds NOT NULL, environment membership_provider_environments NOT NULL, application_id TEXT NOT NULL,
  membership_provider_evidence_id UUID NOT NULL, membership_provider_lineage_id UUID NOT NULL,
  membership_provider_product_id UUID NOT NULL, membership_product_id UUID NOT NULL,
  observed_price_minor_units BIGINT CHECK (observed_price_minor_units BETWEEN 0 AND 9007199254740991),
  observed_price_currency_code TEXT REFERENCES currencies(code) ON DELETE RESTRICT,
  renewal_membership_provider_product_id UUID, renewal_membership_product_id UUID,
  renewal_price_minor_units BIGINT CHECK (renewal_price_minor_units BETWEEN 0 AND 9007199254740991),
  renewal_price_currency_code TEXT REFERENCES currencies(code) ON DELETE RESTRICT,
  renewal_effective_at TIMESTAMPTZ,
  provider_revision TEXT NOT NULL, provider_order BIGINT NOT NULL,
  source_kind membership_source_kinds NOT NULL, effective_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ, past_due_at TIMESTAMPTZ, paused_at TIMESTAMPTZ,
  auto_renews BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  terminal_at TIMESTAMPTZ,
  CHECK (provider <> 'admin'), CHECK (char_length(application_id) BETWEEN 1 AND 255 AND application_id = TRIM(application_id)),
  CHECK (num_nonnulls(observed_price_minor_units, observed_price_currency_code) IN (0, 2)),
  CHECK (char_length(provider_revision) BETWEEN 1 AND 255 AND provider_revision = TRIM(provider_revision)), CHECK (provider_order >= 0),
  CHECK (source_kind <> 'admin_grant'), CHECK (expires_at IS NULL OR expires_at >= effective_at), CHECK (cancelled_at IS NULL OR cancelled_at >= effective_at),
  CHECK (expired_at IS NULL OR expired_at >= effective_at), CHECK (past_due_at IS NULL OR past_due_at >= effective_at),
  CHECK (paused_at IS NULL OR paused_at >= effective_at), CHECK (num_nonnulls(cancelled_at, expired_at, past_due_at, paused_at) <= 1),
  CHECK (num_nonnulls(renewal_membership_provider_product_id, renewal_membership_product_id, renewal_price_minor_units, renewal_price_currency_code, renewal_effective_at) IN (0, 5)),
  CHECK (renewal_membership_provider_product_id IS NULL OR (auto_renews AND source_kind = 'direct')),
  CHECK (renewal_effective_at IS NULL OR renewal_effective_at >= effective_at),
  CONSTRAINT fk_membership_provider_observations__evidence_context FOREIGN KEY (membership_provider_evidence_id, membership_provider_lineage_id, provider, environment, application_id) REFERENCES membership_provider_evidence_records(id, membership_provider_lineage_id, provider, environment, application_id) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_provider_observations__lineage_context FOREIGN KEY (membership_provider_lineage_id, provider, environment, application_id) REFERENCES membership_provider_lineages(id, provider, environment, application_id) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_provider_observations__product_context FOREIGN KEY (membership_provider_product_id, membership_product_id, provider, environment, application_id) REFERENCES membership_provider_products(id, membership_product_id, provider, environment, application_id) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_provider_observations__renewal_product_context FOREIGN KEY (renewal_membership_provider_product_id, renewal_membership_product_id, provider, environment, application_id) REFERENCES membership_provider_products(id, membership_product_id, provider, environment, application_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_provider_observations__evidence_id ON membership_provider_observations (membership_provider_evidence_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_provider_observations__lineage_revision ON membership_provider_observations (membership_provider_lineage_id, provider_revision, provider_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_provider_observations__id_lineage_product_kind ON membership_provider_observations (id, membership_provider_lineage_id, membership_product_id, source_kind);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_provider_observations__id_renewal_snapshot ON membership_provider_observations (id, renewal_membership_provider_product_id, renewal_price_minor_units, renewal_price_currency_code, renewal_effective_at);
CREATE INDEX IF NOT EXISTS idx_membership_provider_observations__lineage_effective ON membership_provider_observations (membership_provider_lineage_id, effective_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_membership_provider_observations__provider_product_id ON membership_provider_observations (membership_provider_product_id);
CREATE INDEX IF NOT EXISTS idx_membership_provider_observations__observed_currency ON membership_provider_observations (observed_price_currency_code);
CREATE INDEX IF NOT EXISTS idx_membership_provider_observations__renewal_product ON membership_provider_observations (renewal_membership_provider_product_id) WHERE renewal_membership_provider_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_membership_provider_observations__renewal_currency ON membership_provider_observations (renewal_price_currency_code) WHERE renewal_price_currency_code IS NOT NULL;
CREATE FUNCTION fn_require_verified_membership_provider_observation_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM membership_provider_evidence_records evidence
    WHERE evidence.id = NEW.membership_provider_evidence_id
      AND evidence.verified_at IS NOT NULL AND evidence.rejected_at IS NULL
  ) THEN
    RAISE EXCEPTION 'membership provider observations require verified evidence' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trigger_membership_provider_observations_verified_evidence BEFORE INSERT ON membership_provider_observations FOR EACH ROW EXECUTE FUNCTION fn_require_verified_membership_provider_observation_evidence();
CREATE FUNCTION fn_reject_membership_provider_observation_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'membership provider observations are immutable';
END $$;
CREATE TRIGGER trigger_membership_provider_observations_immutable BEFORE UPDATE OR DELETE ON membership_provider_observations FOR EACH ROW EXECUTE FUNCTION fn_reject_membership_provider_observation_mutation();

CREATE TABLE IF NOT EXISTS membership_purchase_intents (
  id UUID PRIMARY KEY DEFAULT uuidv7(), user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key UUID NOT NULL, request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  membership_provider_product_id UUID NOT NULL, membership_product_id UUID NOT NULL,
  provider membership_provider_kinds NOT NULL, environment membership_provider_environments NOT NULL, application_id TEXT NOT NULL,
  provider_checkout_id TEXT, provider_checkout_url TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '30 minutes',
  launched_at TIMESTAMPTZ, failed_at TIMESTAMPTZ, failure_code TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (provider <> 'admin'), CHECK (char_length(application_id) BETWEEN 1 AND 255 AND application_id = TRIM(application_id)),
  CHECK ((provider_checkout_id IS NULL) = (provider_checkout_url IS NULL)),
  CHECK (expires_at > uuid_extract_timestamp(id)),
  CHECK (provider_checkout_id IS NULL OR (provider = 'stripe' AND char_length(provider_checkout_id) BETWEEN 1 AND 255 AND provider_checkout_id = TRIM(provider_checkout_id))),
  CHECK (provider_checkout_url IS NULL OR char_length(provider_checkout_url) BETWEEN 1 AND 2048),
  CHECK (num_nonnulls(launched_at, failed_at) <= 1),
  CHECK ((failed_at IS NULL) = (failure_code IS NULL)),
  CHECK (failure_code IS NULL OR (char_length(failure_code) BETWEEN 1 AND 255 AND failure_code = TRIM(failure_code))),
  CONSTRAINT fk_membership_purchase_intents__provider_product_context FOREIGN KEY (membership_provider_product_id, membership_product_id, provider, environment, application_id) REFERENCES membership_provider_products(id, membership_product_id, provider, environment, application_id) ON DELETE RESTRICT
);
CREATE OR REPLACE TRIGGER trigger_membership_purchase_intents_updated_at BEFORE UPDATE ON membership_purchase_intents FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_purchase_intents__user_idempotency ON membership_purchase_intents (user_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_purchase_intents__id_user_context ON membership_purchase_intents (id, user_id, provider, environment, application_id);
CREATE INDEX IF NOT EXISTS idx_membership_purchase_intents__user_id ON membership_purchase_intents (user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_membership_purchase_intents__active_user ON membership_purchase_intents (user_id, expires_at DESC) WHERE failed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_membership_purchase_intents__provider_product_id ON membership_purchase_intents (membership_provider_product_id, id DESC);

CREATE TABLE IF NOT EXISTS membership_verifications (
  id UUID PRIMARY KEY DEFAULT uuidv7(), user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key UUID NOT NULL, request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  membership_purchase_intent_id UUID, membership_provider_evidence_id UUID NOT NULL,
  provider membership_provider_kinds NOT NULL, environment membership_provider_environments NOT NULL, application_id TEXT NOT NULL,
  verified_at TIMESTAMPTZ, conflicted_at TIMESTAMPTZ, rejected_at TIMESTAMPTZ, result_code membership_verification_result_codes,
  processing_claim_token UUID, processing_claimed_at TIMESTAMPTZ, processing_attempts INTEGER NOT NULL DEFAULT 0, next_processing_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, last_error TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (provider <> 'admin'), CHECK (char_length(application_id) BETWEEN 1 AND 255 AND application_id = TRIM(application_id)),
  CHECK (num_nonnulls(verified_at, conflicted_at, rejected_at) <= 1),
  CHECK ((num_nonnulls(verified_at, conflicted_at, rejected_at) = 0) = (result_code IS NULL)),
  CHECK ((processing_claim_token IS NULL) = (processing_claimed_at IS NULL)),
  CHECK (processing_attempts >= 0),
  CHECK (last_error IS NULL OR char_length(last_error) BETWEEN 1 AND 1000),
  CHECK (processing_claimed_at IS NULL OR num_nonnulls(verified_at, conflicted_at, rejected_at) = 0),
  CHECK (num_nonnulls(verified_at, conflicted_at, rejected_at) = 0 OR next_processing_at IS NULL),
  CONSTRAINT fk_membership_verifications__purchase_intent_context FOREIGN KEY (membership_purchase_intent_id, user_id, provider, environment, application_id) REFERENCES membership_purchase_intents(id, user_id, provider, environment, application_id) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_verifications__evidence_context FOREIGN KEY (membership_provider_evidence_id, provider, environment, application_id) REFERENCES membership_provider_evidence_records(id, provider, environment, application_id) ON DELETE RESTRICT
);
CREATE OR REPLACE TRIGGER trigger_membership_verifications_updated_at BEFORE UPDATE ON membership_verifications FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_verifications__user_idempotency ON membership_verifications (user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_membership_verifications__user_id ON membership_verifications (user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_membership_verifications__purchase_intent_id ON membership_verifications (membership_purchase_intent_id, id DESC) WHERE membership_purchase_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_membership_verifications__evidence_id ON membership_verifications (membership_provider_evidence_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_verifications__processing_claim_token ON membership_verifications (processing_claim_token) WHERE processing_claim_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_membership_verifications__pending_processing ON membership_verifications (next_processing_at, id) WHERE verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL;

CREATE TABLE IF NOT EXISTS membership_sources (
  id UUID PRIMARY KEY DEFAULT uuidv7(), user_id UUID,
  source_kind membership_source_kinds NOT NULL, membership_provider_lineage_id UUID REFERENCES membership_provider_lineages(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK ((source_kind = 'admin_grant') = (membership_provider_lineage_id IS NULL))
);
-- Direct sources are durable lineage identities: final account purge clears their recipient, but
-- a later verified claim rebinds that same source. Family sources are recipient-specific and may
-- therefore retain one released source per former recipient.
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_sources__direct_lineage ON membership_sources (membership_provider_lineage_id) WHERE membership_provider_lineage_id IS NOT NULL AND source_kind = 'direct';
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_sources__current_family_lineage_user ON membership_sources (membership_provider_lineage_id, user_id) WHERE membership_provider_lineage_id IS NOT NULL AND user_id IS NOT NULL AND source_kind = 'family';
CREATE INDEX IF NOT EXISTS idx_membership_sources__lineage_id ON membership_sources (membership_provider_lineage_id) WHERE membership_provider_lineage_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_sources__id_source_kind ON membership_sources (id, source_kind);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_sources__id_lineage_id ON membership_sources (id, membership_provider_lineage_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_sources__id_user_id ON membership_sources (id, user_id);
CREATE INDEX IF NOT EXISTS idx_membership_sources__user_id ON membership_sources (user_id, id DESC);

CREATE TABLE IF NOT EXISTS membership_source_states (
  membership_source_id UUID PRIMARY KEY REFERENCES membership_sources(id) ON DELETE CASCADE,
  source_kind membership_source_kinds NOT NULL,
  membership_provider_lineage_id UUID,
  membership_provider_observation_id UUID,
  membership_product_id UUID NOT NULL REFERENCES membership_products(id) ON DELETE RESTRICT,
  effective_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ, expired_at TIMESTAMPTZ, past_due_at TIMESTAMPTZ, paused_at TIMESTAMPTZ,
  auto_renews BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((source_kind = 'admin_grant') = (membership_provider_lineage_id IS NULL)),
  CHECK (membership_provider_observation_id IS NULL OR membership_provider_lineage_id IS NOT NULL),
  CHECK (expires_at IS NULL OR expires_at >= effective_at),
  CHECK (cancelled_at IS NULL OR cancelled_at >= effective_at),
  CHECK (expired_at IS NULL OR expired_at >= effective_at),
  CHECK (past_due_at IS NULL OR past_due_at >= effective_at),
  CHECK (paused_at IS NULL OR paused_at >= effective_at),
  CHECK (num_nonnulls(cancelled_at, expired_at, past_due_at, paused_at) <= 1),
  CONSTRAINT fk_membership_source_states__source_kind FOREIGN KEY (membership_source_id, source_kind) REFERENCES membership_sources(id, source_kind) ON DELETE CASCADE,
  CONSTRAINT fk_membership_source_states__source_lineage FOREIGN KEY (membership_source_id, membership_provider_lineage_id) REFERENCES membership_sources(id, membership_provider_lineage_id) ON DELETE CASCADE,
  CONSTRAINT fk_membership_source_states__observation_lineage_product_kind FOREIGN KEY (membership_provider_observation_id, membership_provider_lineage_id, membership_product_id, source_kind) REFERENCES membership_provider_observations(id, membership_provider_lineage_id, membership_product_id, source_kind) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_membership_source_states__product_id ON membership_source_states (membership_product_id);
CREATE INDEX IF NOT EXISTS idx_membership_source_states__lineage_id ON membership_source_states (membership_provider_lineage_id) WHERE membership_provider_lineage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_membership_source_states__observation_id ON membership_source_states (membership_provider_observation_id) WHERE membership_provider_observation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS membership_grants (
  id UUID PRIMARY KEY DEFAULT uuidv7(), membership_source_id UUID NOT NULL REFERENCES membership_sources(id) ON DELETE RESTRICT,
  source_kind membership_source_kinds NOT NULL DEFAULT 'admin_grant' CHECK (source_kind = 'admin_grant'),
  user_id UUID NOT NULL, membership_product_id UUID NOT NULL REFERENCES membership_products(id) ON DELETE RESTRICT,
  calendar_days INTEGER NOT NULL CHECK (calendar_days BETWEEN 1 AND 3660), granted_by_id UUID, issuer_snapshot TEXT NOT NULL,
  revoked_at TIMESTAMPTZ, revoked_by_id UUID, revocation_reason TEXT, note TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (char_length(issuer_snapshot) BETWEEN 1 AND 1000),
  CHECK ((revoked_at IS NULL) = (revoked_by_id IS NULL) AND (revoked_at IS NULL) = (revocation_reason IS NULL)),
  CHECK (revocation_reason IS NULL OR (char_length(revocation_reason) BETWEEN 1 AND 1000 AND revocation_reason = TRIM(revocation_reason))),
  CHECK (note IS NULL OR char_length(note) <= 1000),
  CONSTRAINT fk_membership_grants__admin_source FOREIGN KEY (membership_source_id, source_kind) REFERENCES membership_sources(id, source_kind) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_grants__source_user FOREIGN KEY (membership_source_id, user_id) REFERENCES membership_sources(id, user_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_grants__source_id ON membership_grants (membership_source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_grants__id_user_id ON membership_grants (id, user_id);
CREATE INDEX IF NOT EXISTS idx_membership_grants__product_id ON membership_grants (membership_product_id);
CREATE INDEX IF NOT EXISTS idx_membership_grants__user_id ON membership_grants (user_id, id);
CREATE TABLE IF NOT EXISTS membership_grant_activation_periods (
  id UUID PRIMARY KEY DEFAULT uuidv7(), membership_grant_id UUID NOT NULL REFERENCES membership_grants(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL, started_at TIMESTAMPTZ NOT NULL, ended_at TIMESTAMPTZ, created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT fk_membership_grant_activation_periods__grant_user FOREIGN KEY (membership_grant_id, user_id) REFERENCES membership_grants(id, user_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_grant_activation_periods__open_grant ON membership_grant_activation_periods (membership_grant_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_grant_activation_periods__open_user ON membership_grant_activation_periods (user_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_membership_grant_activation_periods__grant_id ON membership_grant_activation_periods (membership_grant_id, id DESC);
CREATE FUNCTION membership_grant_remaining_duration(grant_id UUID) RETURNS INTERVAL
LANGUAGE SQL STABLE PARALLEL SAFE AS $$
  SELECT make_interval(days => grant_row.calendar_days) - COALESCE(
    (
      SELECT SUM(GREATEST(INTERVAL '0', COALESCE(period.ended_at, CURRENT_TIMESTAMP) - period.started_at))
      FROM membership_grant_activation_periods period
      WHERE period.membership_grant_id = grant_row.id
    ),
    INTERVAL '0'
  )
  FROM membership_grants grant_row
  WHERE grant_row.id = grant_id
$$;

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT uuidv7(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_source_id UUID NOT NULL REFERENCES membership_sources(id) ON DELETE RESTRICT,
  membership_product_id UUID NOT NULL REFERENCES membership_products(id) ON DELETE RESTRICT,
  effective_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ, expired_at TIMESTAMPTZ, past_due_at TIMESTAMPTZ, paused_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false, latest_change_id UUID,
  renewal_price_increase_notified_observation_id UUID REFERENCES membership_provider_observations(id) ON DELETE RESTRICT,
  renewal_price_increase_notified_provider_product_id UUID,
  renewal_price_increase_notified_minor_units BIGINT, renewal_price_increase_notified_currency_code TEXT REFERENCES currencies(code) ON DELETE RESTRICT,
  renewal_price_increase_notified_effective_at TIMESTAMPTZ,
  renewal_price_increase_notified_at TIMESTAMPTZ, renewal_price_increase_claim_token UUID, renewal_price_increase_claimed_at TIMESTAMPTZ, renewal_price_increase_delivery_attempted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, projection_ended_at TIMESTAMPTZ,
  CHECK (num_nonnulls(cancelled_at, expired_at, past_due_at, paused_at) <= 1),
  CHECK (num_nonnulls(renewal_price_increase_notified_observation_id, renewal_price_increase_notified_provider_product_id, renewal_price_increase_notified_minor_units, renewal_price_increase_notified_currency_code, renewal_price_increase_notified_effective_at) IN (0, 5)),
  CHECK (renewal_price_increase_notified_minor_units IS NULL OR renewal_price_increase_notified_minor_units BETWEEN 0 AND 9007199254740991),
  CHECK (renewal_price_increase_notified_at IS NULL OR renewal_price_increase_delivery_attempted_at IS NOT NULL),
  CHECK ((renewal_price_increase_claim_token IS NULL) = (renewal_price_increase_claimed_at IS NULL)),
  CHECK (renewal_price_increase_claimed_at IS NULL OR renewal_price_increase_notified_observation_id IS NOT NULL),
  CHECK (renewal_price_increase_delivery_attempted_at IS NULL OR renewal_price_increase_notified_observation_id IS NOT NULL),
  CONSTRAINT fk_memberships__renewal_observation_snapshot FOREIGN KEY (renewal_price_increase_notified_observation_id, renewal_price_increase_notified_provider_product_id, renewal_price_increase_notified_minor_units, renewal_price_increase_notified_currency_code, renewal_price_increase_notified_effective_at) REFERENCES membership_provider_observations(id, renewal_membership_provider_product_id, renewal_price_minor_units, renewal_price_currency_code, renewal_effective_at) ON DELETE RESTRICT,
  CONSTRAINT fk_memberships__source_user FOREIGN KEY (membership_source_id, user_id) REFERENCES membership_sources(id, user_id) ON DELETE RESTRICT
);
CREATE OR REPLACE TRIGGER trigger_memberships_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships__effective_user ON memberships (user_id) WHERE projection_ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_memberships__source_id ON memberships (membership_source_id);
CREATE INDEX IF NOT EXISTS idx_memberships__product_id ON memberships (membership_product_id);
CREATE INDEX IF NOT EXISTS idx_memberships__renewal_provider_product_id ON memberships (renewal_price_increase_notified_provider_product_id) WHERE renewal_price_increase_notified_provider_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memberships__renewal_observation_id ON memberships (renewal_price_increase_notified_observation_id) WHERE renewal_price_increase_notified_observation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memberships__renewal_currency_code ON memberships (renewal_price_increase_notified_currency_code) WHERE renewal_price_increase_notified_currency_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships__renewal_claim_token ON memberships (renewal_price_increase_claim_token) WHERE renewal_price_increase_claim_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memberships__expires_at ON memberships (expires_at, id) WHERE projection_ended_at IS NULL AND expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS membership_changes (
  id UUID PRIMARY KEY DEFAULT uuidv7(), membership_id UUID NOT NULL, user_id UUID NOT NULL,
  membership_source_id UUID REFERENCES membership_sources(id) ON DELETE RESTRICT,
  membership_grant_id UUID REFERENCES membership_grants(id) ON DELETE RESTRICT,
  change_type membership_change_types NOT NULL, from_membership_product_id UUID REFERENCES membership_products(id) ON DELETE RESTRICT, to_membership_product_id UUID REFERENCES membership_products(id) ON DELETE RESTRICT, changed_by_id UUID, note TEXT,
  membership_provider_evidence_id UUID REFERENCES membership_provider_evidence_records(id) ON DELETE RESTRICT,
  -- Temporary Stripe adapter replay identity; removed with the adapter migration layer.
  stripe_event_id TEXT,
  cancelled_at TIMESTAMPTZ, expired_at TIMESTAMPTZ, past_due_at TIMESTAMPTZ, paused_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL, CHECK (note IS NULL OR char_length(note) <= 1000)
);
CREATE INDEX IF NOT EXISTS idx_membership_changes__membership_id ON membership_changes (membership_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_membership_changes__user_id ON membership_changes (user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_membership_changes__source_id ON membership_changes (membership_source_id, id DESC) WHERE membership_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_membership_changes__grant_id ON membership_changes (membership_grant_id, id DESC) WHERE membership_grant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_membership_changes__from_product_id ON membership_changes (from_membership_product_id) WHERE from_membership_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_membership_changes__to_product_id ON membership_changes (to_membership_product_id) WHERE to_membership_product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_changes__evidence_id ON membership_changes (membership_provider_evidence_id) WHERE membership_provider_evidence_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mchanges__stripe_event ON membership_changes (stripe_event_id) WHERE stripe_event_id IS NOT NULL;
DO $$ BEGIN ALTER TABLE memberships ADD CONSTRAINT fk_memberships_latest_change_id FOREIGN KEY (latest_change_id) REFERENCES membership_changes(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_memberships__latest_change_id ON memberships (latest_change_id) WHERE latest_change_id IS NOT NULL;

-- A membership change owns exactly one replayable handoff to its derived entitlement consumers.
CREATE TABLE IF NOT EXISTS membership_entitlement_effects (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  membership_change_id UUID NOT NULL REFERENCES membership_changes(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ,
  delivery_claim_token TEXT,
  delivery_claimed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK ((delivery_claim_token IS NULL) = (delivery_claimed_at IS NULL)),
  CHECK (delivery_claim_token IS NULL OR char_length(delivery_claim_token) = 36)
);
CREATE OR REPLACE TRIGGER trigger_membership_entitlement_effects_updated_at BEFORE UPDATE ON membership_entitlement_effects FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_entitlement_effects__change_id ON membership_entitlement_effects (membership_change_id);
CREATE INDEX IF NOT EXISTS idx_membership_entitlement_effects__user_id ON membership_entitlement_effects (user_id);
CREATE INDEX IF NOT EXISTS idx_membership_entitlement_effects__pending ON membership_entitlement_effects (id) WHERE delivered_at IS NULL;

CREATE TABLE IF NOT EXISTS membership_operations (
  id UUID PRIMARY KEY DEFAULT uuidv7(), membership_source_id UUID NOT NULL REFERENCES membership_sources(id) ON DELETE RESTRICT,
  membership_provider_lineage_id UUID NOT NULL,
  provider membership_provider_kinds NOT NULL, environment membership_provider_environments NOT NULL, application_id TEXT NOT NULL,
  operation_kind membership_operation_kinds NOT NULL, idempotency_key TEXT NOT NULL,
  qualifying_allocation_minor_units BIGINT CHECK (qualifying_allocation_minor_units BETWEEN 0 AND 9007199254740991),
  remaining_refundable_minor_units BIGINT CHECK (remaining_refundable_minor_units BETWEEN 0 AND 9007199254740991),
  currency_code TEXT REFERENCES currencies(code) ON DELETE RESTRICT,
  period_started_at TIMESTAMPTZ, period_ends_at TIMESTAMPTZ, collision_at TIMESTAMPTZ,
  reconciliation_due_at TIMESTAMPTZ, reconciliation_attempt_ordinal INTEGER NOT NULL DEFAULT 0,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TIMESTAMPTZ, failed_at TIMESTAMPTZ, failure_message TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (char_length(application_id) BETWEEN 1 AND 255 AND application_id = TRIM(application_id)),
  CHECK (char_length(idempotency_key) BETWEEN 1 AND 255 AND idempotency_key = TRIM(idempotency_key)),
  CHECK (provider <> 'admin'),
  CHECK (period_ends_at IS NULL OR period_started_at IS NOT NULL),
  CHECK (period_ends_at IS NULL OR period_ends_at >= period_started_at),
  CHECK (remaining_refundable_minor_units IS NULL OR qualifying_allocation_minor_units IS NOT NULL),
  CHECK (remaining_refundable_minor_units IS NULL OR remaining_refundable_minor_units <= qualifying_allocation_minor_units),
  CHECK (reconciliation_attempt_ordinal >= 0),
  CHECK ((operation_kind IN ('ineligible_purchase_reversal', 'collision_resolution')) = (collision_at IS NOT NULL)),
  CHECK (
    operation_kind IN ('automatic_refund', 'ineligible_purchase_reversal', 'collision_resolution', 'administrator_refund')
    OR (qualifying_allocation_minor_units IS NULL AND remaining_refundable_minor_units IS NULL AND currency_code IS NULL AND period_started_at IS NULL AND period_ends_at IS NULL)
  ),
  CHECK (
    operation_kind NOT IN ('automatic_refund', 'ineligible_purchase_reversal', 'collision_resolution')
    OR (qualifying_allocation_minor_units IS NOT NULL AND remaining_refundable_minor_units IS NOT NULL AND currency_code IS NOT NULL AND period_started_at IS NOT NULL AND period_ends_at IS NOT NULL)
  ),
  CHECK (operation_kind <> 'administrator_refund' OR (period_started_at IS NULL AND period_ends_at IS NULL) OR (period_started_at IS NOT NULL AND period_ends_at IS NOT NULL)),
  CHECK (operation_kind <> 'administrator_refund' OR (qualifying_allocation_minor_units IS NOT NULL AND remaining_refundable_minor_units IS NOT NULL AND currency_code IS NOT NULL)),
  CHECK (operation_kind <> 'administrator_refund' OR completed_at IS NOT NULL OR reconciliation_due_at IS NOT NULL),
  CHECK (completed_at IS NULL OR reconciliation_due_at IS NULL),
  CHECK (num_nonnulls(completed_at, failed_at) <= 1),
  CHECK (completed_at IS NULL OR completed_at >= requested_at),
  CHECK (failed_at IS NULL OR failed_at >= requested_at),
  CHECK ((failed_at IS NULL) = (failure_message IS NULL)),
  CHECK (failure_message IS NULL OR char_length(failure_message) BETWEEN 1 AND 2000),
  CONSTRAINT fk_membership_operations__source_lineage FOREIGN KEY (
    membership_source_id, membership_provider_lineage_id
  ) REFERENCES membership_sources (id, membership_provider_lineage_id) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_operations__lineage_context FOREIGN KEY (
    membership_provider_lineage_id, provider, environment, application_id
  ) REFERENCES membership_provider_lineages (id, provider, environment, application_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_operations__provider_idempotency ON membership_operations (provider, environment, application_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_operations__receipt_snapshot ON membership_operations (id, provider, environment, application_id, operation_kind, remaining_refundable_minor_units, currency_code) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_operations__id_source ON membership_operations (id, membership_source_id);
CREATE INDEX IF NOT EXISTS idx_membership_operations__source_id ON membership_operations (membership_source_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_membership_operations__lineage_id ON membership_operations (membership_provider_lineage_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_membership_operations__currency_code ON membership_operations (currency_code);
CREATE INDEX IF NOT EXISTS idx_membership_operations__reconciliation_due ON membership_operations (reconciliation_due_at, id) WHERE completed_at IS NULL AND reconciliation_due_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS membership_automatic_refund_receipts (
  id UUID PRIMARY KEY DEFAULT uuidv7(), membership_operation_id UUID NOT NULL REFERENCES membership_operations(id) ON DELETE RESTRICT,
  provider membership_provider_kinds NOT NULL, environment membership_provider_environments NOT NULL, application_id TEXT NOT NULL,
  operation_kind membership_operation_kinds NOT NULL,
  provider_refund_id TEXT, amount_minor_units BIGINT NOT NULL CHECK (amount_minor_units BETWEEN 0 AND 9007199254740991),
  remaining_refundable_minor_units BIGINT NOT NULL CHECK (remaining_refundable_minor_units BETWEEN 0 AND 9007199254740991),
  currency_code TEXT NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (char_length(application_id) BETWEEN 1 AND 255 AND application_id = TRIM(application_id)),
  CHECK (provider_refund_id IS NULL OR (char_length(provider_refund_id) BETWEEN 1 AND 255 AND provider_refund_id = TRIM(provider_refund_id))),
  CHECK ((amount_minor_units = 0) = (provider_refund_id IS NULL)),
  CHECK (operation_kind IN ('automatic_refund', 'ineligible_purchase_reversal', 'collision_resolution')),
  CHECK (amount_minor_units <= remaining_refundable_minor_units),
  CONSTRAINT fk_membership_automatic_refund_receipts__operation_snapshot FOREIGN KEY (
    membership_operation_id, provider, environment, application_id,
    operation_kind, remaining_refundable_minor_units, currency_code
  ) REFERENCES membership_operations (
    id, provider, environment, application_id,
    operation_kind, remaining_refundable_minor_units, currency_code
  ) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_automatic_refund_receipts__provider_refund ON membership_automatic_refund_receipts (provider, environment, application_id, provider_refund_id) WHERE provider_refund_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_automatic_refund_receipts__operation_id ON membership_automatic_refund_receipts (membership_operation_id);
CREATE INDEX IF NOT EXISTS idx_membership_automatic_refund_receipts__currency_code ON membership_automatic_refund_receipts (currency_code);

CREATE TABLE IF NOT EXISTS membership_administrator_refund_operation_requests (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  membership_operation_id UUID NOT NULL UNIQUE REFERENCES membership_operations(id) ON DELETE RESTRICT,
  administrator_request_key TEXT NOT NULL, membership_id UUID NOT NULL, issued_by_id UUID NOT NULL,
  provider_payment_reference TEXT NOT NULL, provider_subscription_reference TEXT,
  amount_minor_units BIGINT NOT NULL CHECK (amount_minor_units BETWEEN 1 AND 9007199254740991),
  currency_code TEXT NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,
  reason membership_refund_reasons NOT NULL, cancel_requested BOOLEAN NOT NULL,
  request_fingerprint TEXT NOT NULL, note TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (char_length(provider_payment_reference) BETWEEN 1 AND 255 AND provider_payment_reference = TRIM(provider_payment_reference)),
  CHECK ((cancel_requested = FALSE AND provider_subscription_reference IS NULL) OR (cancel_requested = TRUE AND char_length(provider_subscription_reference) BETWEEN 1 AND 255 AND provider_subscription_reference = TRIM(provider_subscription_reference))),
  CHECK (char_length(request_fingerprint) = 64),
  CHECK (char_length(administrator_request_key) BETWEEN 1 AND 255 AND administrator_request_key = TRIM(administrator_request_key)),
  CONSTRAINT uq_maror__operation_key UNIQUE (membership_operation_id, administrator_request_key),
  CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 1000)
);
CREATE INDEX IF NOT EXISTS idx_maror__membership_id ON membership_administrator_refund_operation_requests (membership_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_maror__issued_by_id ON membership_administrator_refund_operation_requests (issued_by_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_maror__currency_code ON membership_administrator_refund_operation_requests (currency_code);

CREATE TABLE IF NOT EXISTS membership_refunds (
  id UUID PRIMARY KEY DEFAULT uuidv7(), membership_operation_id UUID,
  membership_id UUID NOT NULL,
  membership_source_id UUID NOT NULL REFERENCES membership_sources(id) ON DELETE RESTRICT,
  user_id UUID,
  stripe_refund_id TEXT NOT NULL, stripe_charge_id TEXT NOT NULL, stripe_payment_intent_id TEXT,
  stripe_idempotency_key TEXT,
  admin_request_fingerprint TEXT CHECK (admin_request_fingerprint IS NULL OR char_length(admin_request_fingerprint) = 64),
  amount_minor_units BIGINT NOT NULL CHECK (amount_minor_units BETWEEN 1 AND 9007199254740991), currency_code TEXT NOT NULL CHECK (currency_code ~ '^[a-z]{3}$'),
  reason membership_refund_reasons NOT NULL, revoked_access BOOLEAN NOT NULL DEFAULT false, issued_by_id UUID, source membership_refund_sources NOT NULL,
  stripe_event_id TEXT, note TEXT, created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT membership_refunds_source_identity_check CHECK ((source = 'admin' AND issued_by_id IS NOT NULL AND stripe_idempotency_key IS NOT NULL AND admin_request_fingerprint IS NOT NULL) OR (source = 'stripe_dashboard' AND issued_by_id IS NULL AND stripe_idempotency_key IS NULL AND admin_request_fingerprint IS NULL)),
  CONSTRAINT fk_membership_refunds__operation_source FOREIGN KEY (membership_operation_id, membership_source_id) REFERENCES membership_operations(id, membership_source_id) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_refunds__administrator_request FOREIGN KEY (membership_operation_id, stripe_idempotency_key) REFERENCES membership_administrator_refund_operation_requests(membership_operation_id, administrator_request_key) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_mrefunds__membership_id ON membership_refunds (membership_id);
CREATE INDEX IF NOT EXISTS idx_mrefunds__source_id ON membership_refunds (membership_source_id);
CREATE INDEX IF NOT EXISTS idx_mrefunds__user_id ON membership_refunds (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mrefunds__stripe_refund_id ON membership_refunds (stripe_refund_id);
CREATE INDEX IF NOT EXISTS idx_mrefunds__stripe_charge_id ON membership_refunds (stripe_charge_id);
CREATE INDEX IF NOT EXISTS idx_mrefunds__stripe_payment_intent_id ON membership_refunds (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mrefunds__stripe_idempotency_key ON membership_refunds (stripe_idempotency_key) WHERE stripe_idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mrefunds__operation_id ON membership_refunds (membership_operation_id, id DESC) WHERE membership_operation_id IS NOT NULL;
CREATE FUNCTION fn_guard_membership_refund_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'membership refund receipts cannot be deleted';
  END IF;
  IF ROW(NEW.id, NEW.membership_id, NEW.membership_source_id, NEW.user_id,
      NEW.stripe_refund_id, NEW.stripe_charge_id, NEW.amount_minor_units, NEW.currency_code,
      NEW.stripe_event_id, NEW.created_at)
    IS DISTINCT FROM
    ROW(OLD.id, OLD.membership_id, OLD.membership_source_id, OLD.user_id,
      OLD.stripe_refund_id, OLD.stripe_charge_id, OLD.amount_minor_units, OLD.currency_code,
      OLD.stripe_event_id, OLD.created_at) THEN
    RAISE EXCEPTION 'membership refund receipt facts are immutable';
  END IF;
  IF OLD.source = 'stripe_dashboard' AND NEW.source = 'admin'
    AND (OLD.stripe_payment_intent_id IS NULL OR NEW.stripe_payment_intent_id = OLD.stripe_payment_intent_id)
    AND NOT OLD.revoked_access THEN
    RETURN NEW;
  END IF;
  IF OLD.source = 'admin' AND NEW.source = 'admin'
    AND NOT OLD.revoked_access AND NEW.revoked_access
    AND ROW(NEW.stripe_payment_intent_id, NEW.stripe_idempotency_key,
      NEW.admin_request_fingerprint, NEW.reason, NEW.issued_by_id, NEW.note)
      IS NOT DISTINCT FROM
      ROW(OLD.stripe_payment_intent_id, OLD.stripe_idempotency_key,
        OLD.admin_request_fingerprint, OLD.reason, OLD.issued_by_id, OLD.note) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'membership refund receipts only allow one-way reconciliation or access revocation';
END $$;
CREATE TRIGGER trigger_membership_refunds_guard BEFORE UPDATE OR DELETE ON membership_refunds FOR EACH ROW EXECUTE FUNCTION fn_guard_membership_refund_mutation();

CREATE UNIQUE INDEX IF NOT EXISTS idx_mrefunds__operation_receipt ON membership_refunds (membership_operation_id) WHERE membership_operation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS membership_refund_operation_attempts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  membership_operation_id UUID NOT NULL REFERENCES membership_operations(id) ON DELETE RESTRICT,
  provider membership_provider_kinds NOT NULL, environment membership_provider_environments NOT NULL, application_id TEXT NOT NULL,
  attempt_ordinal INTEGER NOT NULL CHECK (attempt_ordinal >= 1), provider_idempotency_key TEXT NOT NULL, provider_refund_id TEXT,
  amount_minor_units BIGINT NOT NULL CHECK (amount_minor_units BETWEEN 0 AND 9007199254740991),
  currency_code TEXT NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (char_length(application_id) BETWEEN 1 AND 255 AND application_id = TRIM(application_id)),
  CHECK (char_length(provider_idempotency_key) BETWEEN 1 AND 255 AND provider_idempotency_key = TRIM(provider_idempotency_key)),
  CHECK (provider_refund_id IS NULL OR (char_length(provider_refund_id) BETWEEN 1 AND 255 AND provider_refund_id = TRIM(provider_refund_id))),
  CONSTRAINT uq_membership_refund_operation_attempts__operation_ordinal UNIQUE (membership_operation_id, attempt_ordinal),
  CONSTRAINT uq_membership_refund_operation_attempts__provider_idempotency UNIQUE (provider, environment, application_id, provider_idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_refund_operation_attempts__provider_refund ON membership_refund_operation_attempts (provider, environment, application_id, provider_refund_id) WHERE provider_refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_membership_refund_operation_attempts__currency_code ON membership_refund_operation_attempts (currency_code);

CREATE OR REPLACE FUNCTION fn_require_membership_administrator_refund_request_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid_context BOOLEAN;
BEGIN
  SELECT operation.operation_kind = 'administrator_refund' AND operation.remaining_refundable_minor_units = NEW.amount_minor_units AND operation.currency_code = NEW.currency_code INTO valid_context FROM membership_operations operation WHERE operation.id = NEW.membership_operation_id;
  IF valid_context IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'administrator refund request does not match its operation context' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trigger_maror_context BEFORE INSERT ON membership_administrator_refund_operation_requests FOR EACH ROW EXECUTE FUNCTION fn_require_membership_administrator_refund_request_context();
CREATE OR REPLACE FUNCTION fn_reject_membership_administrator_refund_request_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'membership administrator refund requests are immutable'; END $$;
CREATE TRIGGER trigger_maror_immutable BEFORE UPDATE OR DELETE ON membership_administrator_refund_operation_requests FOR EACH ROW EXECUTE FUNCTION fn_reject_membership_administrator_refund_request_mutation();

CREATE OR REPLACE FUNCTION fn_require_membership_refund_operation_attempt_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid_context BOOLEAN;
BEGIN
  SELECT operation.operation_kind IN ('automatic_refund', 'ineligible_purchase_reversal', 'collision_resolution', 'administrator_refund') AND operation.provider = NEW.provider AND operation.environment = NEW.environment AND operation.application_id = NEW.application_id AND operation.currency_code = NEW.currency_code AND NEW.amount_minor_units <= operation.remaining_refundable_minor_units INTO valid_context FROM membership_operations operation WHERE operation.id = NEW.membership_operation_id;
  IF valid_context IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'refund attempt does not match its operation context' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trigger_membership_refund_operation_attempts_context BEFORE INSERT ON membership_refund_operation_attempts FOR EACH ROW EXECUTE FUNCTION fn_require_membership_refund_operation_attempt_context();
CREATE OR REPLACE FUNCTION fn_guard_membership_refund_operation_attempt_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'membership refund operation attempts cannot be deleted'; END IF;
  IF OLD.provider_refund_id IS NULL AND NEW.provider_refund_id IS NOT NULL AND ROW(NEW.id, NEW.membership_operation_id, NEW.attempt_ordinal, NEW.provider, NEW.environment, NEW.application_id, NEW.provider_idempotency_key, NEW.amount_minor_units, NEW.currency_code, NEW.created_at) IS NOT DISTINCT FROM ROW(OLD.id, OLD.membership_operation_id, OLD.attempt_ordinal, OLD.provider, OLD.environment, OLD.application_id, OLD.provider_idempotency_key, OLD.amount_minor_units, OLD.currency_code, OLD.created_at) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'membership refund operation attempts only allow provider refund ID enrichment';
END $$;
CREATE TRIGGER trigger_membership_refund_operation_attempts_guard BEFORE UPDATE OR DELETE ON membership_refund_operation_attempts FOR EACH ROW EXECUTE FUNCTION fn_guard_membership_refund_operation_attempt_mutation();

CREATE TABLE IF NOT EXISTS membership_refund_operation_attempt_metadata_scans (
  membership_refund_operation_attempt_id UUID PRIMARY KEY REFERENCES membership_refund_operation_attempts(id) ON DELETE RESTRICT,
  stable_head_provider_refund_id TEXT, next_provider_refund_id TEXT, lease_token TEXT NOT NULL, completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (stable_head_provider_refund_id IS NULL OR (char_length(stable_head_provider_refund_id) BETWEEN 1 AND 255 AND stable_head_provider_refund_id = TRIM(stable_head_provider_refund_id))),
  CHECK (char_length(lease_token) BETWEEN 1 AND 255 AND lease_token = TRIM(lease_token)),
  CHECK (next_provider_refund_id IS NULL OR (char_length(next_provider_refund_id) BETWEEN 1 AND 255 AND next_provider_refund_id = TRIM(next_provider_refund_id))),
  CHECK (completed_at IS NULL OR next_provider_refund_id IS NULL)
);
CREATE OR REPLACE FUNCTION fn_guard_membership_refund_metadata_scan_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lease_matches BOOLEAN;
BEGIN
  SELECT operation.execution_claim_token = NEW.lease_token INTO lease_matches FROM membership_refund_operation_attempts attempt INNER JOIN membership_operations operation ON operation.id = attempt.membership_operation_id WHERE attempt.id = NEW.membership_refund_operation_attempt_id;
  IF lease_matches IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'membership refund metadata scan lease is stale'; END IF;
  IF TG_OP = 'UPDATE' AND (OLD.completed_at IS NOT NULL OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.membership_refund_operation_attempt_id IS DISTINCT FROM OLD.membership_refund_operation_attempt_id OR (NEW.completed_at IS NOT NULL AND NEW.next_provider_refund_id IS NOT NULL)) THEN RAISE EXCEPTION 'membership refund metadata scan cannot be reopened or rewritten after completion'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trigger_mrefund_attempt_scans_guard BEFORE INSERT OR UPDATE ON membership_refund_operation_attempt_metadata_scans FOR EACH ROW EXECUTE FUNCTION fn_guard_membership_refund_metadata_scan_mutation();
CREATE TRIGGER trigger_mrefund_attempt_scans_updated_at BEFORE UPDATE ON membership_refund_operation_attempt_metadata_scans FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE IF NOT EXISTS stripe_events (
  id UUID PRIMARY KEY DEFAULT uuidv7(), stripe_event_id TEXT NOT NULL, event_type TEXT NOT NULL, livemode BOOLEAN NOT NULL DEFAULT false, api_version TEXT,
  stripe_created_at TIMESTAMPTZ NOT NULL, customer_id TEXT, subscription_id TEXT, invoice_id TEXT, checkout_session_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, processing_attempt_id UUID NOT NULL DEFAULT uuidv7(), dispatched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processing_started_at TIMESTAMPTZ, processing_attempts INT NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0), processed_at TIMESTAMPTZ, ignored_at TIMESTAMPTZ, failed_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ, last_error_message TEXT, payload JSONB NOT NULL, created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (num_nonnulls(processed_at, ignored_at, failed_at) <= 1)
);
CREATE INDEX IF NOT EXISTS idx_stripe_events__event_type ON stripe_events (event_type, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stripe_events__stripe_event_id ON stripe_events (stripe_event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stripe_events__processing_attempt_id ON stripe_events (processing_attempt_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events__unfinished ON stripe_events (id DESC) WHERE processed_at IS NULL AND ignored_at IS NULL AND failed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stripe_events__subscription_id ON stripe_events (subscription_id, id DESC) WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stripe_events__customer_id ON stripe_events (customer_id, id DESC) WHERE customer_id IS NOT NULL;

INSERT INTO membership_products (plan, billing_interval) VALUES
  ('plus', 'monthly'), ('plus', 'yearly'), ('pro', 'monthly'), ('pro', 'yearly') ON CONFLICT DO NOTHING;

COMMENT ON TABLE membership_products IS 'Canonical membership offerings, independent of any billing provider.';
COMMENT ON COLUMN membership_products.plan IS 'Voucha membership plan level.';
COMMENT ON COLUMN membership_products.billing_interval IS 'Cadence represented by this canonical product.';
COMMENT ON COLUMN membership_products.retired_at IS 'When this product stopped being available for new sources.';

COMMENT ON TABLE membership_provider_products IS 'Provider-specific product identities mapped to canonical membership products.';
COMMENT ON COLUMN membership_provider_products.membership_product_id IS 'Canonical product delivered by this provider product identity.';
COMMENT ON COLUMN membership_provider_products.provider IS 'Store or payment provider that owns this product identity.';
COMMENT ON COLUMN membership_provider_products.environment IS 'Provider environment in which this product identity is valid.';
COMMENT ON COLUMN membership_provider_products.application_id IS 'Provider application, bundle, or tenant identifier.';
COMMENT ON COLUMN membership_provider_products.provider_product_id IS 'Provider product identifier.';
COMMENT ON COLUMN membership_provider_products.base_plan_id IS 'Optional provider base-plan identity.';
COMMENT ON COLUMN membership_provider_products.offer_id IS 'Optional provider offer identity.';
COMMENT ON COLUMN membership_provider_products.sku_id IS 'Optional provider SKU identity.';
COMMENT ON COLUMN membership_provider_products.price_minor_units IS 'Displayed product price in the currency minor unit, when the provider exposes one.';
COMMENT ON COLUMN membership_provider_products.currency_code IS 'ISO currency code for the displayed provider price, when the provider exposes one.';
COMMENT ON COLUMN membership_provider_products.retired_at IS 'When this mapping stopped accepting new provider purchases.';

COMMENT ON TABLE membership_provider_lineages IS 'Stable provider purchase or entitlement lineages used for account binding.';
COMMENT ON COLUMN membership_provider_lineages.provider IS 'Provider that issued the lineage.';
COMMENT ON COLUMN membership_provider_lineages.environment IS 'Provider environment in which the lineage exists.';
COMMENT ON COLUMN membership_provider_lineages.application_id IS 'Provider application, bundle, or tenant identifier.';
COMMENT ON COLUMN membership_provider_lineages.provider_lineage_id IS 'Stable provider-defined purchase or entitlement lineage identity.';
COMMENT ON COLUMN membership_provider_lineages.provider_account_id IS 'Optional provider account identity observed with the lineage.';

COMMENT ON TABLE membership_lineage_bindings IS 'Durable lineage-to-user binding history, retained through account deletion.';
COMMENT ON COLUMN membership_lineage_bindings.membership_provider_lineage_id IS 'Provider lineage claimed by this binding.';
COMMENT ON COLUMN membership_lineage_bindings.user_id IS 'Bound Voucha user; cleared only after final account purge.';
COMMENT ON COLUMN membership_lineage_bindings.source_kind IS 'Direct owner or family-recipient binding class for the lineage.';
COMMENT ON COLUMN membership_lineage_bindings.bound_at IS 'When the lineage became bound to this user.';
COMMENT ON COLUMN membership_lineage_bindings.released_at IS 'When final account deletion released this binding.';
COMMENT ON COLUMN membership_lineage_bindings.release_reason IS 'Auditable reason the lineage binding was released.';

COMMENT ON TABLE membership_provider_evidence_records IS 'Encrypted provider evidence retained for verification, replay protection, and audit.';
COMMENT ON COLUMN membership_provider_evidence_records.provider IS 'Provider that produced the evidence.';
COMMENT ON COLUMN membership_provider_evidence_records.environment IS 'Provider environment that produced the evidence.';
COMMENT ON COLUMN membership_provider_evidence_records.application_id IS 'Provider application, bundle, or tenant identifier.';
COMMENT ON COLUMN membership_provider_evidence_records.membership_provider_lineage_id IS 'Provider lineage asserted by the evidence, when known.';
COMMENT ON COLUMN membership_provider_evidence_records.provider_event_id IS 'Optional provider event identity used for replay protection.';
COMMENT ON COLUMN membership_provider_evidence_records.evidence_lookup_sha256 IS 'SHA-256 lookup digest for deduplicating encrypted evidence.';
COMMENT ON COLUMN membership_provider_evidence_records.encrypted_evidence IS 'Encrypted provider payload; plaintext is never persisted.';
COMMENT ON COLUMN membership_provider_evidence_records.received_at IS 'When the evidence was durably received.';
COMMENT ON COLUMN membership_provider_evidence_records.verified_at IS 'When provider verification accepted the evidence.';
COMMENT ON COLUMN membership_provider_evidence_records.rejected_at IS 'When provider verification rejected the evidence.';
COMMENT ON COLUMN membership_provider_evidence_records.rejection_reason IS 'Bounded reason for rejecting the evidence.';

COMMENT ON TABLE membership_provider_observations IS 'Immutable normalized entitlement observations derived from verified provider evidence.';
COMMENT ON COLUMN membership_provider_observations.provider IS 'Provider observed in the normalized entitlement.';
COMMENT ON COLUMN membership_provider_observations.environment IS 'Provider environment observed in the entitlement.';
COMMENT ON COLUMN membership_provider_observations.application_id IS 'Provider application, bundle, or tenant identifier.';
COMMENT ON COLUMN membership_provider_observations.membership_provider_evidence_id IS 'Evidence record from which this observation was normalized.';
COMMENT ON COLUMN membership_provider_observations.membership_provider_lineage_id IS 'Provider lineage observed in the entitlement.';
COMMENT ON COLUMN membership_provider_observations.membership_provider_product_id IS 'Provider product identity observed in the entitlement.';
COMMENT ON COLUMN membership_provider_observations.membership_product_id IS 'Canonical product resolved from the provider product identity.';
COMMENT ON COLUMN membership_provider_observations.observed_price_minor_units IS 'Immutable provider price observed for the current entitlement, when known.';
COMMENT ON COLUMN membership_provider_observations.observed_price_currency_code IS 'Immutable provider currency observed for the current entitlement, when known.';
COMMENT ON COLUMN membership_provider_observations.renewal_membership_provider_product_id IS 'Provider-authoritative product expected at the next renewal, when known.';
COMMENT ON COLUMN membership_provider_observations.renewal_membership_product_id IS 'Canonical product expected at the next renewal, when known.';
COMMENT ON COLUMN membership_provider_observations.renewal_price_minor_units IS 'Immutable provider-authoritative amount expected at the next renewal, when known.';
COMMENT ON COLUMN membership_provider_observations.renewal_price_currency_code IS 'Immutable provider-authoritative currency expected at the next renewal, when known.';
COMMENT ON COLUMN membership_provider_observations.renewal_effective_at IS 'Provider-authoritative effective time for the expected renewal price.';
COMMENT ON COLUMN membership_provider_observations.provider_revision IS 'Provider revision token for ordering observations within a lineage.';
COMMENT ON COLUMN membership_provider_observations.provider_order IS 'Provider-defined monotonic order within the revision stream.';
COMMENT ON COLUMN membership_provider_observations.terminal_at IS 'When the provider reported an irreversible terminal state for this lineage.';
COMMENT ON COLUMN membership_provider_observations.source_kind IS 'Whether the observed entitlement is direct or family access.';
COMMENT ON COLUMN membership_provider_observations.effective_at IS 'When the observed entitlement became effective.';
COMMENT ON COLUMN membership_provider_observations.expires_at IS 'When the observed entitlement expires, if finite.';
COMMENT ON COLUMN membership_provider_observations.cancelled_at IS 'When the provider reported cancellation.';
COMMENT ON COLUMN membership_provider_observations.expired_at IS 'When the provider reported expiration.';
COMMENT ON COLUMN membership_provider_observations.past_due_at IS 'When the provider reported the entitlement past due.';
COMMENT ON COLUMN membership_provider_observations.paused_at IS 'When the provider reported the entitlement paused.';
COMMENT ON COLUMN membership_provider_observations.auto_renews IS 'Whether the provider reported automatic renewal enabled.';

COMMENT ON TABLE membership_purchase_intents IS 'Owner-scoped, replayable provider purchase launches selected from a provider product mapping.';
COMMENT ON COLUMN membership_purchase_intents.user_id IS 'Voucha account that requested the purchase launch; cleared after final account deletion.';
COMMENT ON COLUMN membership_purchase_intents.idempotency_key IS 'Client-supplied UUID replay identity, unique per owner.';
COMMENT ON COLUMN membership_purchase_intents.request_fingerprint IS 'SHA-256 digest of the canonical launch request for exact replay validation.';
COMMENT ON COLUMN membership_purchase_intents.membership_provider_product_id IS 'Provider mapping selected for the launch.';
COMMENT ON COLUMN membership_purchase_intents.membership_product_id IS 'Canonical product constrained to the selected provider mapping.';
COMMENT ON COLUMN membership_purchase_intents.provider IS 'Store or payment provider selected for this launch.';
COMMENT ON COLUMN membership_purchase_intents.environment IS 'Provider environment selected for this launch.';
COMMENT ON COLUMN membership_purchase_intents.application_id IS 'Provider application, bundle, or tenant selected for this launch.';
COMMENT ON COLUMN membership_purchase_intents.provider_checkout_id IS 'Provider checkout identity retained for an exact launch replay.';
COMMENT ON COLUMN membership_purchase_intents.provider_checkout_url IS 'Provider checkout URL retained for an exact launch replay.';
COMMENT ON COLUMN membership_purchase_intents.expires_at IS 'End of the bounded launch-admission window that prevents concurrent provider purchase starts.';
COMMENT ON COLUMN membership_purchase_intents.launched_at IS 'When the launch payload was durably produced.';
COMMENT ON COLUMN membership_purchase_intents.failed_at IS 'When launch creation reached a terminal failure.';
COMMENT ON COLUMN membership_purchase_intents.failure_code IS 'Stable provider launch failure code.';

COMMENT ON TABLE membership_verifications IS 'Owner-scoped asynchronous provider-evidence verification requests and their durable recovery state.';
COMMENT ON COLUMN membership_verifications.user_id IS 'Voucha account that submitted the provider evidence; cleared after final account deletion.';
COMMENT ON COLUMN membership_verifications.idempotency_key IS 'Client-supplied UUID replay identity, unique per owner.';
COMMENT ON COLUMN membership_verifications.request_fingerprint IS 'SHA-256 digest of the canonical verification request for exact replay validation.';
COMMENT ON COLUMN membership_verifications.membership_purchase_intent_id IS 'Optional owner-matched launch that originated this verification.';
COMMENT ON COLUMN membership_verifications.membership_provider_evidence_id IS 'Bounded encrypted evidence persisted before verification processing.';
COMMENT ON COLUMN membership_verifications.provider IS 'Store or payment provider that issued the submitted evidence.';
COMMENT ON COLUMN membership_verifications.environment IS 'Provider environment in which the submitted evidence must verify.';
COMMENT ON COLUMN membership_verifications.application_id IS 'Provider application, bundle, or tenant in which the submitted evidence must verify.';
COMMENT ON COLUMN membership_verifications.verified_at IS 'When verification completed successfully.';
COMMENT ON COLUMN membership_verifications.conflicted_at IS 'When verification completed with an automatically managed conflict.';
COMMENT ON COLUMN membership_verifications.rejected_at IS 'When verification completed with a rejection.';
COMMENT ON COLUMN membership_verifications.result_code IS 'Stable terminal verification result code.';
COMMENT ON COLUMN membership_verifications.processing_claim_token IS 'Lease token fencing the current verification processor.';
COMMENT ON COLUMN membership_verifications.processing_claimed_at IS 'When the current processor claimed this verification.';
COMMENT ON COLUMN membership_verifications.processing_attempts IS 'Number of durable verification processing attempts.';
COMMENT ON COLUMN membership_verifications.next_processing_at IS 'When pending verification recovery may next process this request.';
COMMENT ON COLUMN membership_verifications.last_error IS 'Bounded diagnostic from the most recent recoverable processing failure.';

COMMENT ON TABLE membership_sources IS 'Stable entitlement sources that project provider or administrator access onto a user.';
COMMENT ON COLUMN membership_sources.user_id IS 'Current user receiving access; detached during final account purge.';
COMMENT ON COLUMN membership_sources.source_kind IS 'Origin category of the entitlement source.';
COMMENT ON COLUMN membership_sources.membership_provider_lineage_id IS 'Provider lineage for non-admin sources.';

COMMENT ON TABLE membership_source_states IS 'Current mutable state projected from one membership source.';
COMMENT ON COLUMN membership_source_states.membership_source_id IS 'Source whose current entitlement state is projected.';
COMMENT ON COLUMN membership_source_states.source_kind IS 'Copied source kind, constrained to the source row.';
COMMENT ON COLUMN membership_source_states.membership_provider_lineage_id IS 'Copied provider lineage, constrained to the source row.';
COMMENT ON COLUMN membership_source_states.membership_provider_observation_id IS 'Latest normalized provider observation, when the source is provider-backed.';
COMMENT ON COLUMN membership_source_states.membership_product_id IS 'Canonical product currently provided by this source.';
COMMENT ON COLUMN membership_source_states.effective_at IS 'When this projected source state became effective.';
COMMENT ON COLUMN membership_source_states.expires_at IS 'When this projected source state expires, if finite.';
COMMENT ON COLUMN membership_source_states.cancelled_at IS 'Projected cancellation time.';
COMMENT ON COLUMN membership_source_states.expired_at IS 'When this projected source state reached terminal expiration.';
COMMENT ON COLUMN membership_source_states.past_due_at IS 'Projected past-due entry time.';
COMMENT ON COLUMN membership_source_states.paused_at IS 'When this projected source state was paused for a higher-precedence entitlement.';
COMMENT ON COLUMN membership_source_states.auto_renews IS 'Projected provider automatic-renewal setting.';

COMMENT ON TABLE membership_grants IS 'Administrator-issued calendar-day grants, activated in FIFO order.';
COMMENT ON COLUMN membership_grants.membership_source_id IS 'Dedicated administrator source for this grant.';
COMMENT ON COLUMN membership_grants.source_kind IS 'Invariant discriminator proving this is an administrator grant source.';
COMMENT ON COLUMN membership_grants.user_id IS 'Recipient user retained as an audit snapshot after final purge.';
COMMENT ON COLUMN membership_grants.membership_product_id IS 'Canonical product granted to the recipient.';
COMMENT ON COLUMN membership_grants.calendar_days IS 'Number of calendar days granted after activation.';
COMMENT ON COLUMN membership_grants.granted_by_id IS 'Administrator identity retained without an FK for audit persistence.';
COMMENT ON COLUMN membership_grants.issuer_snapshot IS 'Human-readable issuer snapshot retained after account deletion.';
COMMENT ON COLUMN membership_grants.revoked_at IS 'When the grant was revoked before or during activation.';
COMMENT ON COLUMN membership_grants.revoked_by_id IS 'Administrator identity retained without an FK for revocation audit persistence.';
COMMENT ON COLUMN membership_grants.revocation_reason IS 'Bounded reason for revoking the grant.';
COMMENT ON COLUMN membership_grants.note IS 'Optional administrative note for the grant.';

COMMENT ON TABLE membership_grant_activation_periods IS 'Activation history for administrator grants; one open period per user and grant.';
COMMENT ON COLUMN membership_grant_activation_periods.membership_grant_id IS 'Grant activated for this period.';
COMMENT ON COLUMN membership_grant_activation_periods.user_id IS 'Recipient user for the activation period.';
COMMENT ON COLUMN membership_grant_activation_periods.started_at IS 'When the grant began providing access.';
COMMENT ON COLUMN membership_grant_activation_periods.ended_at IS 'When this activation period stopped providing access.';

COMMENT ON TABLE memberships IS 'Current and retained historical user-facing access projection rows derived from a single membership source.';
COMMENT ON COLUMN memberships.user_id IS 'User currently receiving projected membership access.';
COMMENT ON COLUMN memberships.membership_source_id IS 'Source that currently owns this access projection.';
COMMENT ON COLUMN memberships.membership_product_id IS 'Canonical product currently projected as access.';
COMMENT ON COLUMN memberships.effective_at IS 'When the projected membership became effective.';
COMMENT ON COLUMN memberships.expires_at IS 'When the projected membership expires, if finite.';
COMMENT ON COLUMN memberships.cancelled_at IS 'When the projection entered a cancelled state.';
COMMENT ON COLUMN memberships.expired_at IS 'When the projection entered an expired state.';
COMMENT ON COLUMN memberships.past_due_at IS 'When the projection entered a past-due state.';
COMMENT ON COLUMN memberships.paused_at IS 'When the projection entered a paused state.';
COMMENT ON COLUMN memberships.cancel_at_period_end IS 'Whether cancellation takes effect after the current period.';
COMMENT ON COLUMN memberships.latest_change_id IS 'Latest append-only audit row for this projection.';
COMMENT ON COLUMN memberships.renewal_price_increase_notified_provider_product_id IS 'Provider product for the most recent renewal price notification.';
COMMENT ON COLUMN memberships.renewal_price_increase_notified_observation_id IS 'Provider observation claimed for the most recent renewal price notification.';
COMMENT ON COLUMN memberships.renewal_price_increase_notified_effective_at IS 'Effective time of the provider renewal price most recently notified.';
COMMENT ON COLUMN memberships.renewal_price_increase_notified_minor_units IS 'Notified future renewal price in the currency minor unit.';
COMMENT ON COLUMN memberships.renewal_price_increase_notified_currency_code IS 'Currency of the notified future renewal price.';
COMMENT ON COLUMN memberships.renewal_price_increase_notified_at IS 'When the price notification was delivered.';
COMMENT ON COLUMN memberships.renewal_price_increase_claim_token IS 'Fence identifying the worker that owns the current delivery claim.';
COMMENT ON COLUMN memberships.renewal_price_increase_claimed_at IS 'When delivery of the price notification was claimed.';
COMMENT ON COLUMN memberships.renewal_price_increase_delivery_attempted_at IS 'When delivery of the price notification was attempted.';
COMMENT ON COLUMN memberships.projection_ended_at IS 'When this projection stopped being the user''s live membership projection; its historical ID remains retained.';

COMMENT ON TABLE membership_changes IS 'Append-only audit log for membership projection changes.';
COMMENT ON TABLE membership_entitlement_effects IS 'Durable at-least-once delivery intents for derived membership entitlement consumers.';
COMMENT ON COLUMN membership_entitlement_effects.membership_change_id IS 'Immutable membership change that created this delivery intent.';
COMMENT ON COLUMN membership_entitlement_effects.user_id IS 'User whose derived entitlement consumers must be refreshed.';
COMMENT ON COLUMN membership_entitlement_effects.delivered_at IS 'Time both idempotent downstream entitlement effects completed.';
COMMENT ON COLUMN membership_entitlement_effects.delivery_claim_token IS 'Opaque lease token held by the current delivery attempt.';
COMMENT ON COLUMN membership_entitlement_effects.delivery_claimed_at IS 'Time the current delivery lease was acquired.';
COMMENT ON COLUMN membership_changes.membership_id IS 'Membership projection affected by this audit event.';
COMMENT ON COLUMN membership_changes.user_id IS 'User whose membership projection changed.';
COMMENT ON COLUMN membership_changes.membership_source_id IS 'Source responsible for this change, when applicable.';
COMMENT ON COLUMN membership_changes.membership_grant_id IS 'Administrator grant responsible for this change, when applicable.';
COMMENT ON COLUMN membership_changes.change_type IS 'Kind of membership lifecycle or source change.';
COMMENT ON COLUMN membership_changes.from_membership_product_id IS 'Canonical product before the change.';
COMMENT ON COLUMN membership_changes.to_membership_product_id IS 'Canonical product after the change.';
COMMENT ON COLUMN membership_changes.changed_by_id IS 'Actor identity retained without an FK for audit persistence.';
COMMENT ON COLUMN membership_changes.note IS 'Optional bounded note explaining the change.';
COMMENT ON COLUMN membership_changes.membership_provider_evidence_id IS 'Verified provider evidence responsible for this change, when applicable.';
COMMENT ON COLUMN membership_changes.stripe_event_id IS 'Temporary Stripe adapter event identity used for replay protection.';
COMMENT ON COLUMN membership_changes.cancelled_at IS 'Cancellation timestamp snapshot after the change.';
COMMENT ON COLUMN membership_changes.expired_at IS 'Expiration timestamp snapshot after the change.';
COMMENT ON COLUMN membership_changes.past_due_at IS 'Past-due timestamp snapshot after the change.';
COMMENT ON COLUMN membership_changes.paused_at IS 'Pause timestamp snapshot after the change.';
COMMENT ON COLUMN membership_changes.cancel_at_period_end IS 'Cancellation-at-period-end snapshot after the change.';

COMMENT ON TABLE membership_operations IS 'Idempotent provider-operation ledger, including refund allocation snapshots.';
COMMENT ON COLUMN membership_operations.membership_source_id IS 'Source against which the provider operation runs.';
COMMENT ON COLUMN membership_operations.membership_provider_lineage_id IS 'Provider lineage that owns the operated source.';
COMMENT ON COLUMN membership_operations.provider IS 'Provider asked to perform the operation.';
COMMENT ON COLUMN membership_operations.environment IS 'Provider environment containing the operated resource.';
COMMENT ON COLUMN membership_operations.application_id IS 'Provider application, bundle, or tenant containing the operated resource.';
COMMENT ON COLUMN membership_operations.operation_kind IS 'Kind of cancellation or automatic refund operation.';
COMMENT ON COLUMN membership_operations.idempotency_key IS 'Provider-context-scoped idempotency key for this operation.';
COMMENT ON COLUMN membership_operations.qualifying_allocation_minor_units IS 'Eligible allocation amount captured for refund operations.';
COMMENT ON COLUMN membership_operations.remaining_refundable_minor_units IS 'Unrefunded portion of the captured eligible allocation.';
COMMENT ON COLUMN membership_operations.currency_code IS 'Currency of the captured refundable allocation.';
COMMENT ON COLUMN membership_operations.period_started_at IS 'Start of the qualifying refund period.';
COMMENT ON COLUMN membership_operations.period_ends_at IS 'End of the qualifying refund period.';
COMMENT ON COLUMN membership_operations.collision_at IS 'When conflicting entitlement collision handling began.';
COMMENT ON COLUMN membership_operations.requested_at IS 'When the operation was requested.';
COMMENT ON COLUMN membership_operations.completed_at IS 'When the provider operation completed.';
COMMENT ON COLUMN membership_operations.failed_at IS 'When the provider operation failed.';
COMMENT ON COLUMN membership_operations.failure_message IS 'Bounded failure detail for the operation.';
COMMENT ON COLUMN membership_operations.reconciliation_due_at IS 'Earliest time a non-terminal refund operation may be leased for durable reconciliation.';
COMMENT ON COLUMN membership_operations.reconciliation_attempt_ordinal IS 'Monotonic ordinal allocated when a reconciliation lease is acquired.';

COMMENT ON TABLE membership_automatic_refund_receipts IS 'Immutable receipts for automatic or collision-resolution provider refunds.';
COMMENT ON COLUMN membership_automatic_refund_receipts.membership_operation_id IS 'Operation that authorized this receipt.';
COMMENT ON COLUMN membership_automatic_refund_receipts.provider IS 'Provider that issued the refund.';
COMMENT ON COLUMN membership_automatic_refund_receipts.environment IS 'Provider environment containing the refund.';
COMMENT ON COLUMN membership_automatic_refund_receipts.application_id IS 'Provider application, bundle, or tenant containing the refund.';
COMMENT ON COLUMN membership_automatic_refund_receipts.operation_kind IS 'Copied refund-capable operation kind.';
COMMENT ON COLUMN membership_automatic_refund_receipts.provider_refund_id IS 'Provider-context-scoped refund identity, absent only for zero-amount receipts.';
COMMENT ON COLUMN membership_automatic_refund_receipts.amount_minor_units IS 'Amount refunded by this receipt in the currency minor unit.';
COMMENT ON COLUMN membership_automatic_refund_receipts.remaining_refundable_minor_units IS 'Captured operation remainder that bounds this receipt amount.';
COMMENT ON COLUMN membership_automatic_refund_receipts.currency_code IS 'Currency of the receipt amount and operation snapshot.';

COMMENT ON TABLE membership_refunds IS 'Append-only financial ledger of Stripe refunds issued or reconciled.';
COMMENT ON COLUMN membership_refunds.membership_operation_id IS 'Operation that reconciled this refund.';
COMMENT ON COLUMN membership_refunds.membership_id IS 'Membership projection against which the refund was issued.';
COMMENT ON COLUMN membership_refunds.membership_source_id IS 'Immutable entitlement source whose provider lineage supplied the refunded charge.';
COMMENT ON COLUMN membership_refunds.user_id IS 'Member recorded as refunded; retained after final account purge.';
COMMENT ON COLUMN membership_refunds.stripe_refund_id IS 'Stripe Refund object identity and primary replay key.';
COMMENT ON COLUMN membership_refunds.stripe_charge_id IS 'Stripe Charge identity that was refunded.';
COMMENT ON COLUMN membership_refunds.stripe_payment_intent_id IS 'Optional Stripe PaymentIntent identity for the charge.';
COMMENT ON COLUMN membership_refunds.stripe_idempotency_key IS 'Administrator-request idempotency key; absent for dashboard reconciliation.';
COMMENT ON COLUMN membership_refunds.admin_request_fingerprint IS 'SHA-256 fingerprint paired with the administrator idempotency key.';
COMMENT ON COLUMN membership_refunds.amount_minor_units IS 'This receipt amount in the currency minor unit.';
COMMENT ON COLUMN membership_refunds.currency_code IS 'Lowercase ISO currency code reported by Stripe.';
COMMENT ON COLUMN membership_refunds.reason IS 'Categorized reason for the refund.';
COMMENT ON COLUMN membership_refunds.revoked_access IS 'Whether this refund also revoked membership access.';
COMMENT ON COLUMN membership_refunds.issued_by_id IS 'Administrator identity retained without an FK for audit persistence.';
COMMENT ON COLUMN membership_refunds.source IS 'Whether the refund was administrator initiated or dashboard reconciled.';
COMMENT ON COLUMN membership_refunds.stripe_event_id IS 'Stripe event that created this reconciliation receipt.';
COMMENT ON COLUMN membership_refunds.note IS 'Optional bounded administrative refund note.';

COMMENT ON TABLE membership_administrator_refund_operation_requests IS 'Immutable administrator refund request facts, bound one-to-one to the provider operation that reconciles them.';
COMMENT ON COLUMN membership_administrator_refund_operation_requests.membership_operation_id IS 'Administrator refund operation created for this exact request.';
COMMENT ON COLUMN membership_administrator_refund_operation_requests.administrator_request_key IS 'Administrator idempotency key bound to this immutable request.';
COMMENT ON COLUMN membership_administrator_refund_operation_requests.membership_id IS 'Membership selected by the administrator when the request was submitted.';
COMMENT ON COLUMN membership_administrator_refund_operation_requests.issued_by_id IS 'Administrator identity captured without an FK so audit history survives user deletion.';
COMMENT ON COLUMN membership_administrator_refund_operation_requests.provider_payment_reference IS 'Provider payment reference selected as the refund target.';
COMMENT ON COLUMN membership_administrator_refund_operation_requests.provider_subscription_reference IS 'Provider subscription selected for cancellation when cancel_requested is true.';
COMMENT ON COLUMN membership_administrator_refund_operation_requests.amount_minor_units IS 'Requested refund amount in the provider currency minor unit.';
COMMENT ON COLUMN membership_administrator_refund_operation_requests.currency_code IS 'ISO 4217 currency code requested for the refund.';
COMMENT ON COLUMN membership_administrator_refund_operation_requests.reason IS 'Administrator-selected refund reason.';
COMMENT ON COLUMN membership_administrator_refund_operation_requests.cancel_requested IS 'Whether the request also asks the provider subscription to be cancelled.';
COMMENT ON COLUMN membership_administrator_refund_operation_requests.request_fingerprint IS 'SHA-256 fingerprint of the exact immutable administrator request payload.';
COMMENT ON COLUMN membership_administrator_refund_operation_requests.note IS 'Optional administrator note captured with the request.';

COMMENT ON TABLE membership_refund_operation_attempts IS 'Append-only provider refund attempts; only a missing provider refund ID may be enriched after insertion.';
COMMENT ON COLUMN membership_refund_operation_attempts.membership_operation_id IS 'Refund operation whose provider attempt this records.';
COMMENT ON COLUMN membership_refund_operation_attempts.provider IS 'Provider context copied from the immutable refund operation.';
COMMENT ON COLUMN membership_refund_operation_attempts.environment IS 'Provider environment copied from the immutable refund operation.';
COMMENT ON COLUMN membership_refund_operation_attempts.application_id IS 'Provider application copied from the immutable refund operation.';
COMMENT ON COLUMN membership_refund_operation_attempts.attempt_ordinal IS 'Operation-local reconciliation lease ordinal that created this provider attempt.';
COMMENT ON COLUMN membership_refund_operation_attempts.provider_idempotency_key IS 'Provider-scoped idempotency key used for this immutable attempt.';
COMMENT ON COLUMN membership_refund_operation_attempts.provider_refund_id IS 'Provider refund identity, initially unknown and enriched at most once.';
COMMENT ON COLUMN membership_refund_operation_attempts.amount_minor_units IS 'Attempted refund amount in the provider currency minor unit.';
COMMENT ON COLUMN membership_refund_operation_attempts.currency_code IS 'ISO 4217 currency code for the attempted refund.';

COMMENT ON TABLE membership_refund_operation_attempt_metadata_scans IS 'Mutable bounded cursor state for discovering a refund created before a provider response was acknowledged.';
COMMENT ON COLUMN membership_refund_operation_attempt_metadata_scans.membership_refund_operation_attempt_id IS 'Refund operation attempt whose bounded provider-metadata discovery state this row owns.';
COMMENT ON COLUMN membership_refund_operation_attempt_metadata_scans.stable_head_provider_refund_id IS 'Newest provider refund ID observed at scan start; a changed head restarts the scan before a create is permitted.';
COMMENT ON COLUMN membership_refund_operation_attempt_metadata_scans.next_provider_refund_id IS 'Provider cursor for the next bounded discovery page.';
COMMENT ON COLUMN membership_refund_operation_attempt_metadata_scans.lease_token IS 'Current operation lease required to advance, restart, or complete this scan; stale workers cannot write state.';
COMMENT ON COLUMN membership_refund_operation_attempt_metadata_scans.completed_at IS 'Set only after a fresh head check proves the full scan was stable and no metadata match exists.';

COMMENT ON TABLE stripe_events IS 'Ingested Stripe events with explicit processing lifecycle timestamps.';
COMMENT ON COLUMN stripe_events.stripe_event_id IS 'Unique Stripe event identity used for deduplication.';
COMMENT ON COLUMN stripe_events.event_type IS 'Stripe event type.';
COMMENT ON COLUMN stripe_events.livemode IS 'Whether Stripe issued the event in live mode.';
COMMENT ON COLUMN stripe_events.api_version IS 'Stripe API version that generated the event.';
COMMENT ON COLUMN stripe_events.stripe_created_at IS 'When Stripe created the event.';
COMMENT ON COLUMN stripe_events.customer_id IS 'Optional Stripe Customer identity from the payload.';
COMMENT ON COLUMN stripe_events.subscription_id IS 'Optional Stripe Subscription identity from the payload.';
COMMENT ON COLUMN stripe_events.invoice_id IS 'Optional Stripe Invoice identity from the payload.';
COMMENT ON COLUMN stripe_events.checkout_session_id IS 'Optional Stripe Checkout Session identity from the payload.';
COMMENT ON COLUMN stripe_events.received_at IS 'When the event was durably received.';
COMMENT ON COLUMN stripe_events.processing_attempt_id IS 'Fencing token for the current event processing attempt.';
COMMENT ON COLUMN stripe_events.dispatched_at IS 'When the current processing attempt was dispatched.';
COMMENT ON COLUMN stripe_events.processing_started_at IS 'When the current processing attempt began.';
COMMENT ON COLUMN stripe_events.processing_attempts IS 'Number of processing attempts.';
COMMENT ON COLUMN stripe_events.processed_at IS 'When processing completed successfully.';
COMMENT ON COLUMN stripe_events.ignored_at IS 'When processing intentionally ignored the event.';
COMMENT ON COLUMN stripe_events.failed_at IS 'When processing last failed.';
COMMENT ON COLUMN stripe_events.last_error_at IS 'When the latest processing error occurred.';
COMMENT ON COLUMN stripe_events.last_error_message IS 'Bounded latest processing error detail.';
COMMENT ON COLUMN stripe_events.payload IS 'Full Stripe event payload stored as JSONB.';
