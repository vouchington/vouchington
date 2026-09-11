# SES Inbound Queue

The `ses_inbound` queue carries only the SES receipt ID and S3 object key. The SQS-fed worker below
uses the shared `@ts-shared/ses-inbound-contract` job identity, so retries and duplicate S3 events
collapse to the same logical job.

The S3 bucket notification targets an SQS queue in code, consumed by
[`backend/workers/ses-inbound-sqs`](../../workers/ses-inbound-sqs/README.md), which calls this
package's `enqueueSesInboundProcess()`.

`processInboundEmail` reads the durable raw message from the private inbound-email bucket.
`reconcileInboundEmail` scans the `incoming/` prefix every five minutes, bulk-enqueues missing jobs,
and retries retained failed jobs for objects still present. In the same scheduled pass it pages
PostgreSQL inbound receipts/messages lacking a completed keyed support-agent run, then bulk-enqueues
or retries their stable `customer-support` job IDs. PostgreSQL therefore recovers AI work after a
successful raw object has been deleted. Receipt records make processing idempotent; completed
objects are deleted and terminally invalid objects move to `failed/`.

Manual and scheduled reconciliation jobs use the shared `ses-inbound-reconciliation` ordering key
with concurrency one, so retained-job removal and stable-ID re-enqueue cannot overlap.

See the [job replayability matrix](../../../docs/requirements/platform/JOB-REPLAYABILITY.md) for
the durable-source and recovery contract.
