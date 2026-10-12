# Vote aggregation queue

`vote-aggregation` carries election tallies, vote-weight and vote-integrity work, topic rating updates, entity metric cache refreshes, and report integrity checks. The domain-specific enqueues in `enqueues/` preserve their existing job names, payloads, deduplication IDs, ordering keys, priorities, retries, and schedules. All jobs use ranked priorities; election tallies validate their ordering key in the worker.

See [the queue architecture catalog](../../../docs/overview/architecture/queues/README.md) and [queue checklist](../../../docs/checklists/backend-queues.md).
