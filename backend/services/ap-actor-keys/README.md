# AP Actor Keys

Manages the ActivityPub RSA-2048 signing keypair each local user needs to act as a federated
actor. Backed by `ap_actor_keys` (one row per `user_id`, migration `0560`).

- `getOrCreateActorKeyPair(userId)` — idempotent get-or-create. Generates a fresh RSA-2048
  keypair via `@modules/http-signatures`'s `generateRsaSha256KeyPair()` unconditionally, then inserts
  it with `ON CONFLICT (user_id) DO UPDATE SET user_id = ap_actor_keys.user_id` — a no-op update
  used only so `RETURNING` resolves to the existing row on conflict. This is deliberate: an
  existing keypair is never overwritten by a later call. Rotating it would silently invalidate the
  public key remote servers have already fetched and cached for verifying this actor's past and
  future signed requests.
- `getActorPrivateKeyPem(userId)` — decrypts and returns the PEM-encoded private key for signing
  outbound requests (Phase C4). Returns `null` if the user has no keypair yet; use
  `getOrCreateActorKeyPair` for lazy creation.

The private key is never stored in plaintext. `private_key_ciphertext` is AES-256-GCM-encrypted
via `@modules/token-secrets`' `encryptSecret`/`decryptSecret`, purpose-bound to
`` `ap:actor-key:${userId}` ``. The public key is stored in plaintext (`public_key_pem`) — it is
served openly on the actor document.

## Performance

One row per federating user; lookups and the get-or-create upsert are both single-row
primary-key operations. No batch or list APIs are needed — actor documents are fetched one user
at a time.
