# Valkey Requests — bedrock-embeddings

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See [issue #4717](https://github.com/jonathanong/filaments/issues/4717).

| Call site (service / file)                                                                      | Client | Operation          | Calls / job   |
| ----------------------------------------------------------------------------------------------- | ------ | ------------------ | ------------- |
| `lookupExistingEmbedding` → `embeddingBloomFilter.mexistsIfReady(hashes)` (before creating)     | cache  | invokeScript (Lua) | 1             |
| `services/bedrock-embeddings/bloom-filter/bloom-filter.mts` → `addEmbeddingHashesToBloomFilter` | cache  | BF.MADD (Lua)      | O(hashes/10k) |

**Total per job:** 1 bloom read + O(hashes/10k) BF.MADD ops (cache)

## Notes

- After successfully storing embeddings, `addEmbeddingHashesToBloomFilter` calls `embeddingBloomFilter.addOrThrow(hexHashes)`, which issues one BF.MADD Lua op per chunk of 10 000 hashes on the cache client.
- For a typical single-entity job (1 embedding), this is 1 BF.MADD op.
- On error in `addOrThrow`, the ready-marker key is unlinked and a bloom-filter rebuild is enqueued (`cacheValkeyClient.unlink` + queue enqueue) — this is a rare error path.
