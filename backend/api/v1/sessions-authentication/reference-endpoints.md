# Endpoints

[Back to Sessions & Authentication API](README.md#endpoints)

| Method | Route                                                   | Authentication | Description                                           |
| ------ | ------------------------------------------------------- | -------------- | ----------------------------------------------------- |
| PATCH  | `/api/v1/session`                                       | Token-based    | Refresh/validate device+session tokens                |
| DELETE | `/api/v1/session`                                       | Token-based    | Invalidate session, issue anonymous                   |
| GET    | `/api/v1/auth/sessions`                                 | Required       | List active sessions                                  |
| DELETE | `/api/v1/auth/sessions/:id`                             | Required       | Revoke one active session                             |
| POST   | `/api/v1/auth/sessions/revocations`                     | Required       | Revoke all active sessions                            |
| POST   | `/api/v1/auth/passkeys/registration/options`            | Required       | Generate WebAuthn registration options                |
| POST   | `/api/v1/auth/passkeys/registration/verify`             | Required       | Verify registration response                          |
| GET    | `/api/v1/auth/passkeys`                                 | Required       | List current user's passkeys                          |
| PATCH  | `/api/v1/auth/passkeys/:id`                             | Required       | Rename a passkey                                      |
| DELETE | `/api/v1/auth/passkeys/:id`                             | Required       | Remove a passkey                                      |
| POST   | `/api/v1/auth/passkeys/authentication/options`          | None           | Get WebAuthn challenge for discoverable passkey login |
| POST   | `/api/v1/auth/passkeys/authentication/verify`           | None           | Verify discoverable passkey assertion; issues tokens  |
| GET    | `/api/v1/auth/mfa/status`                               | Required       | MFA status: `has_mfa`, `passkeys_count`, `totp_count` |
| POST   | `/api/v1/auth/mfa/totp/verification`                    | None           | Verify TOTP code to complete MFA login                |
| POST   | `/api/v1/auth/mfa/passkeys/authentication/options`      | None           | Get WebAuthn challenge for MFA passkey login          |
| POST   | `/api/v1/auth/mfa/passkeys/authentication/verification` | None           | Verify passkey assertion to complete MFA login        |
| POST   | `/api/v1/auth/mfa/re-auth/email/tokens`                 | Required       | Send email OTP for re-authentication                  |
| POST   | `/api/v1/auth/mfa/re-auth/email/verification`           | Required       | Verify email OTP; returns `re_auth_token`             |
| POST   | `/api/v1/auth/mfa/re-auth/totp/verification`            | Required       | Verify TOTP code; returns `re_auth_token`             |
| POST   | `/api/v1/auth/mfa/re-auth/tokens/verification`          | Required       | Verify `re_auth_token` before sensitive action        |
| POST   | `/api/v1/auth/totp`                                     | Required       | Create a TOTP authenticator; returns secret + URI     |
| POST   | `/api/v1/auth/totp/setup/verification`                  | Required       | Verify first code to activate the authenticator       |
| GET    | `/api/v1/auth/totp`                                     | Required       | List verified TOTP authenticators                     |
| PATCH  | `/api/v1/auth/totp/:id`                                 | Required       | Rename a TOTP authenticator                           |
| DELETE | `/api/v1/auth/totp/:id`                                 | Required       | Delete a TOTP authenticator (re-auth if last)         |
| POST   | `/api/v1/auth/bluesky/link`                             | Required       | Begin web/native Bluesky account authorization        |
| GET    | `/api/v1/auth/bluesky/callback`                         | Mode-dependent | Consume the provider callback                         |
| POST   | `/api/v1/auth/bluesky/link-completions`                 | Required       | Consume a native bearer+proof handoff                 |
| DELETE | `/api/v1/auth/bluesky/link`                             | Required       | Unlink the current user's Bluesky account             |

> Login/logout endpoints are in [`../auth/`](../auth/README.md).
