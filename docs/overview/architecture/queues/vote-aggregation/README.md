# Vote aggregation queue

Source entrypoint: [backend/queues/vote-aggregation/README.md](../../../../../backend/queues/vote-aggregation/README.md)

`vote-aggregation` is a domain of the shared [`background`](../background/README.md) queue. Its jobs are named `vote-aggregation.<name>` (`processUpdateElectionVoteStats`, `processRecalculateUserVoteWeight`, `processRecalculateVoteWeightDispatcher`, `enqueueUserElectionUpdates`, `processVoteIntegrityCheck`, `processUpdateTopicRatingStats`, `processRefreshTopicMetrics`, `processRefreshPostMetrics`, `processRefreshUserMetrics`, `processReportIntegrityCheck`, and `backfill_report_integrity`). Payloads, deduplication IDs, retries, the daily `dailyVoteWeightRecalculation` schedule, and task priority 10 / dispatcher priority 100 are unchanged. Operators pause, retry, and read stats for the domain like any other background domain.

The domain uses one domain-wide group of 10, the old worker concurrency, so a backlog cannot take the shared worker's other slots. Election jobs name the lane they recompute (`topic`, `hostname`, `agent_moderation`, `post`, `entity_relation`, `rss_feed_item`, `user_vouch`) in their payload and in their deduplication id; the lane no longer carries an ordering key, because its 100 in flight never ordered anything.

Two fan-outs are paged. After a weight change, the user's votes are read one bounded page at a time (`election_fan_out_page_size` in `vote-weight-work-config`, default 500): the first page runs inline and a full page queues an `enqueueUserElectionUpdates` job carrying the (lane, id) cursor, whose job id is that cursor. `backfill_report_integrity` enqueues one page of entities (`backfill_batch_size` in `report-integrity-work-config`) in id order and continues from the last id. The vote-weight dispatcher already paged by user id.

The domain adds baseline 10 to the shared worker. It can also make busy domains share a backlog; no throughput or resource measurement is available yet. See the [active worker table](../reference-active-workers.md).
