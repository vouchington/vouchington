# SES Inbound SQS Worker

Source entrypoint: [backend/workers/ses-inbound-sqs/README.md](../../../../../../backend/workers/ses-inbound-sqs/README.md)

Consumer package for the `ses-inbound-sqs` SQS queue, the sole producer path for inbound SES email
ingestion. Infrastructure owned by
`vouchington/vouchington-infra` delivers S3
`ObjectCreated` notifications directly to this queue; this package translates that event into the
`SesInboundProcessJobData` shape and enqueues copyright objects via
`enqueueSesInboundProcess()` from `@queues/ses-inbound/enqueues`. It acknowledges legacy
`incoming/` events without enqueuing a job, logging only the bucket and object key. Inbound-email
business logic stays in `backend/workers/ses-inbound` (the `ses_inbound` glide-mq
worker/reconciler).

## Exports

- `loadSesInboundSqs` - Function that returns a Promise resolving to `SqsConsumer | null` for the `ses-inbound-sqs` queue.

## Related

- SQS consumer lifecycle: [../../worker-runtime/README.md](../../worker-runtime/README.md)
- Downstream queue: [../../queues/ses-inbound/README.md](../../ses-inbound/README.md)
- Downstream glide-mq worker: [../ses-inbound/README.md](../ses-inbound/README.md)
- Worker entrypoints: [../../entrypoints/worker-cpu/README.md](../../../backend/entrypoints/worker-cpu/README.md), [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
