# @services/bloom-filter-maintenance

Startup hygiene for bloom filter rebuilds: self-expires orphaned `bloom-filter:*:building` keys
and bookmark bloom filter live keys left without a TTL.

## Why this exists

`ValkeyBloomFilter.rebuildFromStream()` (in `valkyries`) builds a filter under a
`bloom-filter:<name>:building` key, then atomically `RENAME`s it over the live
`bloom-filter:<name>` key. If a rebuild dies mid-flight (e.g. the node is wedged at Valkey
`maxmemory` under `noeviction`, so `BF.RESERVE`/`BF.MADD` start failing), the `:building` key it
left behind has no TTL and would otherwise sit until the next scheduled rebuild for that exact
filter succeeds.

The bookmark bloom filter backfill (`backend/services/bookmarks/bloom-filter.mts`) has the same
kind of gap on the live key itself: it RENAMEs the finished build into place, then sets the live
key's TTL in a separate `Batch`. If the process dies between those two steps, the live key is left
with no TTL, permanently, on a shared `noeviction` instance.

This package exists solely so `@backend/worker-runtime` — which is not on the
`dependency-cruiser` allowlist for importing `@data-stores/*` directly (see
`backend/dependency-cruiser-rules/data-stores-primary.cjs`) — has a `@services/*`-layer entry
point to call these sweeps from `setup()`.

## Key exports

- `expireOrphanedBloomFilterBuildingKeys(client?)` — re-exported from
  [`@data-stores/valkey`](../../data-stores/valkey/README.md), which supplies the Bloom-specific
  key pattern and delegates the generic SCAN/`EXPIRE ... NX` sweep to `valkyries`. Safe to call
  redundantly or concurrently; never disturbs a `:building` key that already carries a TTL.
- `sweepBookmarkBloomFiltersMissingTtl()` — binds `BOOKMARK_BLOOM_FILTER_TTL_SECONDS`
  (`@services/bookmarks/bloom-filter-utils`) to
  `expireBookmarkBloomFiltersMissingTtl` in [`@data-stores/valkey`](../../data-stores/valkey/README.md).
  Same `EXPIRE ... NX` safety as above; its Buffer-safe Bloom predicate excludes `:building` keys
  so it never races the sweep above.

## Related

- Implementation: [`../../data-stores/valkey/bloom-filter.mts`](../../data-stores/valkey/bloom-filter.mts)
- Bloom filters system: [`../../queues/bloom-filters/README.md`](../../queues/bloom-filters/README.md)
- Bloom filter feature flags: [`../bloom-filter-config/README.md`](../bloom-filter-config/README.md)
