# App Attestation API

Routes for the Apple App Attest device-attestation lifecycle: issuing single-use challenges and
verifying a device's first-time key registration.

Business logic lives in
[backend/services/app-attestation/README.md](../../../services/app-attestation/README.md) — these
routes are thin wrappers that parse the request, call the service, and shape the response.

## Routes

| Method | Route                               | Auth | Description                                                               |
| ------ | ----------------------------------- | ---- | ------------------------------------------------------------------------- |
| `POST` | `/api/v1/app-attestation/challenge` | None | Issue a single-use challenge for an `attestation` or `assertion` ceremony |
| `POST` | `/api/v1/app-attestation/attest`    | None | Verify a first-time App Attest key registration; upgrades the device      |

Both routes are anonymous/device-scoped, not user-scoped — a device must be able to attest itself
before it has ever signed in. Both are rate-limited as `sensitive` (5 req/min per anonymous caller)
in [`route-rate-limits/config.mts`](../../../services/route-rate-limits/config.mts).

Both routes reject with a coded `403 BYPASS_DISABLED` before doing any other work when
`app-attestation-config.enabled` is off (the pre-rollout default) — this keeps a probing client from
registering a key or reaching the SSM-backed Apple credential env vars while the feature is disabled.

Only the `attestation` half of the App Attest lifecycle is handled here. Per-request `assertion`
verification (proving a subsequent request comes from an already-attested key) is consumed via
request headers by the Turnstile-bypass path, not through a dedicated route in this module.

### `POST /api/v1/app-attestation/challenge`

Request:

```json
{ "type": "attestation" }
```

`type` must be `"attestation"` or `"assertion"`.

Response (`200`):

```json
{ "challenge_id": "01930c9e-...-...", "challenge": "base64url-random-bytes" }
```

`challenge_id` keys the single-use Valkey entry; `challenge` is the raw, unhashed nonce the device
signs. The challenge expires after 5 minutes (`storeAppAttestChallenge`'s TTL) if unused.

### `POST /api/v1/app-attestation/attest`

Request:

```json
{
  "keyId": "base64-key-id",
  "attestation": "base64-cbor-attestation-object",
  "challengeId": "01930c9e-...-..."
}
```

Field names are camelCase to match the Swift client's request body (see
[`Endpoint+AppAttestation.swift`](https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/core/Sources/VouchaAPI/Endpoint%2BAppAttestation.swift)) —
`JSONEncoder.keyEncodingStrategy = .convertToSnakeCase` does not transform dictionary-literal
bodies, only `Codable` struct fields, so this endpoint intentionally does not follow the
snake_case convention used elsewhere in this API.

`attestation` is base64-decoded to a `Buffer` before being passed to
`verifyAndStoreAttestation({ challengeKey: challengeId, keyId, attestation })`. Any error the
service throws (`400` missing/expired challenge, `401` verification failure, `409` duplicate
`keyId`) propagates unchanged.

On success, the route always re-mints the caller's `dt`/`st` cookie pair with
`deviceClass: 'attested'` — regardless of whether the caller was already signed in — which extends
the session cookie's expiry from 2 days to 30 days (`sessionExpirySecondsFor`). Existing `uid`,
`sid`, and session enrichment (`rol`/`mpl`/`tt`/`uil`) are preserved; only the device class changes.

Response (`200`):

```json
{ "environment": "production" }
```

The Swift client decodes this endpoint's response as an empty `Decodable` struct and does not
depend on any particular field being present.

## Performance

| Route                                  | Round trips                                                      | Cache hits | Cache-Control   |
| -------------------------------------- | ---------------------------------------------------------------- | ---------- | --------------- |
| POST /api/v1/app-attestation/challenge | 1 Valkey write                                                   | None       | None (mutating) |
| POST /api/v1/app-attestation/attest    | 1 Valkey read/delete + 1 DB write + 1 Valkey write (new session) | None       | None (mutating) |

## Related

- Service contract: [backend/services/app-attestation/README.md](../../../services/app-attestation/README.md)
- Reference pattern for device-scoped, no-auth cookie re-minting: [backend/api/v1/sessions-authentication/auth-passkeys-signin.mts](../sessions-authentication/auth-passkeys-signin.mts)
