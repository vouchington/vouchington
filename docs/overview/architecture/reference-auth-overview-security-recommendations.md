# Authentication Overview reference

[Back to Authentication Overview](auth-overview.md)

## Security Recommendations

### Passkeys are the strongest factor

Passkeys (WebAuthn/FIDO2) are phishing-resistant by design — credentials are scoped to the RP ID
and cannot be used on lookalike sites. Encourage users to enrol a passkey as their primary strong
factor. Discoverable passkey sign-in (`POST /api/v1/auth/passkeys/authentication/*`) uses
`userVerification: 'required'`, enforcing biometric or PIN verification and making the sign-in
inherently multi-factor (possession + inherence) without a separate challenge step.

### Email OTP + a social login on the same inbox is not true MFA

Both email OTP and an OAuth provider whose account uses the same email address reduce to "control of
one email inbox." Combining two such factors does not satisfy a true two-factor requirement. To
achieve genuine MFA, users must enrol at least one **possession factor** (passkey or TOTP
authenticator app). The MFA system is enforced on the backend only for users who have enrolled such
a factor — the `userHasMfa` check in `authentication-flows.mts` reads `user_passkeys` and
`user_totp_authenticators` (not social accounts or email addresses).

### Sign-in only for discoverable passkeys (no silent account creation)

The discoverable passkey sign-in flow (`verifyDiscoverablePasskeyAuthentication` in
`backend/services/passkeys/discoverable-flows.mts`) rejects unknown credentials with 401 and
**never** creates a new account. This prevents two classes of attack:

- **Silent account creation via stolen credentials** — an attacker who captures a credential
  response cannot create an account for a user who has not previously registered.
- **Credential enumeration** — 401 is returned regardless of whether the credential ID exists in
  the database or not, so the response does not reveal account membership.

Account creation still requires email OTP or OAuth (the existing sign-up flow).

### Existing protection layers

| Layer                          | Mechanism                                                           |
| ------------------------------ | ------------------------------------------------------------------- |
| Rate limiting                  | Per-IP, per-email, per-device, per-session via Valkey `RateLimiter` |
| Challenge replay               | Atomic Lua get-and-delete; 5-minute TTL on all challenges           |
| Counter cloning                | `updatePasskeyCounter` detects replayed authenticator clones        |
| JWT revocation                 | Valkey `jwt-revoked:{sid}` flag + staleness (`jwt-stale:{userId}`)  |
| Re-auth on destructive actions | `MFA_REAUTH_REQUIRED` code; `re_auth_token` (5-min Valkey TTL)      |
| Session scoping                | `dt`/`st` pairing enforced; `did` mismatch → session invalid        |

### TOTP

TOTP authenticator apps are supported as an additional MFA second factor alongside passkeys. TOTP
secrets are AES-GCM encrypted at rest (`@modules/token-secrets`). TOTP codes are time-bounded to
30 seconds and not stored after verification.

## Summary

```
Anonymous visitor
  → web proxy creates UUIDv7 dt/st (no uid, no enrichment)

User logs in
  → /api/v1/auth/* validates credentials
  → enriched claims loaded from DB (roles, membership, trust tier)
  → new dt/st issued with uid + enrichment (rol, mpl, tt, rca, sca)
  → cookies set on browser

Authenticated request (hot path)
  → web proxy validates dt/st via PATCH /api/v1/session
  → now < sca: return existing JWT as-is (0 refresh Valkey calls)
  → backend verifies JWT signature + dt/st pairing and rejects revoked sid per request

Authenticated request (warm path)
  → now >= sca: check Valkey for revocation and staleness (single Lua script)
  → if clean: re-issue with existing enrichment, fresh sca

Authenticated request (cold path)
  → now >= rca or stale flag set: reload user from DB (1 Valkey script + 1 DB)
  → if suspended: revoke + issue anon session
  → else: re-issue with fresh enrichment

User logs out
  → session revoked in Valkey (sid-scoped)
  → cookies cleared
```

## Related

- [Backend rules](../../../backend/CLAUDE.md) — service conventions and auth patterns
- [Cloudflare Worker rules](../../../cloudflare-worker/CLAUDE.md) — edge auth, cookie handling, and cache policy
- [Session JWT service](../../../backend/services/jwt-session/README.md) — JWT signing, verification, cookie management
- [Shared session JWT](../../../ts-shared/session-jwt/README.md) — Shared JWT types and helpers
- [App Attest](app-attestation.md) — how a device earns the `dc: 'attested'` claim and its 30-day session
