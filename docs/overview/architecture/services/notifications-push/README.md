# Notifications Push Service

Source entrypoint: [backend/services/notifications-push/README.md](../../../../../backend/services/notifications-push/README.md)

Browser web push delivery for notifications stored by
[`@services/notifications`](../notifications/README.md). Split into its own package so that
[`web-push`](https://www.npmjs.com/package/web-push) is only pulled in by the worker that actually
sends push notifications, not by every consumer of the base notifications service.

Delivery is driven by durable notification push intents. Workers claim an intent with a fencing
lease, deliver only to subscription generations without a terminal receipt, and commit outcomes
only while that lease remains current. Every provider payload includes the exact endpoint and
activation generation; a replacement generation cannot be mutated by an in-flight prior send.

## Lease and receipt lifecycle

The delivery policy owns the 120-second claim, 30-second renewal cadence, five-endpoint mapper
limit, and 30-second Web Push socket-inactivity timeout in
[`push-intent-delivery-policy.mts`](../../../../../backend/services/notifications-push/push-intent-delivery-policy.mts). The socket timeout is not a
total request deadline. Each endpoint outcome is persisted under the current token before another
endpoint can determine final intent state. Renewal, persistence, or terminal-transition ownership
loss destroys the intent-private HTTPS agent, prevents queued sends, waits for started work, and
does not release or finalize the intent. Recovery then owns the next claim.

A subscription generation replaced while its provider send is in flight is distinct from lease
loss: discard that endpoint outcome and continue the still-owned run for its other generations,
then release the intent for the replacement generation to retry rather than finalizing delivery.

## Provider response policy

Delivery records a terminal receipt for successful sends and provider responses that make this
notification undeliverable. A 404 or 410 invalidates the registration, so the service records a
terminal receipt and soft-deletes that subscription. Other integer 300–499 responses, including
400, 401, 403, and 413, record a terminal receipt for this notification but preserve the
subscription for later notifications. Transport errors, malformed or anomalous statuses, 408, 429,
and 500–599 responses remain retryable. Every failed send updates `last_failure_at`; only invalid
registrations set `deleted_at`.

The receipt status deliberately expresses notification delivery rather than subscription validity:
both terminal failure classes use `permanently_failed`, while subscription deletion remains limited
to 404 and 410.

The capture trigger creates a pending intent with each new notification. When direct-message or
modmail aggregation regenerates the notification UUID, a before-update trigger first deletes the
old intent and its endpoint receipts. The after-update capture then creates fresh work, so foreign
key cascades cannot carry terminal delivery facts into the new effect. Exact replay of an unchanged
notification keeps its existing intent and terminal receipts.

## Web Push Subject

`WEB_PUSH_SUBJECT` should identify the Voucha operator in VAPID metadata, typically
`mailto:team@voucha.ai`. It is not derived from the end user who receives a push notification.

## Related

- Notification storage and subscriptions: [../notifications/README.md](../notifications/README.md)
- Worker: [../../workers/notifications/README.md](../../queues/workers/notifications/README.md)
