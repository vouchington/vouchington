# Server API helpers

- GET helpers are React-cached at module boundaries; avoid duplicate caching.
- Direct backend requests use `ServerRequest` or `buildWebClientInfoHeaders()`; per-call headers never override web client/platform/release identity.
- Nullable `get*` wrappers around `serverApi.get()` use `returnNullForMissingEntity()` (enforced by `server-entity-fetch-return-null.yml`). Default is 404-only; main-route 403s propagate before streaming.
- Optional/degraded panels may opt into `nullStatusCodes: [403, 404]` locally. Never catch-all to null; unrelated failures reach error boundaries.
- Non-null list/search helpers propagate errors unless explicitly wrapped by a route caller. Layouts await critical data before optional panels degrade under explicit status codes.
