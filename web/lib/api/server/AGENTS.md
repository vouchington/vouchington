# Web Server API Helpers

Server-side GET helpers in this directory are `React.cache`-wrapped at the module boundary.

All direct server-to-backend requests must use `ServerRequest` or
`buildWebClientInfoHeaders()` so the backend receives invariant web client/platform/release
metadata. Per-call headers must not override that identity.

## Missing Entities

- Nullable `get*` helpers that call `serverApi.get()` must wrap that request with
  `returnNullForMissingEntity()`.
- `returnNullForMissingEntity()` defaults to 404-only. Do not treat 403 as missing for main route
  data; let it propagate so Next.js can render a 403 before streaming starts.
- Optional/degraded panels may pass `nullStatusCodes: [403, 404]` at the call site, but the opt-in
  must stay local to the optional UI.
- Do not use `.catch(() => null)` or other catch-all null handling. Only expected missing-entity
  statuses should become `null`; unrelated errors must propagate to error boundaries.
- Top-level list/search helpers that intentionally return non-null response bodies should let errors
  propagate unless a route-level caller explicitly wraps them.
- Route layouts await critical data before starting optional panels, which may degrade locally with
  explicit expected status codes.

This is enforced by `ast-grep-rules/server-entity-fetch-return-null.yml`.
