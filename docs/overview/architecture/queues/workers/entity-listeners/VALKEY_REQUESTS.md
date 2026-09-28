# Valkey Requests — entity-listeners

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                  | Client | Operation          | Calls / job        |
| --------------------------------------------------------------------------- | ------ | ------------------ | ------------------ |
| `posts` processor → `invalidate.posts(id)` (create/update/delete)           | cache  | invokeScript (Lua) | 1                  |
| `posts` processor → `invalidate.posts(id)` per archived duplicate (fan-out) | cache  | invokeScript (Lua) | 1 × archived count |
| `topics` processor → `invalidate.topics(id)`                                | cache  | invokeScript (Lua) | 1                  |
| `users` processor → `invalidate.users(id)` (×4 call sites)                  | cache  | invokeScript (Lua) | 1                  |

**Total per job:** 1 fixed op (cache) for the primary entity; plus 1 × archived_count fan-out ops for posts with archived duplicates

## Notes

- This is the central invalidation hub. All calls land on the `cacheValkeyClient` singleton.
- `invalidate.posts`, `invalidate.topics`, and `invalidate.users` each batch all related cache instances into one cache-client script call.
- The `posts` processor only calls `invalidate.posts`; user-cache invalidations are confined to `processors/users.mts` and do not run for post-created/updated/deleted jobs.
- Fan-out for archived duplicates is unbounded per job and can dominate Valkey pressure on high-traffic posts.
- **Conditional:** `post_created` jobs for non-official creators call `autoSubscribePostCreator` → `bookmarkEntity()` → `addBookmarkBloomEntries()`, which issues 1 BF.MADD op on `cacheValkeyClient` for each chunk of bookmark hashes added to the bookmark bloom filter. Adds O(bookmarks/10k) ops on top of the fixed post-invalidation ops.
