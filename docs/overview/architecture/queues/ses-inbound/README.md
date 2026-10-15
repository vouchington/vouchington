# SES Inbound Queue

Source entrypoint: [backend/queues/ses-inbound/README.md](../../../../../backend/queues/ses-inbound/README.md)

The `ses-inbound` domain of the [background queue](../background/README.md) carries only the SES receipt ID and S3 object key. The SQS-fed worker below
uses the shared `@ts-shared/ses-inbound-contract` job identity, so retries and duplicate S3 events
collapse to the same logical job.

The S3 bucket notification targets an SQS queue in code, consumed by
[`backend/workers/ses-inbound-sqs`](../workers/ses-inbound-sqs/README.md), which calls this
package's `enqueueBulkSesInboundProcess()` once per SQS message for its distinct copyright objects.

`ses-inbound.process` reads copyright mail from `copyright-incoming/` in the private inbound-email
bucket. `ses-inbound.reconcile` scans that prefix every five minutes, bulk-enqueues missing jobs, and retries retained failed jobs for objects still present. Each job reads at most the
[`ses-inbound-work-config` page cap](../../services/dynamic-config-admin/README.md#background-work-controls).
When S3 returns another page, one continuation job carries its opaque token. The token's SHA-256
digest forms the job id, so duplicate enqueues while it is waiting or active collapse without
exposing the token or using the scheduled job's throttle. Terminal continuation claims are released
so a later scheduled scan can resume after a failed chain.
The worker preserves the complete source as copyright evidence before deleting a successfully
processed object. Terminally invalid copyright objects move to `failed/`. The SQS producer skips
legacy `incoming/` objects without enqueuing them; the contract rejects non-copyright keys before
the worker performs any I/O.

Every job of the domain shares one group, keyed `ses-inbound`, with concurrency one across all
workers. That keeps the reconciler a singleton, so retained-job removal and stable-ID re-enqueue
cannot overlap, and it also serializes process jobs. One key serves both because a job has only
one ordering key and the domain's old worker concurrency of one is now enforced globally. A
scheduled run may overlap a continuation chain only by queueing behind it; the process jobs' stable
object-key IDs deduplicate repeated object enqueues. The reconciler reads retained failed process
jobs by name from the shared queue, bounded by a fixed limit; failure retention is shared with every
other domain, so an evicted record is simply re-enqueued from S3. The domain can be paused from the
operator API without stopping the other domains.

See the [job replayability matrix](../../../../requirements/platform/JOB-REPLAYABILITY.md) for
the durable-source and recovery contract.
