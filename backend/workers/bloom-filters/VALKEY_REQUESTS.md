# Valkey Requests — bloom-filters

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See [issue #4717](https://github.com/jonathanong/filaments/issues/4717).

| Call site (service / file)                                                | Client | Operation          | Calls / job                   |
| ------------------------------------------------------------------------- | ------ | ------------------ | ----------------------------- |
| `ValkeyBloomFilter.rebuildFromStream` / `addStream` (per effective chunk) | cache  | BF.MADD (Lua)      | O(rows/5k) per filter rebuilt |
| `ValkeyBloomFilter.rebuildFromStream` atomic rename                       | cache  | invokeScript (Lua) | 1 per filter rebuilt          |
| ready-marker set/unlink after rebuild                                     | cache  | set / unlink       | 1–2 per filter rebuilt        |

**Total per job:** O(rows/5k) × (filters rebuilt) BF.MADD ops + ~2 fixed ops per filter (cache). This worker runs with `batch: { size: 10 }`, so up to 10 jobs fire per process tick.

## Notes

- This is the highest-pressure Valkey worker. Each job rebuilds one or more bloom filters by streaming all rows from DB and issuing BF.MADD Lua scripts. `valkyries` clamps Bloom Lua chunks to 5k items per request even when a caller's DB stream batch is larger.
- After streaming, an atomic RENAME script is invoked to swap the building key to the live key, followed by a `set` for the ready-marker and optionally `unlink` of the old key.
- With `batch: { size: 10 }`, 10 concurrent jobs may be running simultaneously, each issuing O(rows/5k) ops. For the url-blocklist filter (~5M domains), that is ~1000 BF.MADD ops per job × 10 jobs = ~10 000 ops per tick.
- All calls land on the `bloomValkeyClient` singleton (a dedicated `GlideClient` with its own 1000-inflight budget, separate from `cacheValkeyClient`).
