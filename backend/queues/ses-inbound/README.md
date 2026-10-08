# SES Inbound Queue

The full guide and reference material lives in [the documentation catalog](../../../docs/overview/architecture/queues/ses-inbound/README.md).

Reconciliation lists a bounded number of copyright S3 pages per job. If S3 returns another page,
the queue enqueues a continuation carrying its opaque token; the next job resumes at that page.
