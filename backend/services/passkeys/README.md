# Passkeys

WebAuthn/FIDO2 passwordless authentication for registration, login, and account signup.

## Overview

This service adapts the generic `@vouchington/auth` WebAuthn engine to Voucha persistence, Valkey
state, failure limiting, HTTP errors, and JWT sessions. It supports adding a passkey, MFA
authentication, and discoverable sign-in without provisioning accounts.

## Key Files

- `flows.mts` — Registration options and verification (adding a passkey to an existing account)
- `authentication-flows.mts` — Second-factor passkey auth (used after primary login for MFA)
- `discoverable-flows.mts` — Discoverable/passwordless passkey sign-in (sign-in without email, never creates accounts)
- `protocol.mts` — Generic engine configuration and Voucha storage/rate-limit adapters
- `challenges.mts` — Valkey-backed challenge storage with 5-minute TTL and atomic get-and-delete via the shared Valkyries primitive
- `config.mts` — Relying Party configuration (RP_ID, RP_NAME)
- `create.mts` — Persists new passkey credentials to `user_passkeys` table
- `get.mts` — Credential lookups by ID or user
- `update.mts` — Atomically records successful use and advances supported signature counters
- `delete.mts` — Passkey removal
- `types.mts` — `Passkey` and `PublicPasskey` type definitions

## Architecture Notes

- Challenges are stored in Valkey with a `passkey-challenge:` prefix and 5-minute TTL
- Rate limiting is applied per device ID and IP for both authentication (6 attempts/60s) and signup flows
- Device ID consistency is enforced between the JWT `did` claim and the request `deviceId`
- On successful auth/signup, `createDeviceAndSessionTokens` issues JWT tokens and entity listener events are enqueued
- Passkey creation triggers a vote weight recalculation for the user

## Discoverable Passkey Sign-In

Discoverable (passwordless) passkey sign-in is implemented in `discoverable-flows.mts`. Unlike the
MFA second-factor flow, this allows a user to sign in without first providing an email address.

**Sign-in only — never sign-up.** If the credential ID is not found in `user_passkeys`, the service
throws `401 Passkey sign-in failed` and does not provision an account. This prevents
silent account creation and credential enumeration.

**`userVerification: 'required'`** is enforced (vs `'preferred'` for MFA). This guarantees the
authenticator performed UV (biometric/PIN), making the sign-in inherently multi-factor without a
separate challenge step.

### `getDiscoverablePasskeyAuthenticationOptions(deviceId)`

1. Uses `passkeyProtocol` to generate options with no allowed-credential filter and required UV.
2. Stores challenge in Valkey under `passkey-discoverable-auth:{deviceId}` with 5-minute TTL.
3. Returns options — the empty `allowCredentials` array enables resident/discoverable credentials.

### `verifyDiscoverablePasskeyAuthentication({ deviceId, sessionId, expectedOrigin, response })`

1. Retrieves and atomically deletes the challenge from Valkey. Returns 400 if missing/expired.
2. Looks up the passkey by credential ID via `getPasskeyByCredentialId`. Returns 401 if not found.
3. Delegates assertion verification and failure limiting to `passkeyProtocol`.
4. Records successful use and advances the passkey counter via `updatePasskeyCounter`.
5. Checks user suspension via `getEnrichedSessionClaims`.
6. Issues `dt`/`st` tokens via `createDeviceAndSessionTokens` and returns them.

API routes: `POST /api/v1/auth/passkeys/authentication/options` and
`POST /api/v1/auth/passkeys/authentication/verify` in
`backend/api/v1/sessions-authentication/auth-passkeys-signin.mts`.

## Passkey Authentication (MFA)

Passkey authentication is used as a second factor after primary auth (email OTP or OAuth). The functions live in `authentication-flows.mts` and are imported by the MFA API routes.

### `getPasskeyAuthenticationOptions(userId, deviceId)`

Generates a WebAuthn authentication challenge for the given user:

1. Looks up all registered credential IDs for `userId`.
2. Uses `passkeyProtocol` to generate preferred-UV options with those credential IDs.
3. Stores the challenge in Valkey under `passkey-auth:{userId}:{deviceId}` with a 5-minute TTL.
4. Returns the options object (sent to the client as `{ options }`).

### `verifyPasskeyAuthentication(userId, deviceId, expectedOrigin, response)`

Verifies a client's authentication assertion:

1. Retrieves and atomically deletes the challenge from Valkey (`passkey-auth:{userId}:{deviceId}`). Returns a 400 error if missing or expired.
2. Looks up the passkey by credential ID and verifies it belongs to `userId`.
3. Delegates assertion verification to `passkeyProtocol` with the request origin and RP policy.
4. On success, records use and updates the passkey counter via `updatePasskeyCounter`.
5. Returns `{ verified: boolean, passkeyId: string }`.

The caller (`POST /api/v1/auth/mfa/passkeys/authentication/verification`) then calls `completeMfaLogin` to issue JWT tokens.

## Boundary

- Generic WebAuthn ceremony and verification invariants belong to `@vouchington/auth`
- Voucha owns RP policy, deployed challenge keys, persistence, failure limiting, and error mapping
- API routes own content-type checks, cookie writes, and response field selection
- Return users/tokens/passkeys as domain data; do not set HTTP responses here

## Related

- JWT session tokens: [backend/services/jwt-session/README.md](../jwt-session/README.md)
- Entity listeners: [backend/queues/entity-listeners/README.md](../../queues/entity-listeners/README.md)
- Vote weight: [backend/queues/vote-weight/README.md](../../queues/vote-weight/README.md)
- Auth overview: [docs/overview/architecture/auth-overview.md](../../../docs/overview/architecture/auth-overview.md)
