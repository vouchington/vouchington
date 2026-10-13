# ActivityPub inbox queue

Source entrypoint: [backend/queues/activitypub-inbox/README.md](../../../../../backend/queues/activitypub-inbox/README.md)

This I/O-capable queue processes durable, unverified inbox envelopes from
`activitypub_inbox_delivery_work_items`. Processing jobs carry only the delivery UUID and a fencing token. The
five-minute recovery dispatcher claims at most 500 abandoned rows from PostgreSQL, rotates stale
tokens, and bulk-enqueues them at priority 100; initial and delayed deliveries run at priority 10.
The five-minute retention cleanup runs at dispatcher priority 100. Ordinary deliveries at priority
10 run first when both are ready, so a sustained delivery backlog can delay retention cleanup.
The manual backfill enqueues a separate priority-100 dispatcher that drains exhausted operational
failures in sequential batches of at most 500, awaiting each bulk enqueue before claiming the next
batch.

The queue is intentionally separate from `activitypub-delivery`, which owns outbound federation.
It is an adapter over the
[service-owned lifecycle](../../services/ap-inbox-activities/README.md#durable-delivery-lifecycle);
queue processors do not mutate lifecycle timestamps directly.
