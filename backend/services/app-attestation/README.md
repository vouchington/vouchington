# App Attestation

Apple App Attest verification and per-device key storage, used to prove requests originate from
a genuine, unmodified build of the iOS app.

## Overview

This service wraps [`node-app-attest`](https://www.npmjs.com/package/node-app-attest) to verify
Apple's DeviceCheck App Attest cryptographic proofs locally (no outbound calls to Apple). It
covers two flows:

- **Attestation** — verified once per device key, right after the app generates a new key via
  `DCAppAttestService`. On success the device's public key is stored.
- **Assertion** — verified on each subsequent request the app wants to prove came from an
  attested device. Requires a strictly increasing sign count.

Both flows are bound to a single-use challenge issued by the caller ahead of time and stored in
Valkey.

## Key Files

- `challenges.mts` — Valkey-backed single-use challenge storage (5-minute TTL, atomic
  get-and-delete via the shared Valkyries primitive), shared by both flows via an
  `AppAttestChallengeType` discriminator
- `config.mts` — `DynamicConfig` feature toggles (`enabled`, `require_attestation_for_bypass`,
  `allow_development_attestation`) plus `APPLE_APP_ATTEST_TEAM_ID` / `APPLE_APP_ATTEST_BUNDLE_ID`
  environment reads
- `types.mts` — Safe public result types (`AttestationResult`, `AssertionResult`). Raw attestation
  blobs, raw assertion blobs, and raw public key bytes never cross the service boundary (barrel
  export) — only opaque results.
- `store.mts` — `app_attestation_keys` persistence (internal only, not re-exported from `index.mts`)
- `attestation.mts` — `verifyAndStoreAttestation`
- `assertion.mts` — `verifyAssertion`

## Architecture Notes

- Challenges are stored under `app-attest-challenge:{type}:{key}` where `type` is `'attestation'`
  or `'assertion'`, mirroring the passkeys challenge pattern.
- The DB stores `key_id` and `public_key` as raw bytes (`bytea`). `node-app-attest` uses different
  wire formats for both: `keyId` as a base64 string, `publicKey` as a PEM (SPKI) string. Conversion
  happens at the `attestation.mts`/`assertion.mts` boundary — `store.mts` only ever sees `Buffer`s.
- `sign_count` is enforced strictly increasing in two independent places: `node-app-attest` itself
  rejects a non-increasing count, and `store.mts`'s `bumpAttestationSignCount` additionally guards
  the `UPDATE` with `WHERE sign_count < newSignCount`, so a regression can never persist even if a
  caller bypassed the library check.
- `node-app-attest`'s functions are synchronous, local, pure verification — no network calls.
- `app_attestation_keys.did` binds a key to the device that attested it. There is no `devices`
  table — `did` is the device-token claim (`ctx.getDeviceTokenData()`) active at attest time.
  `verifyAssertion` compares it against the caller's current `did` on every call.

### `verifyAndStoreAttestation({ challengeKey, keyId, did, attestation })`

1. Atomically consumes the `'attestation'`-type challenge for `challengeKey`. Throws `400` if
   missing/expired/already consumed.
2. Calls `verifyAttestation` from `node-app-attest` with the consumed challenge, the app's
   `APPLE_APP_ATTEST_TEAM_ID`/`APPLE_APP_ATTEST_BUNDLE_ID`, and whether development-environment
   attestations are currently allowed (`allow_development_attestation` DynamicConfig field). Wraps
   any failure as `401` with `.cause` set to the underlying error.
3. Converts the returned PEM public key to DER and inserts a new `app_attestation_keys` row,
   recording the caller's current `did` (device-token claim) alongside the key — this binds the
   key to that device for every later `verifyAssertion` call (see below). Throws `409` if `keyId`
   is already registered.
4. Returns `{ keyId, environment }`.

**`challenge` is raw, unhashed data.** `node-app-attest` SHA-256-hashes it exactly once
internally. The caller must pass the literal challenge string that was issued — never a
pre-hashed digest.

### `verifyAssertion({ challengeKey, keyId, did, assertion, payload })`

1. Atomically consumes the `'assertion'`-type challenge for `challengeKey`. Throws `400` if
   missing/expired/already consumed.
2. Loads the stored key for `keyId`. Throws `403 ATTESTATION_REJECTED` if unknown.
3. Compares the stored key's `did` against the caller's current `did`. Throws
   `403 ATTESTATION_REJECTED` on a mismatch — this stops one attested device from acting as a
   signing oracle for a different device's (e.g. a stolen) session; see
   [docs/overview/architecture/app-attestation.md § Replay Defenses](../../../docs/overview/architecture/app-attestation.md#replay-defenses).
4. Rejects development-environment keys with `403 ATTESTATION_REJECTED` unless
   `allow_development_attestation` is enabled.
5. Converts the stored DER public key to PEM and calls `verifyAssertion` from `node-app-attest`
   with the stored `sign_count`. Wraps any failure as `403 ATTESTATION_REJECTED` with `.cause` set
   to the underlying error.
6. Persists the new `sign_count` (guarded against regression) and returns `{ keyId, signCount }`.
   A regression throws `409 ATTESTATION_REJECTED` instead of `403`.

**A `409` here can mean a legitimate race, not just a replay attack.** Two concurrent assertions
for the same `keyId` and `signCount` both pass `node-app-attest` verification, but only the first
`bumpAttestationSignCount` update succeeds — the second loses the `WHERE sign_count < newSignCount`
race and gets `409`. Callers should treat `409` as recoverable: generate a fresh assertion (new
challenge + new Secure Enclave signature) and retry, rather than surfacing it as a fatal error.
Both codes share `ATTESTATION_REJECTED` so callers can branch on the code rather than the status.

**`payload` is raw, unhashed data — this is the single most important contract in this
service.** `node-app-attest` computes `clientDataHash = SHA256(payload)` internally as part of
verifying the assertion signature. If a caller pre-hashes the payload before calling this
function, the digest sent to `node-app-attest` will not match what the device actually signed,
and every assertion will fail verification. Pass the exact raw bytes/string the device signed —
never `sha256(...)` of it. The Turnstile-bypass caller ([`@services/captcha`'s
`verifyCaptchaOrAttestation`](../captcha/README.md#app-attest-bypass)) uses `` `${challengeId}:${actionTag}` ``
as `payload`: the challenge ID binds the assertion to a single-use challenge, and the static
`actionTag` binds it to the specific endpoint being called, so an assertion minted for one gated
endpoint can't be replayed against another.

**This service does not parse or validate the contents of `payload`.** It is the caller's
responsibility to construct `payload` so that it is cryptographically bound to the specific
challenge and request being authorized (e.g. by including the challenge value itself). The
single-use Valkey challenge only guarantees the challenge can't be consumed twice — it does not by
itself prove `payload` was built from that challenge.

## Boundary

- Challenge issuance/consumption, verification, and key persistence belong here
- API routes own content-type checks, request parsing, and response field selection
- Return keys/results as domain data; do not set HTTP responses here

## Related

- Passkeys (sibling WebAuthn credential service, same challenge-storage pattern):
  [backend/services/passkeys/README.md](../passkeys/README.md)
- Auth overview: [docs/overview/architecture/auth-overview.md](../../../docs/overview/architecture/auth-overview.md)
- Turnstile-bypass consumer: [backend/services/captcha/README.md § App Attest bypass](../captcha/README.md#app-attest-bypass)
