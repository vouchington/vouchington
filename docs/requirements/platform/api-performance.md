# API Performance Requirements

Performance conventions for backend API routes. Cache lifetimes, round-trip counts and limits are
read from code and configuration.

## Principles

- **Count sequential round trips, not calls.** Parallel calls inside `streamJsonObject` or
  `Promise.all` count as one. Keep the serial depth of an endpoint small, and let test diagnostics
  show repeats and depth.
- **Cache by audience.** Logged-out, non-personalized GETs set `Cache-Control` for the CDN. Entity
  reads go through the Valkey entity-cache getters, and logged-out list or search uses the cached
  search wrappers. Authenticated users get fresh personalized results.
- **List endpoints hydrate in batches.** Use the `*CachedBatch()` or `*Batch()` functions; never
  call a single-entity lookup in a loop.
- **Get-or-create on identity-backed lookup tables reads first.** Read existing rows (replica lag
  permitting) and write only what is missing. When the primary must reconcile, use `MERGE` or an
  advisory-locked re-check rather than conflict-heavy `INSERT ... ON CONFLICT`, because
  existing-row conflicts still advance identity sequences.
- **No N+1.** When `no-await-in-loop` flags a backend loop, prefer one set-based operation, bulk
  request, `addBulk`, paginator, or stream. Use bounded concurrency only for independent
  iterations where the limit is part of the backpressure contract. Keep sequential execution only
  when the next iteration depends on retry state, a cursor, transaction-local state, or stream
  order. A retained suppression targets only the awaited statement and states the ordering
  invariant. Never parallelize operations that share a transaction client or cursor.

## Related

- [API design decisions](../api/README.md)
- [backend/api/AGENTS.md](../../../backend/api/AGENTS.md)
- [Valkey caching](../../development/valkey/README.md)
- [Rate limiting](../../overview/architecture/rate-limiting.md)
