# @queues/activitypub

The shared ranked queue carries outbound ActivityPub distribution and delivery plus durable inbound delivery, recovery, rearm, and cleanup jobs. Domain-specific enqueue options and scheduler IDs remain in `enqueues/delivery.mts`, `enqueues/inbox.mts`, and `enqueues/schedules.mts`.

See the [queue architecture](../../../../docs/overview/architecture/queues/activitypub/README.md).
