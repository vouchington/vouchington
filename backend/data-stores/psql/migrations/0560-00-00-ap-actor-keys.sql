-- ActivityPub actor signing keys (Phase C). One RSA keypair per local user who has opted into
-- federation. Private keys are encrypted at rest via @modules/token-secrets (encryptSecret with
-- purpose `ap:actor-key:${userId}`) and decrypted on demand to sign outbound HTTP Signatures.

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS activitypub_actor_keys (
  user_id UUID PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  key_id TEXT NOT NULL,
  public_key_pem TEXT NOT NULL,
  private_key_ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_activitypub_actor_keys_updated_at
BEFORE UPDATE ON activitypub_actor_keys
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_activitypub_actor_keys__key_id ON activitypub_actor_keys (key_id);

COMMENT ON TABLE activitypub_actor_keys IS 'RSA signing keypair for a local user''s ActivityPub actor (/ap/users/:userId). Private key is encrypted at rest; only ever decrypted in-process to sign outbound HTTP Signatures.';
COMMENT ON COLUMN activitypub_actor_keys.user_id IS 'The local user this actor keypair belongs to. One keypair per federated user.';
COMMENT ON COLUMN activitypub_actor_keys.key_id IS 'The public keyId URI advertised on the actor document and used in the HTTP Signature keyId parameter, e.g. https://host/ap/users/:userId#main-key.';
COMMENT ON COLUMN activitypub_actor_keys.public_key_pem IS 'PEM-encoded RSA public key, published on the actor document for remote signature verification.';
COMMENT ON COLUMN activitypub_actor_keys.private_key_ciphertext IS 'AES-256-GCM ciphertext (via @modules/token-secrets encryptSecret, purpose ap:actor-key:<userId>) of the PEM-encoded RSA private key. Never store or log the plaintext PEM.';
