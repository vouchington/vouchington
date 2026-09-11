# Valkey Requests — post-mentions

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See [issue #4717](https://github.com/jonathanong/filaments/issues/4717).

| Call site (service / file)      | Client | Operation | Calls / job |
| ------------------------------- | ------ | --------- | ----------- |
| `getUserPublicByAnyCachedBatch` | cache  | MGET      | 1           |
| `getTopicByAnyCachedBatch`      | cache  | MGET      | 1           |
| `getPostByAnyCachedBatch`       | cache  | MGET      | 1           |

| `getRootPostsForCommentMentions` → `getPostByAnyCachedBatch(rootIds)` (comment mentions only) | cache | MGET | 1 |

**Total per job:** 3 (cache); 4 (cache) when post mentions include comments

## Notes

- Each of the three `*ByAnyCachedBatch` calls issues a single MGET command regardless of how many mention entities are being resolved. The MGET internally fetches all keys in one round-trip.
- When a post mention resolves to a comment, `getRootPostsForCommentMentions` issues a fourth `getPostByAnyCachedBatch` call to fetch root posts.
- All calls land on `cacheValkeyClient`.
