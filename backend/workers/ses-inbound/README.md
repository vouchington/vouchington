# SES Inbound Worker

The IO worker reads raw MIME from the private SES inbound S3 bucket, parses sender and threading
headers, and calls the customer-support service. It never accepts raw MIME in the queue payload.

Successful processing awaits embedding and customer-support agent fan-out before deleting the
`incoming/` object. Permanent MIME and size failures move to `failed/`; transient S3, PostgreSQL,
and queue failures retry. The reconciler scans `incoming/` every five minutes for raw messages and
also scans PostgreSQL inbound receipts/messages without a completed keyed support-agent run. The
PostgreSQL pass remains effective after the raw object is deleted: it bulk-enqueues the stable AI
job ID and retries a matching retained failed job.

## Related

- Upstream SQS producer (provisioned, idle until production goes live — the S3 notification
  targets it in code as of #9273 PR 2/3): [../ses-inbound-sqs/README.md](../ses-inbound-sqs/README.md)
