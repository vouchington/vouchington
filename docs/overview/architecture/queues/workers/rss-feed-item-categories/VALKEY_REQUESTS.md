# Valkey Requests — rss-feed-item-categories

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file) | Client | Operation | Calls / job |
| -------------------------- | ------ | --------- | ----------- |
| (none)                     | —      | —         | 0           |

**Total per job:** 0

## Notes

- `processBackfillCategoriesForTopicAliases` reaches `backend/services/rss-feed-items/categories.mts`, whose backfill path is PSQL-only (reads, writes, and notification enqueues). No application-level Valkey calls are made on the shared singleton clients.
