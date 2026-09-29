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
here and cross-link from `docs/overview/architecture/auth-overview.md` and `backend/AGENTS.md`.

## Reference index

- [CF Worker (edge — all responses)](reference-cf-worker-edge-all-responses.md)
- [Content Security Policy (CF Worker)](reference-content-security-policy-cf-worker.md)
- [Security Architecture reference](reference-security-authentication-sessions.md)
- [Security Architecture reference](reference-security-honeypot-fields.md)
- [Next.js CVE Tracking reference](reference-security-nextjs-cves-edge-mitigation-reference.md)
- [Next.js CVE Tracking reference](reference-security-nextjs-cves-patch-floor.md)
- [Security Architecture reference](reference-security-response-headers.md)
- [Security Architecture reference](reference-security-ssrf-protection.md)
