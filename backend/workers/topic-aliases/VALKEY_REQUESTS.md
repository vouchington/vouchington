# Valkey Requests — topic-aliases

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                          | Client | Operation          | Calls / job         |
| ----------------------------------------------------------------------------------- | ------ | ------------------ | ------------------- |
| `topics` bloom filter → `bloomFilter.add(aliasArray)` (per effective chunk)         | cache  | BF.MADD (Lua)      | O(aliases/5k)       |
| `invalidate.topics([...affectedTopicIds, ...affectedAliases])` (per affected topic) | cache  | invokeScript (Lua) | 1 × affected topics |

**Total per job:** O(aliases/5k) BF.MADD ops + 1 × (affected topics) invokeScript ops (cache)

## Notes

- The alias array is added to the topics bloom filter. `valkyries` clamps Bloom Lua chunks to 5k items per BF.MADD request.
- Each affected topic/alias triggers `invalidate.topics` = 1 `invokeScript` op that batches topics, topics_with_redirect, and topics_lookup invalidation.
- All calls land on `cacheValkeyClient`.
