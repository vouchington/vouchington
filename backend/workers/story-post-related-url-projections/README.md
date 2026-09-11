# Story post related URL projections worker

Processes one bounded page of durable story-post URL projection work. It leases a work row,
checks the generation fence before relation mutation, and schedules another ordered job while
source or prune work remains. The schedule recovers interrupted work every five minutes.

External URL safety is limited to five concurrent checks and is never performed while the
post-publication transaction is held. Accepted and rejected URL decisions, crawl dispatch, and
story/post cache invalidation each have durable replay state before a source cursor or prune cursor
advances.
