# ActivityPub worker

Source entrypoint: [backend/workers/activitypub](../../../../../../backend/workers/activitypub/README.md).

One IO worker with concurrency ten dispatches six job names from the [shared queue](../../activitypub/README.md). Outbound distribution keeps `moveToDelayed` when a durable page is busy, and outbound delivery retains `boundRateLimitDeferral` for remote Retry-After responses. Inbound jobs retain their durable claim, release, exhaust, rearm, and expiry transitions. The two previous workers each allowed five jobs; ten preserves that aggregate bound but shares capacity across directions. Incoming bursts can delay outgoing POSTs, and slow remote POSTs can delay inbound processing.

Domain-specific recovery and replay behavior remains in the [inbox guide](../activitypub-inbox/README.md) and [outbound guide](../activitypub-delivery/README.md).
