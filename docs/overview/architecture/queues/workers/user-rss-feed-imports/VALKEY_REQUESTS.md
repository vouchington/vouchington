# Valkey Requests — user-rss-feed-imports

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                                         | Client | Operation     | Calls / job |
| -------------------------------------------------------------------------------------------------- | ------ | ------------- | ----------- |
| `rss_feed_items` bloom filter `addOrThrow` (transitively via upsert-enqueues, per effective chunk) | cache  | BF.MADD (Lua) | O(items/5k) |

**Total per job:** O(items/5k) BF.MADD ops (cache); plus 1 rate-limiter + 1–2 cache fixed ops for import rows that create a new feed

## Notes

- Import jobs transitively trigger `rss_feed_items` bloom filter `addOrThrow` calls via the upsert enqueue path. The number of ops scales with the number of RSS feed items in the import.
- All calls land on `cacheValkeyClient`.
- `valkyries` clamps Bloom Lua chunks to 5k items per BF.MADD request.
- **Conditional:** Import rows that create a new RSS feed call `importSingleRssFeed` → `createSourceFromUrl` → `assertUrlAllowedByWebRisk()`, which adds 1 `invokeScript` op on `rateLimiterValkeyClient` (combined Web Risk minute + month limiter) plus 1–2 `cacheValkeyClient` ops (URL blocklist bloom `existsIfReady`, robots-txt cache `get`). New-feed import rows therefore have additional fixed Valkey ops beyond the item-level BF.MADD fan-out.
