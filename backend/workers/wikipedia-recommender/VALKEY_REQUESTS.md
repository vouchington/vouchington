# Valkey Requests — wikipedia-recommender

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                        | Client | Operation     | Calls / job |
| --------------------------------------------------------------------------------- | ------ | ------------- | ----------- |
| `entityCacheBloomFilters.posts.add(...)` on recommendation creation (conditional) | cache  | BF.MADD (Lua) | 0–1         |

**Total per job:** 0–1 (cache, conditional on recommendation creation)

## Notes

- The dispatcher queries recent post IDs from PSQL and enqueues batches.
- **Conditional:** Jobs that create a new recommendation call `recommendTopicsForContent` → `createRecommendation` → `entityCacheBloomFilters.posts.add(...)` = 1 BF.MADD op on `cacheValkeyClient`.
