# Vote aggregation worker

The single IO worker dispatches the `vote-aggregation` queue by job name. Domain processors remain in `processors/`; business effects live in services. Baseline concurrency is 10, shared across the former six IO queues, and the worker keeps a dedicated command client.

See [the active worker reference](../../../docs/overview/architecture/queues/reference-active-workers.md).
