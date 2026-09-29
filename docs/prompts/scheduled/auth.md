Review the authentication system. Find one concrete, bounded improvement that is safe to ship in one PR. If none qualifies, make no repository changes and report why.

- Check JWT signing, verification, cookie/session lifetime, MFA/passkey, and OAuth flows against the auth requirements and implementation docs.
- Look for unnecessary database or Valkey load in login/session validation paths.
- Review credential/session replay, authentication abuse, and account-takeover defenses. Limit thresholds, limiter layers, and user/IP request budgets belong to [rate-limiting.md](rate-limiting.md); broader application threat surfaces belong to [security.md](security.md).
- Prefer fixes that simplify duplicated auth logic without weakening security.
- Add or tighten tests for the selected issue.
