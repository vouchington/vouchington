# Security Checklist

[Back to Sessions & Authentication API](README.md#security-checklist)

When adding or changing a session, MFA, OAuth, passkey, TOTP, or email-auth endpoint:

- Add an exact `METHOD:/path` entry to `ROUTE_REGISTRY` in
  [`@services/route-rate-limits`](../../../services/route-rate-limits/README.md), unless the route is
  intentionally exempt. Auth verification, account linking, MFA, passkey, and credential-management
  routes should be `sensitive`.
- Use the shared route helpers (`requireAuth`, `getOptionalAuthAndRateLimit`,
  `requireAuthAndRateLimit`) unless the route has an unusual preamble that needs a direct
  `ctx.applyRouteRateLimit()` call.
- Keep externally visible auth failures generic. Do not reveal whether an email address, OAuth
  account, passkey credential, MFA method, or OTP was valid.
- Catch expected WebAuthn/OAuth/TOTP provider-library failures in services and convert them to the
  documented generic 4xx response.
- Add tests for registry coverage/category and verification failure behavior before changing the
  implementation.
