# @workers/rss-feed-maintenance

One IO worker dispatches seven RSS maintenance jobs on the shared queue. The bounded PostgreSQL reconcilers and their immediate continuations retain their original ordering lanes and recovery schedules. Shared baseline concurrency is 10, replacing three independent baseline-5 workers.

See the [worker architecture](../../../docs/overview/architecture/queues/workers/rss-feed-maintenance/README.md).
