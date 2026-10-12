# @workers/activitypub

One IO worker dispatches outbound delivery and durable inbound processing on the shared `activitypub` queue. Delivery keeps its rate-limit deferral and distribution delay; inbox jobs keep their durable transition handling.

See the [worker architecture](../../../docs/overview/architecture/queues/workers/activitypub/README.md).
