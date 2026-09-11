# Post Publication Service

Owns durable capture of post publication eligibility changes. Callers coalesce repeated changes for
one dependency scope in the same PostgreSQL transaction. Scopes cover posts and the author,
community, RSS feed, topic alias, or story dependencies that can change their public eligibility.
Typed key rows retain affected posts, topics, communities, identities, and sitemap shards so later
deletions or mapping changes cannot orphan an existing public projection. Topic-alias changes retain
the exact former alias text, so deletion or reassignment still invalidates the public lookup key that
existed before the transaction. A future queue worker
claims, cursors, and exactly acknowledges that bounded work; this package does not dispatch jobs or
apply projections.

RSS-feed state capture retains both the feed's owning topic and the mapped category topics of its
items. This keeps topic news/latest counts repairable even when a feed has no story-backed posts.
State reconciliation also materializes missing feed item notification impacts into the existing
partitioned key stream in bounded statements. The dirty-work row is not acknowledged until that
materialization and the downstream item enqueues succeed, so scheduled dirty-work recovery can
resume after database or queue failures without a second cursor table.

This storage is current repair state, not a second history ledger. The existing post revision system
remains the source of post history. Acknowledgement deletes the coalesced work and its retained keys;
projection receipts preserve only the last applied identities needed to compensate for hard deletes.
Retained keys and projection receipts are range-partitioned, each with a default partition.
Receipt-only hard-delete tombstones are selected and deleted in bounded pages; successful deletion
is the page cursor, so no additional checkpoint table or cursor column is required.

Projection receipts are the durable acceptance boundary for worker-owned effects: a receipt is
written only after cache invalidation plus durable sitemap and hashtag queue enqueues succeed.
Those downstream queues own their retry policy. The operator shadow audit compares canonical
primary eligibility fingerprints to receipts; dry runs accept an explicit cursor and never alter
the saved checkpoint, while repairs advance and reset that checkpoint at EOF.

Before projection effects, the worker asks the posts service to converge review succession for the
selected post page. Any automatic archive or restore records fresh `post_archived` dirty work with
the affected current and archive-time topics. The worker then enqueues a continuation and leaves the
claimed generation's receipts, cursors, and acknowledgement untouched; a no-write pass proceeds to
ordinary projection reconciliation.

The package's supported surface is exported from `index.mts`; keep internal modules behind that
barrel so new capture and reconciliation helpers do not require a duplicated file inventory here.

Every retained-key writer partitions UUID, text, and sitemap partial-index families, orders each
family by its complete conflict key before batching, and retains caller order where it is observed.
See the [PostgreSQL ordering guard](../../../static-code-analysis/README.md#postgresql-conflict-ordering).
