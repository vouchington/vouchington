# Post publication queue

Source entrypoint: [backend/queues/post-publication/README.md](../../../../../backend/queues/post-publication/README.md)

The globally serial `post-publication` domain of the shared [`background` queue](../background/README.md)
drains generation-fenced durable eligibility work every
five minutes. Repeated changes to one scope coalesce into one repair request with bounded generic
keys. A job expands current post, author, community, RSS, and retained tombstone scopes from
PostgreSQL; reconciles cache, topic-rating, sitemap, and subscription-notification projections; then
advances a generation-fenced parent cursor or exactly acknowledges the leased generation.
Notification writes create durable push intents transactionally; the notifications domain owns push
delivery and recovery.

Its old queue and `WORKER_CONCURRENCY_POST_PUBLICATION` override are gone. Every job runs under the
domain-wide group `post-publication` (concurrency 1, replacing the old `publication-reconciliation`
key), so reconciliation, shadow audits, and the review-succession audit never overlap across workers,
and operators pause, retry, and read stats by domain. Jobs, all priority 100:
`post-publication.reconcile`, `post-publication.shadow-audit`, and
`post-publication.audit-review-succession-history`. The domain contributes 1 to the shared worker's
baseline. The global test worker never serves this domain; a test that needs it builds its own
`createBackgroundWorker` limited to `post-publication`.

Dispatcher triggers throttle for 60 seconds without a stable job ID, so retained terminal job history
cannot suppress a later operator or backfill repair.

The operator backfill registry exposes separate repair and read-only dry-run shadow-audit entries.
Dry runs carry their cursor through ordered continuation jobs without advancing the durable repair
checkpoint.

`review-succession-history-dry-run` starts a distinct read-only audit whose continuations preserve
both UUID cursor and first-page cutoff; it has no repair variant.
