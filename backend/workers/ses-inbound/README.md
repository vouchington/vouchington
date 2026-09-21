# SES Inbound Worker

The IO worker reads raw MIME from the private SES inbound S3 bucket, parses sender and threading
headers, and calls the customer-support service. It never accepts raw MIME in the queue payload.

Successful processing awaits embedding and customer-support agent fan-out before deleting the
`incoming/` object. Permanent MIME and size failures move to `failed/`; transient S3, PostgreSQL,
and queue failures retry. The reconciler scans `incoming/` every five minutes for raw messages and
also scans PostgreSQL inbound receipts/messages without a completed keyed support-agent run. The
PostgreSQL pass remains effective after the raw object is deleted: it bulk-enqueues the stable AI
job ID and retries a matching retained failed job.

Mail addressed to the configured designated copyright inbox is routed out of the support path.
Before source cleanup, the worker copies the complete RFC 5322 object to private copyright evidence
storage, records its SHA-256 plus parsed attachment metadata in an immutable intake, and awaits a
replay-safe advisory extraction job. Initial messages and replies use that extraction path. A message matching an
admitted case through encrypted threading headers is held for moderator correspondence classification after the
agent recommendation; no restriction or outbound message runs automatically.

Copyright routing is trusted only when the SQS producer supplies `intakeKind: copyright` for an
object under `copyright-incoming/`; MIME recipient headers cannot select the legal path. The copy
pins the source version and ETag and uses a content-addressed evidence key. Configure
`S3_BUCKET_COPYRIGHT_EVIDENCE` with private encryption, versioning, audited least-privilege worker
access, and an approved retention policy before enabling intake. Malformed MIME remains preserved
as a failed parse for staff review.

## Related

- Upstream SQS producer (provisioned, idle until production goes live — the S3 notification
  targets it in code as of #9273 PR 2/3): [../ses-inbound-sqs/README.md](../ses-inbound-sqs/README.md)
