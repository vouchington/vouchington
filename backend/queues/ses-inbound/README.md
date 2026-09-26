# SES Inbound Queue

The `ses_inbound` queue carries only the SES receipt ID and S3 object key. The SQS-fed worker below
uses the shared `@ts-shared/ses-inbound-contract` job identity, so retries and duplicate S3 events
collapse to the same logical job.

The S3 bucket notification targets an SQS queue in code, consumed by
[`backend/workers/ses-inbound-sqs`](../../workers/ses-inbound-sqs/README.md), which calls this
package's `enqueueSesInboundProcess()`.

`processInboundEmail` reads copyright mail from `copyright-incoming/` in the private inbound-email
bucket. When copyright intake is enabled, `reconcileInboundEmail` scans that prefix every five
minutes, bulk-enqueues missing jobs, and retries retained failed jobs for objects still present.
The worker preserves the complete source as copyright evidence before deleting a successfully
processed object. Terminally invalid objects move to `failed/`.

Manual and scheduled reconciliation jobs use the shared `ses-inbound-reconciliation` ordering key
with concurrency one, so retained-job removal and stable-ID re-enqueue cannot overlap.

See the [job replayability matrix](../../../docs/requirements/platform/JOB-REPLAYABILITY.md) for
the durable-source and recovery contract.
