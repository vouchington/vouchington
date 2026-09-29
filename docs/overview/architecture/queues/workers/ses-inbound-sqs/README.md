# SES Inbound SQS Worker

Source entrypoint: [backend/workers/ses-inbound-sqs/README.md](../../../../../../backend/workers/ses-inbound-sqs/README.md)

Consumer package for the `ses-inbound-sqs` SQS queue, the sole producer path for inbound SES email
ingestion. Infrastructure owned by
`vouchington/vouchington-infra` delivers S3
`ObjectCreated` notifications directly to this queue; this package translates that event into the
`SesInboundProcessJobData` shape and enqueues it via the existing, unmodified
`enqueueSesInboundProcess()` from `@queues/ses-inbound/enqueues`. This package does not implement
any inbound-email business logic — that stays in `backend/workers/ses-inbound` (the `ses_inbound`
glide-mq worker/reconciler), which is untouched by this change.

## Exports

- `loadSesInboundSqs` - Function that returns a Promise resolving to `SqsConsumer | null` for the `ses-inbound-sqs` queue.

## Related

- SQS consumer lifecycle: [../../worker-runtime/README.md](../../worker-runtime/README.md)
- Downstream queue: [../../queues/ses-inbound/README.md](../../ses-inbound/README.md)
- Downstream glide-mq worker (unmodified): [../ses-inbound/README.md](../ses-inbound/README.md)
- Worker entrypoints: [../../entrypoints/worker-cpu/README.md](../../../backend/entrypoints/worker-cpu/README.md), [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
