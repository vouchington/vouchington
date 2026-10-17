# Security

Security requirements and authentication QA.

## Documents

| File                                                                       | Description                                                                      |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Security](./SECURITY.md)                                                  | Security architecture orientation                                                |
| [CSRF Protection](./CSRF.md)                                               | Layered CSRF defenses; JSON-only content-type and origin-guard invariants        |
| [Auth](./AUTH.md)                                                          | Authentication UI requirements and flows                                         |
| [OAuth authorization server](./OAUTH-AUTHORIZATION-SERVER.md)              | OAuth 2.1 authorization-code, PKCE, consent, DCR, token, and retention contracts |
| [Observability scrubbing](./reference-security-observability-scrubbing.md) | Sentry query-string and fragment scrubbing                                       |

## Sync Rule

When security policies or authentication flows change, update the relevant doc
here and cross-link from `docs/overview/architecture/auth-overview.md` and `backend/AGENTS.md`.
