# OAuth authorization-server routes

These root-level protocol routes implement dynamic registration, authorization, token exchange,
and revocation. The authenticated `/api/v1/oauth/authorization-requests/*` routes supply the Voucha
consent page without exposing a pending request to another user.

## Routes

| Method | Path                                                 | Purpose                                              |
| ------ | ---------------------------------------------------- | ---------------------------------------------------- |
| GET    | `/authorize`                                         | Begin an authenticated S256 PKCE flow                |
| POST   | `/register`                                          | Dynamically register a public or confidential client |
| POST   | `/token`                                             | Exchange a code or rotate a refresh token            |
| POST   | `/revoke`                                            | Revoke an access token or refresh-token family       |
| GET    | `/api/v1/oauth/authorization-requests/:id`           | Read the signed-in user's pending consent            |
| POST   | `/api/v1/oauth/authorization-requests/:id/decisions` | Approve or deny that consent request                 |

`/token` and `/revoke` are the only form-encoded route exceptions. Dynamic registration and
consent decisions use JSON. Protocol errors use OAuth's `error` and `error_description` shape.

`/register`, `/token`, and `/revoke` are public machine-to-machine ingress. The Cloudflare Worker
strips browser session cookies from those exact POST routes and exempts them from staging Basic
Auth so their protocol-level validation remains authoritative. `/authorize` is intentionally a
browser route and retains the ordinary session and staging-auth boundaries.

## Performance

Each protocol mutation performs bounded indexed lookups and writes. Code exchange, refresh
rotation, consent decisions, and revocation use explicit transactions where atomic lifecycle
changes are required. Every route is `no-store` and bypasses edge caching.

## Related

- [Security requirements](../../../docs/requirements/security/OAUTH-AUTHORIZATION-SERVER.md)
- [Service implementation](../../services/oauth-authorization-server/README.md)
