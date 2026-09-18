# Valkey Requests — sitemaps

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Job path                                      | Client | Operation                                                                  | Calls / job |
| --------------------------------------------- | ------ | -------------------------------------------------------------------------- | ----------- |
| `processUpdatePostDaySitemap` (warm cache)    | cache  | `invokeScript(upsertTrackedDayRangeScript)`                                | 1           |
| `processUpdatePostDaySitemap` (cache miss)    | cache  | missing-range probe + fallback `invokeScript(upsertTrackedDayRangeScript)` | 2           |
| `processMonthlyBackfillArchiveDispatcher`     | cache  | `get`; cache miss adds `set`                                               | 1–2         |
| All other sitemap worker jobs and dispatchers | —      | —                                                                          | 0           |

**Total per job:** 0–2 (cache)

## Notes

- All calls land on `cacheValkeyClient` via the tracked-range-cache module.
- The post-day hot path uses one Lua request. The script returns both the previous and next range,
  so the worker can decide whether S3 persistence is needed without a preceding cache read.
- On a post-day cache miss, the first script call leaves the key unchanged. The service loads the
  durable S3/discovered fallback and supplies it to a second atomic script call.
