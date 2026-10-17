# ActivityPub inbox queue

Source entrypoint: [backend/queues/activitypub/README.md](../../../../../backend/queues/activitypub/README.md)

This domain of the shared `background` queue (jobs named `activitypub.<name>`) processes durable, unverified inbox envelopes from
`activitypub_inbox_delivery_work_items`. Processing jobs carry only the delivery UUID and a fencing token. The
five-minute recovery dispatcher claims at most 500 abandoned rows from PostgreSQL, rotates stale
tokens, and bulk-enqueues them at priority 100; initial and delayed deliveries run at priority 10.
The five-minute retention cleanup runs at dispatcher priority 100. Ordinary deliveries at priority
10 run first when both are ready, so a sustained delivery backlog can delay retention cleanup.
The manual backfill enqueues a separate priority-100 dispatcher that re-arms one page of exhausted operational
failures (at most 500) and continues through a job carrying the last delivery id, so no job drains the
whole backlog.

Inbound jobs share the `activitypub` domain and worker pool with outbound federation. Their durable envelope and lease-token contract remains separate from outbound delivery.
It is an adapter over the
[service-owned lifecycle](../../services/ap-inbox-activities/README.md#durable-delivery-lifecycle);
queue processors do not mutate lifecycle timestamps directly.
