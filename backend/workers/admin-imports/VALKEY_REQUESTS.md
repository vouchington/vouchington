# Valkey Requests — admin-imports

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                               | Client | Operation          | Calls / job          |
| -------------------------------------------------------- | ------ | ------------------ | -------------------- |
| entity-listeners (transitively via bulk entity creation) | cache  | invokeScript (Lua) | 1 per created entity |

**Total per job:** 1 op per created entity (cache)

## Notes

- Bulk entity creation triggers `invalidate.*` calls transitively through entity-listeners. Posts, topics, and users each batch related cache instances into 1 cache-client script call.
- Total scales with the number and type of entities created in a single import job.
- **Conditional:** Topic import rows that include aliases call `createTopicAliases()` directly (not via entity-listeners), which writes to the topics bloom filter (1 BF.MADD op, cache) and calls `invalidate.topics(...)` (1 op, cache). Alias-bearing topic rows add ~2 ops on top of the base entity invalidation.
