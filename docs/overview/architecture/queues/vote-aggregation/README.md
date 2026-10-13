# Vote aggregation queue

Source entrypoint: [backend/queues/vote-aggregation/README.md](../../../../../backend/queues/vote-aggregation/README.md)

The ranked-priority `vote-aggregation` queue combines election vote-stat updates, vote-weight recalculation and dispatch, vote-integrity checks, topic rating updates, entity-metric cache refreshes, and report-integrity checks and backfill. Existing job names, payloads, deduplication IDs, retries, schedules, and priorities remain. Election jobs still carry and validate their ordering key, with per-key concurrency 100.

A single IO worker has baseline concurrency 10 instead of six independent baseline-5 workers. This bounds simultaneous database work at 10 while preserving per-key election ordering. It can also make busy domains share a backlog; no throughput or resource measurement is available yet. See the [active worker table](../reference-active-workers.md).
