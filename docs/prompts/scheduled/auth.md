Review the authentication system. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check JWT signing, verification, cookie/session lifetime, MFA/passkey, and OAuth flows against the auth requirements and implementation docs.
- Look for unnecessary database or Valkey load in login/session validation paths.
- Review bot, abuse, replay, rate-limit, and account takeover defenses.
- Prefer fixes that simplify duplicated auth logic without weakening security.
- Add or tighten tests for the selected issue.
