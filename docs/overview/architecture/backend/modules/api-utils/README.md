# @modules/api-utils

Source entrypoint: [backend/modules/api-utils/README.md](../../../../../../backend/modules/api-utils/README.md)

HTTP authentication helpers for setting auth cookies and computing the expected request origin.

## Exports

### `COOKIE_OPTIONS`

Base cookie options object (`httpOnly: true`, `secure: isProduction`, `sameSite: 'lax'`, `path: '/'`) shared across all auth cookie writes.

### `setAuthenticationCookies(ctx, { dt, st })`

Sets the device token (`dt`) and session token (`st`) cookies on a Koa-like response context.

### `getExpectedOrigin(req)`

Constructs `protocol://host` for security-sensitive origin checks. Forwarded host/proto headers are used only when the request includes the configured Cloudflare Worker secret; otherwise the helper falls back to the backend `host` header. The result lowercases the protocol and removes default ports.

## Related

- Parent: [../README.md](../README.md)
- Auth overview: [../../../docs/overview/architecture/auth-overview.md](../../../auth-overview.md)
