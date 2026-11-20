# Elections and votes

- Topic vote writes enqueue rating-stat refresh (stats also depend on reviews). Keep refresh
  asynchronous/debounced; never await it on the vote write path.
- Reuse [`shared/entity-service.mts`](shared/entity-service.mts); per-entity files cover actual special cases.
