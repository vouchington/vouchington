# Valkey Requests — topic-ratings

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file) | Client | Operation | Calls / job |
| -------------------------- | ------ | --------- | ----------- |
| (none)                     | —      | —         | 0           |

**Total per job:** 0

## Notes

- `updateTopicRatingStats` upserts changed rating stats to PSQL and then enqueues a `processRefreshTopicMetrics` job on the shared `vote-aggregation` queue. The `voteAggregation` worker runs that refresh in a separate job; the rating-stats job itself makes no application-level Valkey calls on the shared singleton clients.
