# Valkey Requests — spam-detection

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See [issue #4717](https://github.com/jonathanong/filaments/issues/4717).

| Call site (service / file)          | Client | Operation          | Calls / job |
| ----------------------------------- | ------ | ------------------ | ----------- |
| clearance gate → `invalidate.posts` | cache  | invokeScript (Lua) | 1           |

**Total per job:** 1 (cache)

## Notes

- On the clearance gate path, `invalidate.posts(id)` = 1 `invokeScript` op on the cache client.
- Jobs that do not result in clearance have zero Valkey calls.
