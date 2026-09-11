-- Apple App Attest: per-device attested keys used to verify assertions from the iOS app.
-- edited-in-place: pre-launch, never deployed to production

DO $$ BEGIN
  CREATE TYPE app_attestation_environments AS ENUM ('production', 'development');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS app_attestation_keys (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  key_id BYTEA NOT NULL UNIQUE CHECK (length(key_id) = 32),
  did UUID NOT NULL,
  public_key BYTEA NOT NULL,
  sign_count BIGINT NOT NULL DEFAULT 0,
  bundle_id TEXT NOT NULL,
  environment app_attestation_environments NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  last_used_at TIMESTAMPTZ
);

COMMENT ON TABLE app_attestation_keys IS 'Apple App Attest keys, one row per device-generated attestation key, used to verify subsequent per-request assertions.';
COMMENT ON COLUMN app_attestation_keys.key_id IS 'Apple App Attest key identifier: raw 32-byte SHA-256 of the attested public key, as returned by DCAppAttestService.';
COMMENT ON COLUMN app_attestation_keys.did IS 'The dt device-id claim bound to this key at attest time. There is no devices table (did is an ephemeral JWT claim, not a durable identity) so this is a plain UUID, not a foreign key. Assertion verification rejects a valid signature if the caller''s current did does not match, so one attested device cannot be used as a signing oracle for another device''s session.';
COMMENT ON COLUMN app_attestation_keys.public_key IS 'Attested EC P-256 public key (DER, SPKI format).';
COMMENT ON COLUMN app_attestation_keys.sign_count IS 'Highest assertion sign count verified for this key. Assertions must present a strictly greater sign count.';
COMMENT ON COLUMN app_attestation_keys.bundle_id IS 'App bundle identifier the key was attested for.';
COMMENT ON COLUMN app_attestation_keys.environment IS 'Apple App Attest environment (production or development) the key was attested under. Development-environment keys are rejected at assertion time once development attestation is disabled.';
COMMENT ON COLUMN app_attestation_keys.last_used_at IS 'Timestamp of the most recently verified assertion for this key.';
