# Elections and votes

- Vote tables, columns, indexes, and triggers use [config-driven generators](../../data-stores/psql/config-driven/). Derived aggregate columns on parent entity tables follow normal schema placement; prelaunch edits fold into original creators.
- Topic vote writes enqueue rating-stat refresh (stats also depend on reviews). Keep refresh asynchronous/debounced; never await it on the vote write path.
- Reuse [`shared/entity-service.mts`](shared/entity-service.mts); per-entity files cover actual special cases.
- New PUT vote routes use [`createVoteHandler()`](../../api/election-vote-handler.mts). Architecture, factories, and caching belong in [README.md](../../../docs/overview/architecture/services/elections-votes/README.md).
