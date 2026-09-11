# @services/mfa

MFA orchestration service. Owns no database tables — reads from `user_passkeys` and `user_totp_authenticators`, and stores all ephemeral state in Valkey.

## Purpose

- **MFA status**: determines whether a user has any MFA method enrolled and counts each type
- **Login attempt**: holds pending MFA verification state between primary auth and MFA completion
- **Re-auth**: issues a short-lived token after a user re-authenticates, used before removing the last MFA method

## Valkey Keys & TTLs

| Key pattern                  | TTL   | Purpose                                               |
| ---------------------------- | ----- | ----------------------------------------------------- |
| `mfa-login-attempt:<uuid>`   | 300 s | Pending MFA login state (userId, deviceId, sessionId) |
| `mfa-reauth:<userId>:<uuid>` | 300 s | Re-auth proof token                                   |

All reads use the shared Valkyries atomic get-and-delete primitive to prevent replay.

## Login Attempt Flow

1. Primary auth (email OTP or OAuth) succeeds.
2. Server calls `createLoginAttempt({ userId, deviceId, sessionId })` → returns `attemptId`.
3. `attemptId` is sent to the client (e.g. in a short-lived cookie or response body).
4. Client completes MFA (passkey assertion or TOTP verify) and submits `attemptId`.
5. Server calls `getAndDeleteLoginAttempt(attemptId)` — returns the attempt once, then deletes it.

## MFA Status

`getUserMfaStatus(userId)` queries `user_passkeys` and `user_totp_authenticators` (verified only) and returns:

```ts
{
  hasMfa: boolean // true if passkeysCount + totpCount > 0
  passkeysCount: number
  totpCount: number
}
```

This is used by API routes to decide whether to gate a login with an MFA step, and by the DELETE endpoints to decide whether re-authentication is required before removal.

## Re-Auth Flow

1. User requests a sensitive action (e.g. removing their last MFA method).
2. User re-authenticates with an existing MFA method.
3. Server calls `createReAuthToken(userId)` → returns `token`.
4. Token is included in the subsequent sensitive-action request.
5. Server calls `verifyAndDeleteReAuthToken(userId, token)` — returns `true` once, then deletes it.

## Related

- [Passkeys Service](../passkeys/README.md)
- [TOTP Service](../totp/README.md)
- [Auth Overview](../../../docs/overview/architecture/auth-overview.md)
