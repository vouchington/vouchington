# Session JWT

Voucha's session-protocol adapter for [`backend/`](../../backend/) and
[`cloudflare-worker/`](../../cloudflare-worker/). It keeps Voucha issuers, audiences, claims, env
fallback, cookies, and session-duration policy local while delegating portable JWT signing,
verification, decoding, and UUIDv7 primitives to `@vouchington/session-jwt`.

The shared helpers avoid direct Node-only global assumptions so the package typechecks cleanly
under both backend and worker TypeScript projects.

Session cookie names, validation, and device expiry policy remain local; generic cookie serialization
is supplied by `@vouchington/utils/cookies`.

## Env Vars

- `VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64`: base64-encoded JSON array of private JWKs, newest key
  first
- `VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64`: base64-encoded JSON array of public JWKs, newest key
  first

Backend signs with the first private key. Verification accepts any configured matching key. If the
public-key env var is omitted, verification can derive public keys from the private-key list.

Decoded or verified session tokens must carry valid UUID `did` and `sid` values, `uid` as either a
valid UUID string or `null`, and correctly typed optional enrichment claims (`rol`, `mpl`, `tt`,
`rca`, `sca`). Verified device tokens must carry a valid UUID `did`. New signing paths mint UUIDv7
session/device IDs and rotate legacy UUID session/device IDs on refresh. Malformed signed session
payloads decode or verify as `null`.

## Rotation

1. prepend the new private/public key pair to the arrays
2. deploy backend and Cloudflare Worker with both keys present
3. wait for previously issued JWTs to expire
4. remove the trailing old key

## Dev/Test

When no key env vars are configured outside production, the package falls back to the shared test
key so backend and worker local development continue to work together.

The package also re-exports `mintUUIDv7()` and `validateUUIDv7()` from `@vouchington/session-jwt`
for callers that need durable session/device identifiers.
