# Valkey Requests — psql

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See [issue #4717](https://github.com/jonathanong/filaments/issues/4717).

| Call site (service / file) | Client | Operation | Calls / job |
| -------------------------- | ------ | --------- | ----------- |
| (none)                     | —      | —         | 0           |

**Total per job:** 0

## Notes

- No application-level Valkey calls in this worker. All processing is materialized view refreshes and other PSQL maintenance operations.
