# Valkey Requests — topic-ratings

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file) | Client | Operation | Calls / job |
| -------------------------- | ------ | --------- | ----------- |
| (none)                     | —      | —         | 0           |

**Total per job:** 0

## Notes

- `updateTopicRatingStats` upserts rating stats to PSQL and then enqueues an `entity-metrics-cache-refresh` job. Cache invalidation (`invalidate.topic_metrics`, `invalidate.topics`) is performed by that separate worker — not by this worker in the same job. No application-level Valkey calls are made on the shared singleton clients in topic-ratings jobs.
