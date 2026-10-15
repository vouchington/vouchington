# Vote aggregation queue

`vote-aggregation` is a domain of the shared `background` queue (`vote-aggregation.<name>` job names). It carries election tallies, vote-weight and vote-integrity work, topic rating updates, entity metric cache refreshes, and report integrity checks. Its jobs are defined in `backend/queues/background/enqueues/vote-aggregation-jobs.mts`; the domain-specific enqueues in `enqueues/` keep their payloads, deduplication ids, priorities, and schedules.

Election tallies order per lane under `vote-aggregation:<lane>` keys (100 in flight each); the domain has no domain-wide cap. User election fan-out and the report-integrity backfill enqueue one bounded page and continue through a cursor.

See [the queue architecture catalog](../../../docs/overview/architecture/queues/README.md) and [queue checklist](../../../docs/checklists/backend-queues.md).
