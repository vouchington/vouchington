# API

[Back to JWT Session Service](README.md#api)

### `createDeviceAndSessionTokens(options)`

Creates signed device and session JWTs. New `did` and `sid` values are UUIDv7; legacy valid UUID
session/device IDs are rotated to UUIDv7 before signing. Non-null `uid` values must be valid UUIDs.
Optionally embeds enriched claims (`roles`, `membershipPlan`, `trustTier`) for authenticated sessions. Authenticated minting defaults `rca` to 30 minutes after issuance; the refresh path may pass its existing deadline to preserve that cold-reload bound. Accepts a `deviceClass` option
(`'attested'`) that embeds `dc` on the device token and selects the session token's expiry via
`sessionExpiryFor(deviceClass)`. Emits to the `auth_sessions` analytics table as `created`.

### `createSessionToken(options)`

Session-only variant of `createDeviceAndSessionTokens`. `did` must already be UUIDv7; legacy `sid`
values are rotated to UUIDv7 before signing, and non-null `uid` values must be valid UUIDs. Its authenticated `rca` behavior matches `createDeviceAndSessionTokens`. Skips
device JWT signing when the device token already exists. Also accepts `deviceClass` to select the
session's expiry via `sessionExpiryFor` — it never adds `dc` to the session payload itself. Defaults to a `created`
analytics event; warm/cold refresh paths pass `refreshed_authenticated`, and anon fallback reuse
records `refreshed_anonymous`.

### `verifyDeviceAndSessionTokens({ deviceToken, sessionToken })`

Verifies JWT signatures only (no Valkey). Returns the full session payload including enrichment
fields, or `false` if invalid.

### `refreshSessionState(options)` — PATCH /api/v1/session

Implements hot/warm/cold path logic. Returns refreshed `{ did, dt, st, sid, uid, session }`.
Callers that are explicitly validating session state can pass `verifyRevocationOnHotPath: true` to
check revocation even when `sca` has not elapsed; the default preserves the zero-Valkey hot path for
proxy-filtered refreshes.

### `resetSessionState(options)` — DELETE /api/v1/session

Revokes the current uid-bearing session (if valid) and issues a fresh anon session preserving the
device ID. Anonymous sessions are rotated without writing revocation markers.

### `getEnrichedSessionClaims(userId)`

Fetches roles, membership plan, trust tier, and suspension status from DB for embedding in
the session JWT.

### `markJwtStale(userId)` / `markJwtStaleBatch(userIds)` / `isJwtStale(userId)` / `clearJwtStaleIfCurrent(userId, marker)`

Manage the per-user staleness marker that triggers a cold-path DB reload.

### `revokeSession(sid)` / `isSessionRevoked(sid)`

Manage session revocation by session ID.

### `upsertAuthenticatedSession(currentUserId, options)`

Inserts or refreshes the persistent `user_sessions` row for an authenticated JWT session. Used on
login, session refresh, and the sessions list endpoint to keep `last_seen_at`, `expires_at`, and
request metadata current.

### `listActiveUserSessions(currentUserId, currentSessionId)`

Returns the current user's active session rows with the `is_current` flag applied.

### `revokeAuthenticatedSession(currentUserId, sessionId)` / `revokeAllAuthenticatedSessions(currentUserId)`

Owner-scoped revocation helpers that mark `user_sessions` rows revoked and write the matching
Valkey revocation keys. `revokeAllAuthenticatedSessions` batches Valkey writes when more than one
session is revoked.
