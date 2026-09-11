# Valkey Requests — urls-domains-blacklist

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See [issue #4717](https://github.com/jonathanong/filaments/issues/4717).

| Call site (service / file)                                                     | Client | Operation     | Calls / job   |
| ------------------------------------------------------------------------------ | ------ | ------------- | ------------- |
| `bloomFilter.addOrThrow(domains)` (per effective chunk, source-sync processor) | cache  | BF.MADD (Lua) | O(domains/5k) |
| `cacheValkeyClient.unlink(readyKey)` (source-sync processor)                   | cache  | unlink        | 1             |

**Total per job:** O(domains/5k) BF.MADD ops + 1 unlink (cache) per source-sync job; 0 for rebuild-enqueue jobs

## Notes

- The source-sync processor adds blacklisted domains to the bloom filter and then unlinks the ready-marker key before enqueuing a rebuild job. `valkyries` clamps Bloom Lua chunks to 5k items per BF.MADD request.
- Dispatcher jobs that only enqueue per-source jobs have zero Valkey calls.
- All calls land on `cacheValkeyClient`.
