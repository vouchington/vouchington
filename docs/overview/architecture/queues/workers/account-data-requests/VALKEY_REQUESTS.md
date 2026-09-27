# Valkey Requests — account-data-requests

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                           | Client             | Operation | Calls / job       |
| ---------------------------------------------------- | ------------------ | --------- | ----------------- |
| `processExportRequest` → `dataRequestPubSub.publish` | pubsub (dedicated) | PUBLISH   | 1 terminal status |
| `processCleanupExpiredExports`                       | —                  | —         | 0                 |

**Total per job:** 0 on shared singletons; 1 dedicated pub/sub PUBLISH for export-request jobs

## Notes

- Export requests publish a terminal `ready` or `failed` SSE status through `dataRequestPubSub`,
  which uses a dedicated `createChannelPubSub` client outside the shared singleton pool.
- Cleanup jobs have no application-level Valkey calls. They are PSQL/S3-based archive cleanup work.
