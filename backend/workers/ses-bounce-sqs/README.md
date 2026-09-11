# SES Bounce SQS Worker

Consumer package for the `ses-bounce-sqs` SQS queue. Handles SES bounce, complaint, and delivery
notifications forwarded by SNS via a raw-delivery subscription, mapping each notification to a
`createSesBounceEvent()` call. This is the sole ingestion path since Phase 3c deleted the
`ses-bounce` Lambda; `ses_bounce_events.dedup_key`, added in Phase 3a, is retained for
idempotency against SQS's at-least-once delivery.

## Exports

- `loadSesBounceSqs` - Function that returns a Promise resolving to `SqsConsumer | null` for the `ses-bounce-sqs` queue.

## Related

- SQS consumer lifecycle: [../../worker-runtime/README.md](../../worker-runtime/README.md)
- Downstream service: [../../services/ses-bounce-events/README.md](../../services/ses-bounce-events/README.md)
- Worker entrypoints: [../../entrypoints/worker-cpu/README.md](../../entrypoints/worker-cpu/README.md), [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
