# Valkey Requests — article-sync

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                             | Client             | Operation          | Calls / job                             |
| ------------------------------------------------------ | ------------------ | ------------------ | --------------------------------------- |
| entity-listeners (transitively via post create/update) | cache              | invokeScript (Lua) | 1                                       |
| `processArticleSync` → `articleSyncPubSub.publish`     | pubsub (dedicated) | PUBLISH            | 1 terminal status if `jobId` is present |

**Total per job:** 1 on shared singletons (cache); conditionally 1 dedicated pub/sub PUBLISH

## Notes

- Post create/update triggers `invalidate.posts(id)` = 1 `invokeScript` op on the cache client, transitively via entity-listeners invalidation.
- Admin-triggered syncs pass a `jobId` and publish a terminal completed/failed SSE status through
  `articleSyncPubSub`, which uses a dedicated `createChannelPubSub` client outside the shared
  singleton pool.
