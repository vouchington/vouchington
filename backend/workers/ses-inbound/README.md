# SES Inbound Worker

The IO worker reads copyright MIME from `copyright-incoming/` in the private SES inbound S3 bucket.
It never accepts raw MIME in the queue payload. Permanent MIME and size failures move to `failed/`;
transient S3, PostgreSQL, and queue failures retry. When copyright intake is enabled, the reconciler
scans `copyright-incoming/` every five minutes and enqueues retained raw objects.

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

When `COPYRIGHT_INTAKE_ENABLED` is false, the worker neither scans copyright-inbound objects nor
copies, parses, deletes, or sends their contents to an agent. Existing source objects remain for a
future enabled reconciliation pass.

## Related

- Upstream SQS producer (provisioned, idle until production goes live — the S3 notification
  targets it in code as of #9273 PR 2/3): [../ses-inbound-sqs/README.md](../ses-inbound-sqs/README.md)
