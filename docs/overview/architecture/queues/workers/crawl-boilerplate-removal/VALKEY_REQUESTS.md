# Valkey Requests — crawl-boilerplate-removal

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file) | Client | Operation | Calls / job |
| -------------------------- | ------ | --------- | ----------- |
| (none)                     | —      | —         | 0           |

**Total per job:** 0

## Notes

- No application-level Valkey calls in this worker. Processing is pure CPU DOM diffing of already-fetched HTML via `@jongleberry/vurst-html`, with all data sourced from and persisted to PSQL.
