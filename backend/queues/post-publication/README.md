# Post publication queue

The globally serial `post-publication` queue drains generation-fenced durable eligibility work every
five minutes. Repeated changes to one scope coalesce into one repair request with bounded generic
keys. A job expands current post, author, community, RSS, and retained tombstone scopes from
PostgreSQL; reconciles cache, topic-rating, sitemap, and subscription-notification projections; then
advances a generation-fenced parent cursor or exactly acknowledges the leased generation.
Notification writes create durable push intents transactionally; the notifications queue owns push
delivery and recovery.

Dispatcher triggers throttle for 60 seconds without a stable job ID, so retained terminal job history
cannot suppress a later operator or backfill repair.

The operator backfill registry exposes separate repair and read-only dry-run shadow-audit entries.
Dry runs carry their cursor through ordered continuation jobs without advancing the durable repair
checkpoint.

`review-succession-history-dry-run` starts a distinct read-only audit whose continuations preserve
both UUID cursor and first-page cutoff; it has no repair variant.
