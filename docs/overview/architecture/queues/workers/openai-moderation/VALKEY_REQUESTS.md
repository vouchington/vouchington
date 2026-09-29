# Valkey Requests — openai-moderation

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                 | Client             | Operation          | Calls / job                 |
| ---------------------------------------------------------- | ------------------ | ------------------ | --------------------------- |
| post-clearance path → `invalidate.posts`                   | cache              | invokeScript (Lua) | 1                           |
| `upsertImageOpenAIModeration` → `imageStatePubSub.publish` | pubsub (dedicated) | PUBLISH            | 1 ready/blocked image state |

**Total per job:** 0–1 on shared singletons (cache); 1 dedicated pub/sub PUBLISH for image jobs

## Notes

- On the post-clearance path, `invalidate.posts(id)` = 1 `invokeScript` op on the cache client.
- Image jobs publish the terminal ready/blocked upload state through `imageStatePubSub`, which uses
  a dedicated `createChannelPubSub` client outside the shared singleton pool.
- Post jobs where the post is flagged or no clearance decision is made have zero Valkey calls.
