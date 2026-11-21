Review the authentication system. Find one concrete, bounded improvement that is safe to ship in one PR. If none qualifies, make no repository changes and report why.

Unit: one auth flow (login, session, MFA/passkey, or OAuth).

- Check JWT signing and verification, cookie/session lifetime, MFA/passkey, OAuth, credential/session replay, and account-takeover defenses against the auth requirements and implementation docs; look for needless database or Valkey load in session validation.
- Limit thresholds and limiter layers belong to [rate-limiting.md](rate-limiting.md); other application threats belong to [security.md](security.md).
- Prefer simplifying duplicated auth logic without weakening security.
