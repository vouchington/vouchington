# TOTP Authenticator Service

Manages TOTP (Time-based One-Time Password) authenticator devices for multi-factor authentication.

## Purpose

Allows users to register TOTP authenticator apps (e.g. Google Authenticator, Authy) as a second
factor. Each user may have multiple authenticators. During login, any verified authenticator can
satisfy the MFA challenge.

## Data Model

### `user_totp_authenticators`

| Column              | Type        | Description                                                                          |
| ------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `id`                | UUID (v7)   | Primary key; `created_at` is derived from this                                       |
| `user_id`           | UUID        | Owner; cascades on user deletion                                                     |
| `secret_ciphertext` | TEXT        | AES-GCM encrypted TOTP shared secret ciphertext; plaintext is only returned at setup |
| `name`              | TEXT        | User-provided label (1-100 chars, trimmed)                                           |
| `verified_at`       | TIMESTAMPTZ | NULL while setup is pending; set on first valid code                                 |
| `created_at`        | TIMESTAMPTZ | Virtual column derived from UUIDv7 timestamp                                         |
| `updated_at`        | TIMESTAMPTZ | Last modification time                                                               |

Only rows where `verified_at IS NOT NULL` are considered active authenticators.

## TOTP Parameters

| Parameter   | Value                         |
| ----------- | ----------------------------- |
| Algorithm   | SHA1                          |
| Digits      | 6                             |
| Period      | 30 s                          |
| Secret size | 20 bytes                      |
| Issuer      | Voucha                        |
| Window      | ±1 period (allows clock skew) |

## Setup Flow

1. **Create** — `createTotpAuthenticator(userId, name)` inserts a row with `verified_at = NULL`
   and returns `TotpSetupData` containing the `secret` (base32) and `uri` (otpauth://) for QR code
   display. The secret is only returned at this step.
2. **Verify** — `verifyTotpSetup(userId, authenticatorId, code)` validates the first code from the
   authenticator app and sets `verified_at = NOW()`, completing enrollment.

## Code Verification (Login MFA)

`verifyTotpCode(userId, code)` checks the supplied code against all verified authenticators for
the user. Returns `true` on the first match, `false` if none match. The validation window of ±1
period accommodates minor clock drift.

## Security Notes

- The base32 secret is encrypted with `@modules/token-secrets` before storage and returned **only once**: in the `TotpSetupData` response from `createTotpAuthenticator`. It is never returned again after initial setup.
- Only authenticators with `verified_at IS NOT NULL` are active and can satisfy a login challenge.
- The `otpauth://` URI embeds the secret and issuer name (`Voucha`) for QR code scanning.

## Integration

This service is consumed by:

- `@services/mfa` — MFA orchestration (login attempt completion, status checks)
- [`backend/api/v1/sessions-authentication/auth-mfa.mts`](../../api/v1/sessions-authentication/auth-mfa.mts) — MFA login TOTP verification and re-auth
- [`backend/api/v1/sessions-authentication/auth-totp.mts`](../../api/v1/sessions-authentication/auth-totp.mts) — TOTP management (setup, list, rename, delete)

## Related

- [backend/services/mfa/README.md](../mfa/README.md)
- [backend/api/v1/sessions-authentication/README.md](../../api/v1/sessions-authentication/README.md)
