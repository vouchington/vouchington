# Discoverable Passkey Sign-In (no auth required)

[Back to Sessions & Authentication API](README.md#discoverable-passkey-sign-in-no-auth-required)

These endpoints let a user sign in with a passkey without providing an email address first. The
credential is resolved from the authenticator's assertion response and must match an existing
account. An unrecognised credential returns 401 — it **never** creates a new user (sign-in only,
not sign-up).

`userVerification: 'required'` is enforced, making a successful discoverable sign-in inherently
multi-factor (possession factor + biometric/PIN). No separate MFA step is needed.

### POST /api/v1/auth/passkeys/authentication/options

Generates a WebAuthn authentication challenge for discoverable login:

1. Reads the device ID from the `dt` cookie.
2. Calls `generateAuthenticationOptions` with `allowCredentials: []` (discoverable) and
   `userVerification: 'required'`.
3. Stores the challenge in Valkey under `passkey-discoverable-auth:{did}` with 5-minute TTL.

**Response:** `{ options: PasskeyAuthenticationOptions }`. The service preserves the JSON-safe
WebAuthn option fields and omits binary PRF extension inputs before the API boundary.

### POST /api/v1/auth/passkeys/authentication/verify

**Body:** `{ response: AuthenticationResponseJSON }`

Verifies a client's discoverable passkey assertion:

1. Retrieves and atomically deletes the challenge from Valkey.
2. Resolves `user_id` from the credential ID via `getPasskeyByCredentialId`. Returns 401 if not
   found — never provisions a new account.
3. Calls `verifyAuthenticationResponse`. Returns 401 if verification fails.
4. Updates the passkey's signature counter.
5. Checks user suspension. Issues `dt`/`st` JWT tokens.

**Success response:**

```json
{
  "user": { "id": "<user_id>" },
  "dt": { "token": "<device_token>", "payload": { "did": "<device_id>" } },
  "st": {
    "token": "<session_token>",
    "payload": { "did": "<did>", "sid": "<sid>", "uid": "<uid>" }
  },
  "session": { "did": "<did>", "sid": "<sid>", "uid": "<uid>" }
}
```

Sets `dt` and `st` HTTP-only cookies on success.

**Error responses:**

- `400` — challenge expired or not found (options not requested first)
- `400` — invalid response (missing `id` field)
- `401` — passkey sign-in failed (generic; covers both unknown credentials and failed verification to prevent enumeration)
- `403` — account suspended
- `415` — body must be JSON
- `422 response is required`
