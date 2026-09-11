# Passkey Registration (requires auth)

[Back to Sessions & Authentication API](README.md#passkey-registration-requires-auth)

### POST /api/v1/auth/passkeys/registration/options

Generates WebAuthn registration options, excluding existing passkeys. Stores challenge in Valkey with 5-minute TTL keyed by `passkey-reg:{userId}:{did}`.

### POST /api/v1/auth/passkeys/registration/verify

**Body:** `{ response: WebAuthnRegistrationResponse, name: string }`

Verifies registration response against stored challenge. Stores new passkey credential in `user_passkeys` table. Returns the created passkey (id, name, device_type, backed_up, created_at).

### POST /api/v1/auth/email-address/tokens

**Body:** `{ emailAddress: string, cf_turnstile_response?: string, dt?: string, st?: string }`

Sends a one-time login token to the given email address. Accepts `emailAddress` (camelCase) or
`email_address` (snake_case). The CAPTCHA token field accepts either `cf_turnstile_response`
(snake_case) or `cfTurnstileResponse` (camelCase). The token is required for the Turnstile path
(the backend uses Cloudflare's public always-pass test keys when
`CLOUDFLARE_TURNSTILE_SECRET_KEY` is unset in dev/test). Requests carrying valid Apple App Attest
headers skip Turnstile entirely — see [App Attest bypass](../../../services/captcha/README.md#app-attest-bypass)
in [`@services/captcha`](../../../services/captcha/README.md) (actionTag: `auth.email-address-tokens`).

**Success response:** `{ email_address: string }`

**Error responses:**

- `415 Invalid Content-Type` — body must be JSON
- `422 emailAddress is required`
- `422 CAPTCHA token is required` — token absent
- `400 CAPTCHA verification failed` — token rejected by Cloudflare Turnstile
- `429 Too Many Requests`

### POST /api/v1/auth/email-address/login

**Body:** `{ emailAddress: string, otp?: string, token?: string, dt?: string, st?: string }`

Rate-limited:

- Token issuance: 4 requests per minute per normalized email/IP/device/session, with `429` on the
  5th request to `POST /api/v1/auth/email-address/tokens`
- OTP verification: 9 attempts per minute per normalized email/IP/device/session, with `429` on
  the 10th request to `POST /api/v1/auth/email-address/login`

The route accepts `otp` or `token`, and reuses the existing `dt`/`st` pair from the request body
or cookies when present so the authenticated session stays attached to the same device/session
chain.

**Success response:**

```json
{
  "user": { "id": "<user_id>", "username": "<username>", "roles": [], "profile_image_id": null },
  "did": "<device_id>",
  "sid": "<session_id>",
  "uid": "<user_id>",
  "dt": { "token": "<device_token>", "payload": { "did": "<device_id>" } },
  "st": {
    "token": "<session_token>",
    "payload": { "did": "<device_id>", "sid": "<session_id>", "uid": "<user_id>" }
  },
  "session": { "did": "<device_id>", "sid": "<session_id>", "uid": "<user_id>" }
}
```

**Error responses:**

- `401 Invalid email address or one-time password`
- `422 emailAddress is required` / `422 otp is required`
- `429 Too Many Requests`

### GET /api/v1/auth/sessions

Returns the current user's active sessions as a standard list envelope. The current session is
marked with `is_current: true`. The route accepts `limit` (1–100, default 25) and an opaque
owner-scoped `after` cursor, orders by most-recent activity then UUIDv7 ID descending, and derives
`page_info` from `limit + 1` rows.

### DELETE /api/v1/auth/sessions/:id

Revokes one active session owned by the current user.

### POST /api/v1/auth/sessions/revocations

Revokes all active sessions owned by the current user.
