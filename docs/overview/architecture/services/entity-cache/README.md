# Entities Cache

Source entrypoint: [backend/services/entity-cache/README.md](../../../../../backend/services/entity-cache/README.md)

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
[account-deletion lifecycle](../../../../requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md).

Election display reads are part of the entity-cache contract. Public API routes should fetch
elections with `get*ElectionByIdCachedBatch()` and return them as sidecar maps or singular sidecar
fields. Do not fetch elections individually from client-facing routes, and do not embed election
summaries or raw vote aggregate fields in entity VIEW payloads.

Entity-relation elections are the exception to `get*ElectionByIdCachedBatch()`. A relation UUID is
unique only within its relation table, so `getEntityRelationElectionByTargetCachedBatch()` takes
`{ entityRelationId, relationTable }` keys, and `invalidate.entity_relation_elections()` takes the
same keys. Never fetch, cache or invalidate an entity-relation election by bare UUID.

## Implementation Notes

- When using cache keys, always use the `.trim().toLowerCase()`ed version of the string
  - **Exception**: `urls_lookup` uses SHA-256 hashing via `normalizeUrlForCache` to preserve URL path case-sensitivity (paths like `/Path` and `/path` are distinct)
- When saving the cache key into Valkey, ensure the key is wrapped in a hash `{}`
- Invalidations must happen in the job queue if fetching invalidation keys is asynchronous
- Treat lookup caches separately from full entity payload caches; invalidate both when identifiers can change (username, slug, aliases, URL)

## Bloom Filter Warmup

On worker startup, `warmUpEntityCacheBloomFilters()` checks the live filter and its completeness
marker and requests a full rebuild when either is missing. A successful atomic rename publishes the
ready marker. Entity cache and availability reads trust a Bloom miss only while both keys exist;
an unavailable or incomplete filter sends reads to PostgreSQL and requests recovery.

Post-commit adds use `addOrThrow` and the existing live/building dual write. A failed add clears the
ready marker and requests a rebuild only when it removed that marker. The existing
[entity-listener reconciliation window](../entity-listener-reconciliation/README.md) repairs missed
adds from current source state, including username/slug changes, aliases and post-slug rows.
There are no scheduled full rebuilds; admins handle deletion compaction and capacity growth.

Tests own isolated Bloom and cache names. Recovery tests inject an add failure into that owned
filter, verify marker invalidation and database fallback, then verify completeness after a rebuild.
One ordering lane per filter and the stable rebuild job ID prevent concurrent rebuilds.

## Related

- [Entity Fetch Service](../entity-fetch/README.md)
- [Caching Strategy Overview](../../caching-strategy.md)
- [Bloom Filter Config Service](../bloom-filter-config/README.md)
