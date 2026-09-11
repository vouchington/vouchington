# User Deletions Lifecycle

This service owns the durable account-deletion request, exact-attempt fencing, phase advancement,
and required external-work records. The request transaction in `@services/users` owns the immediate
privacy fence; this service owns the background completion marker and never treats a queue delivery
as the source of truth.

Writers that can recreate deletion-owned rows acquire the same active-user transaction fence before
their narrower locks and mutations. A writer already in flight therefore commits before deletion
can start, while a writer arriving after `deleted_at` is set is rejected.

Each successful delivery commits one bounded phase batch. A successor is enqueued after that
commit. A terminal queue attempt rotates its token before the failed job is retained. The recovery
dispatcher reuses tokens for ordinary unstarted requests and rotates tokens for stale processing
attempts, fencing retained failed jobs and stale workers without invalidating queued work.
Required Stripe, S3, and Cloudflare work stays pending until its provider call succeeds, so it
blocks `completed_at` rather than being best effort. The user request boundary attempts recorded
Cloudflare tag work immediately after the privacy fence commits, completing those rows only after a
successful purge and leaving failures for the worker. A Stripe customer that the provider already
reports missing is complete because the required provider state already holds. Export claims are
also retained as deterministic object-key ledger rows, including tokens rotated by stale recovery;
the account-data phase converts those keys to deletion work before it expires the export request.
An active PostgreSQL-clock upload lease keeps the phase on the same durable step until the S3
provider-effect deadline has passed. The export worker's S3 request aborts before that deadline, so
deletion cannot acknowledge a key and then race a later successful upload. A stale token rotation
keeps the displaced attempt's deterministic object key so deletion can purge it after the lease
expires.

Finalization takes the user and author lifecycle locks, confirms each phase-specific empty check,
and runs an independent residual-data sweep. The request is complete only when both gates find no
remaining user-owned data, including Bluesky follow receipts that may arrive after their bounded
credential-cleanup batch. Finalization removes one bounded page of those late local receipts and
schedules another fenced attempt whenever it removes any. After the residual gates clear,
finalization redacts completed external-work identifiers
and purges recomputed relation impacts one bounded page at a time. Any cleaned page schedules another
fenced finalization attempt; only the first attempt that finds both cleanup sets exhausted clears
the copied prior username and records completion. Redacted work retains lifecycle and timing
metadata for the durable audit. Pending impacts remain a completion gate and are never purged
early.

## Related

- User request boundary: [../users/README.md](../users/README.md)
- Queue: [../../queues/user-deletions/README.md](../../queues/user-deletions/README.md)
- Worker: [../../workers/user-deletions/README.md](../../workers/user-deletions/README.md)
- Hard-delete gate: [../data-retention/README.md](../data-retention/README.md)
- Requirements: [../../../docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../../../docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md)
