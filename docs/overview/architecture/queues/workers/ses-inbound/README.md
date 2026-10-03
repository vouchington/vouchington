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

Copyright routing is trusted only for an S3 object under `copyright-incoming/`; MIME recipient
headers cannot select the legal path. The copy pins the source version and ETag and uses a
content-addressed evidence key. Configure
`S3_BUCKET_COPYRIGHT_EVIDENCE` with private encryption, versioning, audited least-privilege worker
access, and an approved retention policy before enabling intake. Malformed MIME remains preserved
as a failed parse for staff review.

## SES verdicts

The SQS payload carries only the bucket and key, so SES's SPF, DKIM, DMARC, spam, and virus
verdicts are read from the headers SES prepends to the raw MIME; the receipt rule's
`scan_enabled = true` is what makes SES write the spam and virus verdicts. The worker captures the
header block while it hashes the object for the evidence copy and writes `spf`, `dkim`, `dmarc`,
`spam`, and `virus` as typed columns on the immutable intake. Each is `pass`, `fail`, `gray`,
`processing_failed`, or `unknown`.

SES prepends every header it writes above the headers the sender supplied, so the trust boundary is
the topmost `X-SES-RECEIPT`: only fields above it are read, and a sender can forge anything below
it. This assumes SES always writes `X-SES-RECEIPT` on a received message; a message without one
gets `unknown` for every check. `X-SES-Spam-Verdict` and `X-SES-Virus-Verdict` come from the topmost
instance. SPF, DKIM, and DMARC come from the first `Authentication-Results` field whose authserv-id
is exactly `amazonses.com`, and `Received-SPF` is never read. When a method is reported more than
once the least favourable result wins. A header that is absent, oversized, unparseable, or
unrecognised is `unknown`, never `pass`. DKIM `pass` means a signature validated; it does not show
the signing domain aligns with the From address.

Verdicts are written once with the intake. A replay of the same object keeps the first verdicts,
and the replay mismatch check still compares only the object key, size, and SHA-256. Staff see the
verdicts on the email review page; an authentication failure is a risk note and never rejects a
notice. A virus `fail` quarantines the original: see
[Quarantined originals](../../../../../runbooks/copyright-notices.md#quarantined-originals).

The SQS producer acknowledges legacy `incoming/` events without enqueuing a job. The contract
also rejects any non-copyright object key before the worker performs S3 reads, copies, intake
writes, parsing, or enqueues. These legacy objects stay at `incoming/`, which has no lifecycle
expiry pending the infrastructure cleanup in #1229; the reconciler never lists them.

`COPYRIGHT_INTAKE_ENABLED` does not gate ingest. While it is false, the worker and the reconciler
still copy, parse, thread-link, and delete each source object, so every email (a new notice or a
reply on a case) becomes an intake row in the staff email intake queue. The evidence bucket is still
required. A stack with no `S3_BUCKET_SES_INBOUND` (local development) has nothing for the five-minute
reconcile to scan, so the sweep returns `enqueued: 0` and reports the skip through
`recordScheduledJobConfigMissing` (a console warning in development and CI plus a tagged Sentry
warning `scheduled_job_config_missing`) instead of failing and retrying. Ingest of a received email
still fails on a missing SES inbound or evidence bucket, because that job only exists once mail
arrived. The worker still enqueues the advisory extraction job, but that job returns without a
model call until the switch is true, and the agent-dispatch reconciler then sends every parsed
email that has no recommendation and no staff decision to it. See the
[intake runbook](../../../../../runbooks/copyright-notices.md#intake-activation).

## Related

- Upstream SQS producer (provisioned, idle until production goes live — the S3 notification
  targets it in code as of #9273 PR 2/3): [../ses-inbound-sqs/README.md](../ses-inbound-sqs/README.md)
