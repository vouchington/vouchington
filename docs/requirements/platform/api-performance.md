# API Performance Requirements

Performance conventions for all backend API routes.

## Caching Architecture

| Layer              | Mechanism                                                                     | Scope                  | TTL                         |
| ------------------ | ----------------------------------------------------------------------------- | ---------------------- | --------------------------- |
| HTTP Cache         | `Cache-Control` headers → Cloudflare CDN                                      | Logged-out public GETs | Short (60s) or Long (3600s) |
| Entity Cache       | Valkey `*CachedBatch()` / `*Cached()` via `@services/entity-cache`            | All entity reads       | Variable per entity type    |
| Search Cache       | Valkey `*Cached()` search wrappers via `@services/entity-cache/search-caches` | Logged-out list/search | Variable                    |
| Materialized Views | PostgreSQL, refreshed on schedule                                             | Rankings, aggregates   | Refresh interval            |

## Round Trip Budget

Round trips are counted as sequential data-store call groups. Parallel calls within
`streamJsonObject` or `Promise.all` count as 1 round trip.

| Endpoint type             | Budget | Example                                                           |
| ------------------------- | ------ | ----------------------------------------------------------------- |
| Single entity GET         | 2-3    | Entity lookup → parallel streaming (metrics, election, bookmarks) |
| List/search GET           | 2-3    | Search IDs → parallel batch hydration                             |
| Complex feed GET          | 3-5    | Feed query → story hydration → parallel batch loads               |
| Write (POST/PATCH/DELETE) | 1-3    | Auth check → business logic → write                               |

## Lookup Writes

Hot get-or-create flows for identity-backed lookup tables should use read-then-write: read existing
rows through `read()` when replica lag is acceptable, then write only missing values. If the primary
must reconcile create/update behavior, use PostgreSQL 18 `MERGE` or an advisory-locked primary
re-check instead of conflict-heavy `INSERT ... ON CONFLICT`, because existing-row conflicts still
advance identity sequences.

## Batch Operation Requirements

- **List endpoints must use batch functions** (`*CachedBatch()`, `*Batch()`) for entity hydration.
  Never call single-entity lookups in a loop.
  (prevents client-side filtering of DB results).

## Caching Requirements

- **Entity reads**: Use `@services/entity-cache` getters (`getPostByAnyCached`,
  `getPostByAnyCachedBatch`, etc.) backed by Valkey.
- **Logged-out search**: Use `*Cached()` search wrappers for anonymous list/search endpoints.
  Authenticated users get fresh personalized results.
- **HTTP headers**: Set `Cache-Control: public, max-age=...` on public, non-personalized GET
  responses for CDN caching. Use `HTTP_CACHE_SHORT_MAX_AGE_SECONDS` or
  `HTTP_CACHE_LONG_MAX_AGE_SECONDS` from `@voucha/config`.

## Performance Documentation

Every API README under `backend/api/v1/**/README.md` must retain a `## Performance` heading.
When the heading links a route-local `reference-performance.md` leaf, that leaf owns the canonical
table and details; otherwise the README's inline section is canonical.

### Table format

Use this format in an extracted `reference-performance.md` leaf, or directly beneath the inline
`## Performance` heading when the route has no linked leaf.

```markdown
| Endpoint             | Round Trips | Caching                                     | Notes              |
| -------------------- | ----------- | ------------------------------------------- | ------------------ |
| GET /api/v1/example  | 2           | Search: anon Valkey; Entities: Valkey batch | Parallel streaming |
| POST /api/v1/example | 1           | None (write)                                | Single create call |
```

### Column definitions

- **Round Trips**: Count of sequential data-store call groups. Parallel calls within
  `streamJsonObject` or `Promise.all` count as 1.
- **Caching**: Which layers cache — `Valkey batch` (entity cache), `Valkey search` (anon search
  cache), `HTTP` (Cache-Control for CDN), or `None`.
- **Notes**: Batch vs single, streaming, conditional auth-only fields, etc.

## N+1 Prevention

The codebase should have no N+1 query problems. Prevention is enforced where listed as a concrete
tool below; the remaining policies are tracked in the static-analysis migration milestone.

When `no-await-in-loop` reports a backend loop, use this decision order:

1. Prefer one set-based database operation, provider bulk request, queue `addBulk`, paginator, or
   stream/async-iterator API.
2. Use bounded concurrency only when iterations are independent and the local concurrency limit is
   part of the operation's backpressure contract.
3. Retain sequential execution only when the next iteration depends on retry state, a cursor or
   continuation token, transaction-local state, stream/generator order, or explicit backpressure.

Any retained suppression must target only the awaited statement and state the ordering invariant.
Do not use file-wide or loop-wide suppressions, and do not parallelize operations that share a
transaction client, mutate a shared cursor, or depend on provider retry ordering.

| Policy                    | Status                                                |
| ------------------------- | ----------------------------------------------------- |
| oxlint `no-await-in-loop` | Enforced by oxlint for `await` in loops               |
| `services-sql-call-limit` | Migration issue tracks automated replacement coverage |
| `pool-single-query`       | Migration issue tracks automated replacement coverage |
| `select-star-queries`     | Migration issue tracks automated replacement coverage |

## Related

- API route reference: [backend/api/README.md](../../../backend/api/README.md)
- Backend workspace rules: [backend/CLAUDE.md](../../../backend/CLAUDE.md)
- API modification rules: [backend/api/CLAUDE.md](../../../backend/api/CLAUDE.md)
- Valkey caching: [backend/data-stores/valkey/README.md](../../../backend/data-stores/valkey/README.md)
- Rate limiting: [docs/overview/architecture/rate-limiting.md](../../overview/architecture/rate-limiting.md)
