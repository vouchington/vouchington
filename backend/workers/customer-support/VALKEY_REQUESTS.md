# Valkey Requests — customer-support

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                             | Client | Operation                | Calls / job |
| -------------------------------------------------------------------------------------- | ------ | ------------------------ | ----------- |
| `services/bedrock-embeddings/bloom-filter` → `embeddingBloomFilter.addOrThrow`         | cache  | BF.MADD (Lua)            | 1+          |
| `services/bedrock-embeddings` → `mexistsIfReady` / ValkeyCache get (embedding lookups) | cache  | invokeScript (Lua) / get | 1–2         |

**Total per job:** 1–3 ops (cache), scales with embeddings processed

## Notes

- The `customer-support` job runs `generateSupportResponse` via `@agents/customer-support`, which reads and writes embedding hashes via the bloom filter (`addOrThrow` = 1+ BF.MADD ops) and checks embedding existence (`mexistsIfReady` or `ValkeyCache.get` = 1–2 ops), all on the cache client.
- All calls land on `cacheValkeyClient`.
