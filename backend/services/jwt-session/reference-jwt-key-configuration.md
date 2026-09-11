# JWT Key Configuration

[Back to JWT Session Service](README.md#jwt-key-configuration)

- `VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64`: base64-encoded JSON array of private JWKs, newest first.
  Backend signing uses the first key.
- `VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64`: base64-encoded JSON array of public JWKs, newest first.
  Cloudflare Worker verification uses this. Backend can derive public keys from the private-key list.

Configured keys must be RSA signature JWKs with `alg: "RS512"` and unique `kid` values. The shared
JWT package rejects other key types or algorithms before signing/verifying.

Rotation rule:

1. Prepend the new key pair to both arrays
2. Deploy backend and edge with both keys present
3. Wait for old JWTs to age out
4. Remove the older trailing key
