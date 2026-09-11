# Story post related URL projections queue

Drains durable, generation-fenced projections from active story RSS items to a story post's
`post -> related -> url` relations. The single ordered reconciliation job is prompted after a
membership transaction commits and recovers every five minutes.

The worker owns bounded source and prune pages. It renews the exact generation lease while a source
page is being screened and applied, then settles the renewal before releasing the claim. Each
generation captures RSS-item, relation-ID,
and relation-activation boundaries, so links added or reactivated after capture are not pruned by
that generation. Per-URL receipts persist accepted and rejected decisions plus relation/crawl
effect completion. The fenced relation transaction rechecks hostname blocks through indexed
hostname-suffix equality, records the initial
vote aggregate, and rechecks referral eligibility under the mutation-compatible advisory fence
before durably recording whether a newly activated relation needs a crawl.
Generation restarts copy post-capture relation fences into the new generation under the
post-publication lock. A replay
therefore retries a failed crawl dispatch, including across a generation restart, without
recrawling relations that were already active.
Superseded-generation receipts are deleted by the leased worker in bounded pages. The work row
separately persists pending story/post cache invalidation after a relation newly activates, so a
crash after that commit cannot acknowledge the page before the idempotent effect is replayed and
already-active source pages do not purge HTML. RSS URL revisions take the story lifecycle fence,
then recheck for a story post, so a concurrent create cannot snapshot the pre-revision URL. Writer
transactions also compare revisions against locked item state before starting a new generation.
