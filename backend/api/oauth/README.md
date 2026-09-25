# OAuth authorization-server routes

These root-level protocol routes implement dynamic registration, authorization, token exchange,
revocation, and the RFC 8414 and RFC 9728 discovery documents. The authenticated
`/api/v1/oauth/authorization-requests/*` routes supply the Voucha consent page without exposing a
pending request to another user.

## Routes

| Method | Path                                                     | Purpose                                              |
| ------ | -------------------------------------------------------- | ---------------------------------------------------- |
| GET    | `/authorize`                                             | Begin an authenticated S256 PKCE flow                |
| POST   | `/register`                                              | Dynamically register a public or confidential client |
| POST   | `/token`                                                 | Exchange a code or rotate a refresh token            |
| POST   | `/revoke`                                                | Revoke an access token or refresh-token family       |
| GET    | `/.well-known/oauth-authorization-server`                | RFC 8414 authorization-server metadata               |
| GET    | `/.well-known/oauth-protected-resource/api/v1/mcp`       | RFC 9728 metadata for the user MCP resource          |
| GET    | `/.well-known/oauth-protected-resource/api/v1/admin/mcp` | RFC 9728 metadata for the admin MCP resource         |
| GET    | `/api/v1/oauth/authorization-requests/:id`               | Read the signed-in user's pending consent            |
| POST   | `/api/v1/oauth/authorization-requests/:id/decisions`     | Approve or deny that consent request                 |

`/token` and `/revoke` are the only form-encoded route exceptions. Dynamic registration and
consent decisions use JSON. Protocol errors use OAuth's `error` and `error_description` shape.
Authorization redirects, including errors, carry the RFC 9207 `iss` parameter, and `/token`
rejects a `resource` that does not name the grant's bound resource as `invalid_target`.

`/register`, `/token`, and `/revoke` are public machine-to-machine ingress and do not use browser
session credentials. Edge routing and staging-auth policy are owned by the browser/edge integration
layer above this service. `/authorize` is intentionally a browser route and retains the ordinary
session boundary.

## Performance

Each protocol mutation performs bounded indexed lookups and writes. Code exchange, refresh
rotation, consent decisions, and revocation use explicit transactions where atomic lifecycle
changes are required. Every protocol and consent route is `no-store` and bypasses edge caching.
The discovery documents are built from configuration without I/O and are anonymous and publicly
cacheable.

## Related

- [Service implementation](../../services/oauth-authorization-server/README.md)
