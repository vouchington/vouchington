# Stripe Events SQS Worker

Consumer package for the `stripe-events-sqs` SQS queue — the sole Stripe ingestion path since the
HTTP endpoint was deleted in #9330. Unwraps the EventBridge `PutEvents` envelope's `detail` and
calls `ingestStripeEvent()`, which inserts into the `stripe_events` ledger and enqueues
`processStripeEvent` for a row that needs processing.

The EventBridge partner event bus, rule, target, and SQS queue policy granting
`events.amazonaws.com` send access are owned by
`vouchington/vouchington-infra`. They are gated
on `stripe_eventbridge_partner_source_name`, which is empty until a human runs the one-time
`stripe v2 core event_destinations create --type amazon_eventbridge ...` (requires interactive
`stripe login`) against a given environment's Stripe account. Once that variable is set and applied,
this queue is fed in real time; until then it stays provisioned but empty. The infrastructure
repository sets `STRIPE_EVENTS_SQS_QUEUE_URL` in every managed ECS environment regardless, so
`loadStripeEventsSqs()` always starts the consumer — only local or otherwise unmanaged environments
without that variable set skip starting it.

Unlike `ses-bounce-sqs`'s SNS raw-message-delivery subscription (bare payload as the SQS body),
EventBridge-to-SQS delivery has no raw-delivery equivalent -- the message body is always the full
envelope (`{version, id, detail-type, source, account, time, region, resources, detail}`), so the
processor always reads `.detail`. There is no Stripe-Signature header on an EventBridge delivery to
verify; authenticity comes from only Stripe's verified EventBridge destination being able to put
events onto the partner bus that feeds this queue.

## Exports

- `loadStripeEventsSqs` - Function that returns a Promise resolving to `SqsConsumer | null` for the `stripe-events-sqs` queue.

## Related

- SQS consumer lifecycle: [../../worker-runtime/README.md](../../worker-runtime/README.md)
- Shared ingest logic: [../../services/stripe/README.md](../../services/stripe/README.md)
- Worker entrypoints: [../../entrypoints/worker-cpu/README.md](../../entrypoints/worker-cpu/README.md), [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
