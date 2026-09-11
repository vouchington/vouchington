# Valkey Requests — vote-weight

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See [issue #4717](https://github.com/jonathanong/filaments/issues/4717).

| Call site (service / file) | Client | Operation | Calls / job |
| -------------------------- | ------ | --------- | ----------- |
| (none)                     | —      | —         | 0           |

**Total per job:** 0

## Notes

- No application-level Valkey calls in this worker. User vote weight recalculation is done via PSQL with downstream queue enqueues only.
