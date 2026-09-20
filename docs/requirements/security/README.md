# Security

Authentication UI, security requirements, and CVE tracking.

## Documents

| File                                                                       | Description                                                                       |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [Security](./SECURITY.md)                                                  | Security requirements, policies, and threat model                                 |
| [CSRF Protection](./CSRF.md)                                               | Layered CSRF defenses; JSON-only content-type and origin-guard invariants         |
| [Next.js CVE Tracking](./SECURITY-NEXTJS-CVES.md)                          | Patch floor, per-CVE status, and edge mitigation reference for Next.js advisories |
| [Auth](./AUTH.md)                                                          | Authentication UI requirements and flows                                          |
| [OAuth authorization server](./OAUTH-AUTHORIZATION-SERVER.md)              | OAuth 2.1 authorization-code, PKCE, consent, DCR, token, and retention contracts  |
| [Observability scrubbing](./reference-security-observability-scrubbing.md) | Sentry query-string and fragment scrubbing                                        |

## Sync Rule

When security policies, authentication flows, or CVE mitigations change, update the relevant doc
here and cross-link from `docs/overview/architecture/auth-overview.md` and `backend/CLAUDE.md`.
