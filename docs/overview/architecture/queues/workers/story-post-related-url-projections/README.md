# Story post related URL projections worker

Source entrypoint: [backend/workers/story-post-related-url-projections/README.md](../../../../../../backend/workers/story-post-related-url-projections/README.md)

Processes one bounded page of durable story-post URL projection work. It leases a work row,
checks the generation fence before relation mutation, and schedules another ordered job while
source or prune work remains. The schedule recovers interrupted work every five minutes.

External URL safety is limited to five concurrent checks and is never performed while the
post-publication transaction is held. Accepted and rejected URL decisions, crawl dispatch, and
story/post cache invalidation each have durable replay state before a source cursor or prune cursor
advances.

## Provisional export status (#1360)

These package exports are retained pending intended-use review. External production use is
unconfirmed; the exports may be made private or removed after review. Their implementations and
current owner behavior remain unchanged.

The exported name is retained only as an external surface: its same-file production implementation and
current default callers remain required.

- `processReconcileStoryPostRelatedUrlProjections`
