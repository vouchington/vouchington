# Entities Cache

## Purpose

The main purpose of this caching is because querying against views tends to be slow for PostgreSQL as it makes the queries complex and returns too much data.
This separation allows PostgreSQL queries to be simple ID lookups, separating lookups from data retrieval.

The caching system is optimized, including:

- Batch fetches for lists
- Re-fetching asynchronously when TTLs are about to expire
- Dedicated lookup caches for string -> UUID resolution (`*_lookup`)

All public-facing APIs should fetch entities through this cache system and all internal lookup APIs should primarily only return IDs and cursors.

User payload and username lookup cache hits are rechecked against the writer database's active-user
predicate before they are returned. Deletion invalidation reduces residue, but this read fence is
the privacy guarantee when an invalidation is delayed or lost; see the
[account-deletion lifecycle](../../../docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md).

Election display reads are part of the entity-cache contract. Public API routes should fetch
elections with `get*ElectionByIdCachedBatch()` and return them as sidecar maps or singular sidecar
fields. Do not fetch elections individually from client-facing routes, and do not embed election
summaries or raw vote aggregate fields in entity VIEW payloads.

## Implementation Notes

- When using cache keys, always use the `.trim().toLowerCase()`ed version of the string
  - **Exception**: `urls_lookup` uses SHA-256 hashing via `normalizeUrlForCache` to preserve URL path case-sensitivity (paths like `/Path` and `/path` are distinct)
- When saving the cache key into Valkey, ensure the key is wrapped in a hash `{}`
- Invalidations must happen in the job queue if fetching invalidation keys is asynchronous
- Treat lookup caches separately from full entity payload caches; invalidate both when identifiers can change (username, slug, aliases, URL)

## Bloom Filter Warmup

On worker startup, `warmUpEntityCacheBloomFilters()` checks whether each live entity-cache
bloom filter key exists and enqueues a backfill job only for missing filters. That's it — it
does **not** call `ensureExists()`.

The live filter key (e.g. `bloom-filter:posts`) only appears in Valkey after
`rebuildFromStream` completes its atomic `RENAME buildingKey → liveKey`. During the backfill
window the key is absent, and the Lua get-with-TTL scripts treat an absent bloom filter key
as "inconclusive" and fall back to MGET, so cache reads hit the DB normally — no 404s for
real entities.

Write-time population uses the dual-write pattern in `bloom-filter-add.lua`, which adds items
to both the live key and the building key (if a rebuild is in progress). If neither key exists
yet, `add()` is a no-op to prevent `BF.MADD` from auto-creating an under-provisioned filter.

Tests that assert scheduled write-time entity-cache bloom population should use an isolated
`ValkeyBloomFilter` name and a bounded wait instead of the shared `entityCacheBloomFilters` live
keys. The shared keys are global Valkey state and other parallel backend test files may rebuild or
delete them.

Backfill jobs use one queue ordering lane per entity type so startup, manual, and scheduled
backfills cannot rebuild the same physical filter concurrently.

## Related

- [Entity Fetch Service](../entity-fetch/README.md)
- [Caching Strategy Overview](../../../docs/overview/architecture/caching-strategy.md)
- [Bloom Filter Config Service](../bloom-filter-config/README.md)
