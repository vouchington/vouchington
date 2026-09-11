# Authentication Overview reference

[Back to Authentication Overview](auth-overview.md)

## Multi-Factor Authentication

### MFA Methods

Users may register multiple **passkeys** (WebAuthn/FIDO2) and multiple **TOTP authenticators** (e.g. Google Authenticator, Authy). Both types are stored per-user and any single registered method is sufficient to satisfy an MFA challenge. Users can have any combination of passkeys and TOTP authenticators.

### Login Flow with MFA

When a user who has MFA enrolled completes primary authentication (email OTP or OAuth), the server does **not** immediately issue session tokens. Instead:

1. Primary auth succeeds and the server detects the user has MFA.
2. A `login_attempt_id` (UUID) is returned in the response body instead of tokens.
3. The client shows the MFA step, presenting passkey and/or TOTP options.
4. The client submits the `login_attempt_id` along with the MFA credential to one of the MFA verification endpoints.
5. On success, the server atomically consumes the login attempt and issues `dt`/`st` tokens.

### Login Attempt Storage

Pending MFA login state is stored in Valkey under the key `mfa-login-attempt:{uuid}` with a 5-minute TTL. The key is read-and-deleted atomically (Lua script) to prevent replay attacks.

Stored payload: `{ userId, deviceId, sessionId }`.

### MFA Endpoints

| Method | Route                                                   | Auth     | Description                                       |
| ------ | ------------------------------------------------------- | -------- | ------------------------------------------------- |
| GET    | `/api/v1/auth/mfa/status`                               | Required | Returns `has_mfa`, `passkeys_count`, `totp_count` |
| POST   | `/api/v1/auth/mfa/totp/verification`                    | None     | Verify TOTP code to complete MFA login            |
| POST   | `/api/v1/auth/mfa/passkeys/authentication/options`      | None     | Get WebAuthn challenge for MFA passkey login      |
| POST   | `/api/v1/auth/mfa/passkeys/authentication/verification` | None     | Verify passkey assertion to complete MFA login    |
| POST   | `/api/v1/auth/mfa/re-auth/email/tokens`                 | Required | Send email OTP for re-authentication              |
| POST   | `/api/v1/auth/mfa/re-auth/email/verification`           | Required | Verify email OTP; returns `re_auth_token`         |
| POST   | `/api/v1/auth/mfa/re-auth/totp/verification`            | Required | Verify TOTP code; returns `re_auth_token`         |
| POST   | `/api/v1/auth/mfa/re-auth/tokens/verification`          | Required | Verify `re_auth_token` before sensitive action    |

### TOTP

TOTP uses the **otpauth** library with the following parameters: SHA1 algorithm, 6-digit codes, 30-second period. The secret is a 20-byte random value encoded as base32 and stored as authenticated ciphertext. An `otpauth://` URI is generated for QR code display during setup and is only returned once (at setup time). See [backend/services/totp/README.md](../../../backend/services/totp/README.md).

| Method | Route                                  | Auth     | Description                                       |
| ------ | -------------------------------------- | -------- | ------------------------------------------------- |
| POST   | `/api/v1/auth/totp`                    | Required | Create a TOTP authenticator; returns secret + URI |
| POST   | `/api/v1/auth/totp/setup/verification` | Required | Verify first code to activate the authenticator   |
| GET    | `/api/v1/auth/totp`                    | Required | List verified TOTP authenticators                 |
| PATCH  | `/api/v1/auth/totp/:id`                | Required | Rename a TOTP authenticator                       |
| DELETE | `/api/v1/auth/totp/:id`                | Required | Delete a TOTP authenticator (re-auth if last)     |

### Re-Authentication for Sensitive Actions

Removing the last MFA method (passkey or TOTP authenticator) requires re-authentication to prove the user still controls an existing factor. The re-auth flow:

1. User initiates a sensitive action.
2. Server returns error code `MFA_REAUTH_REQUIRED`.
3. Client prompts the user to re-authenticate via email OTP or TOTP code.
4. Server issues a short-lived `re_auth_token` on success.
5. Client includes `re_auth_token` in the original request body.
6. Server verifies and atomically deletes the token before proceeding.

Re-auth tokens are stored in Valkey under `mfa-reauth:{userId}:{token}` with a 5-minute TTL. See [backend/services/mfa/README.md](../../../backend/services/mfa/README.md).
