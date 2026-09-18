# Valkey Requests — entity-metrics-cache-refresh

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                                                                        | Client | Operation   | Calls / job |
| --------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | ----------- |
| `refresh.topic_metrics` / `refresh.post_metrics` / `refresh.user_metrics` → `exec(Batch)` (one per job, depending on entity type) | cache  | exec(Batch) | 1           |

**Total per job:** 1 (cache)

## Notes

- Each job dispatches exactly one refresh call (`refreshById`/`exec(Batch)`) on the cache client, depending on the entity type in the job payload.
- `refresh.topic_metrics`, `refresh.post_metrics`, and `refresh.user_metrics` each issue 1 `exec(Batch)` op on `cacheValkeyClient`.
