# SES Inbound Queue

Source entrypoint: [backend/queues/ses-inbound/README.md](../../../../../backend/queues/ses-inbound/README.md)

The `ses_inbound` queue carries only the SES receipt ID and S3 object key. The SQS-fed worker below
uses the shared `@ts-shared/ses-inbound-contract` job identity, so retries and duplicate S3 events
collapse to the same logical job.

The S3 bucket notification targets an SQS queue in code, consumed by
[`backend/workers/ses-inbound-sqs`](../workers/ses-inbound-sqs/README.md), which calls this
package's `enqueueSesInboundProcess()`.

`processInboundEmail` reads copyright mail from `copyright-incoming/` in the private inbound-email
bucket. `reconcileInboundEmail` scans that prefix every five minutes, bulk-enqueues missing jobs, and retries retained failed jobs for objects still present. Each job reads at most the
[`ses-inbound-work-config` page cap](../../services/dynamic-config-admin/README.md#background-work-controls).
When S3 returns another page, one continuation job carries its opaque token. The token's SHA-256
digest forms the job id, so duplicate enqueues while it is waiting or active collapse without
exposing the token or using the scheduled job's throttle. Terminal continuation claims are released
so a later scheduled scan can resume after a failed chain.
The worker preserves the complete source as copyright evidence before deleting a successfully
processed object. Terminally invalid copyright objects move to `failed/`. The SQS producer skips
legacy `incoming/` objects without enqueuing them; the contract rejects non-copyright keys before
the worker performs any I/O.

Manual and scheduled reconciliation jobs use the shared `ses-inbound-reconciliation` ordering key
with concurrency one, so retained-job removal and stable-ID re-enqueue cannot overlap.
Continuation jobs use that ordering key too. A scheduled run may overlap a continuation chain;
the process jobs' stable object-key IDs deduplicate repeated object enqueues.

See the [job replayability matrix](../../../../requirements/platform/JOB-REPLAYABILITY.md) for
the durable-source and recovery contract.
