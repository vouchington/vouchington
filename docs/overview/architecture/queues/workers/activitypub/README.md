# ActivityPub worker

Source entrypoint: [backend/workers/activitypub](../../../../../../backend/workers/activitypub/README.md).

`activitypubHandlers` (`workers.mts`) registers six handlers for the `activitypub` domain of the [shared queue](../../activitypub/README.md); the [background worker](../background/README.md) runs them, and the domain adds a baseline of ten to its summed concurrency (the old worker's ten). Outbound distribution keeps `moveToDelayed` when a durable page is busy, and outbound delivery retains `boundRateLimitDeferral` for remote Retry-After responses; the shared processor turns that rate-limit signal into a deferral of the one job, because the domain group is job-scoped. Inbound jobs retain their durable claim, release, exhaust, rearm, and expiry transitions. Incoming bursts can delay outgoing POSTs, and slow remote POSTs can delay inbound processing.

The real-GlideMQ tests in `backend/workers/background/__tests__/activitypub*.real-glide.mock.test.mts` run these handlers through the production processor, including a remote 429 deferred without spending an attempt and a busy page lease. `WORKER_CONCURRENCY_ACTIVITYPUB` no longer exists.

Domain-specific recovery and replay behavior remains in the [inbox guide](../activitypub-inbox/README.md) and [outbound guide](../activitypub-delivery/README.md).
