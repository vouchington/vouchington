# SES Inbound Worker

Source entrypoint: [backend/workers/ses-inbound/README.md](../../../../../../backend/workers/ses-inbound/README.md)

The IO worker reads copyright MIME from `copyright-incoming/` in the private SES inbound S3 bucket.
It never accepts raw MIME in the queue payload. Permanent MIME and size failures move to `failed/`;
transient S3, PostgreSQL, and queue failures retry. The reconciler scans `copyright-incoming/` every
five minutes and enqueues retained raw objects.

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

`COPYRIGHT_INTAKE_ENABLED` does not gate ingest. While it is false, the worker and the reconciler
still copy, parse, thread-link, and delete each source object, so every email (a new notice or a
reply on a case) becomes an intake row in the staff email intake queue. The evidence bucket is still
required. The worker still enqueues the advisory extraction job, but that job returns without a
model call until the switch is true, and the agent-dispatch reconciler then sends every parsed
email that has no recommendation and no staff decision to it. See the
[intake runbook](../../../../../runbooks/copyright-notices.md#intake-activation).

## Related

- Upstream SQS producer (provisioned, idle until production goes live — the S3 notification
  targets it in code as of #9273 PR 2/3): [../ses-inbound-sqs/README.md](../ses-inbound-sqs/README.md)
