# @workers/activitypub

`activitypubHandlers` run outbound delivery and durable inbound processing for the `activitypub` domain of the shared `background` worker. Delivery keeps its rate-limit deferral and distribution delay; inbox jobs keep their durable transition handling.

See the [worker architecture](../../../docs/overview/architecture/queues/workers/activitypub/README.md).
