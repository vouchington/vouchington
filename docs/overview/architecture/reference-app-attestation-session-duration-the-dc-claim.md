# App Attest reference

[Back to App Attest](app-attestation.md)

## Session Duration (the `dc` claim)

Successful attestation re-mints the caller's `dt`/`st` cookie pair with `deviceClass: 'attested'`
(`createDeviceAndSessionTokens`, `backend/services/jwt-session/create.mts`). This sets the `dc`
(DeviceClass) claim to `'attested'` on the **device token only** — the session token payload has
no `dc` field. `dc` instead controls the _session token's expiry_, via `sessionExpiryFor(dc)` /
`sessionExpirySecondsFor(dc)` (`ts-shared/session-jwt/constants.mts`):

| `dc`         | Session (`st`) expiry | Device (`dt`) expiry |
| ------------ | --------------------- | -------------------- |
| unset        | 2 days                | 30 days              |
| `'attested'` | 30 days               | 30 days (unchanged)  |

The verified device token's `dc` is re-read and threaded through every session refresh
(`backend/services/jwt-session/flows.mts`), so an attested device keeps getting 30-day sessions on
every warm/cold refresh for as long as its device token still carries `dc: 'attested'` — the
device does not need to re-attest on every session renewal, only when it needs a new key (e.g.
after Keychain data loss forces a fresh `generateKey()`).

See [auth-overview.md § Tokens](auth-overview.md#tokens) and
[jwt-session/README.md](../../../backend/services/jwt-session/README.md) for the general
device/session token model this extends.

## Native Device Identity

Swift clients expose `AppAttestationService.deviceId()` as the stable local/native device
identifier on App Attest-capable devices. It returns the Keychain-persisted App Attest key ID,
generating and attesting a key on first use through the same path used for protected-request
assertions. Unsupported devices return `nil` and continue using the normal session-token device
model plus Turnstile fallback.

This local identifier does **not** replace backend `did` yet. The backend still stores
`app_attestation_keys.did` beside the key and rejects assertions when the caller's current device
token `did` differs from the key's stored binding. There is no current
`UIDevice.identifierForVendor` usage in the Swift client; native identity should use
`AppAttestationService.deviceId()` rather than adding a vendor identifier fallback.

## Replay Defenses

- **Single-use challenge** — `storeAppAttestChallenge`/`getAndDeleteAppAttestChallenge`
  (`backend/services/app-attestation/challenges.mts`) store the challenge in Valkey
  (`app-attest-challenge:{type}:{key}`, 5-minute TTL) and consume it atomically with a Lua
  `GETDEL` script, so a challenge can back at most one attestation or assertion.
- **Monotonic `sign_count`** — every assertion must carry a strictly greater `sign_count` than the
  value stored for that key. This is checked twice: once inside `node-app-attest` itself, and
  again independently in `bumpAttestationSignCount` (`backend/services/app-attestation/store.mts`)
  via a `WHERE sign_count < newSignCount` SQL guard, so a stale or cloned counter can never persist
  even if the library check were bypassed.
- **`actionTag` binding** — see [Bind to action](reference-app-attestation-two-ceremonies.md#turnstile-bypass-decision-path). This
  scopes a captured assertion to the endpoint it was generated for; it is not itself a replay
  defense (the single-use challenge is).
- **Device binding (`did`)** — `app_attestation_keys.did` records the device-token `did` claim
  active at attest time. `verifyAssertion()` (`backend/services/app-attestation/assertion.mts`)
  rejects with `403 ATTESTATION_REJECTED` if the caller's current `did` doesn't match the key's
  stored `did`, even when the assertion's signature is otherwise valid. Without this check, one
  attested device could act as an unbounded Turnstile-bypass signing oracle for any other
  device/session (e.g. a stolen session token) that presents its `keyId`.
