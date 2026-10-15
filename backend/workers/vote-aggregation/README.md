# Vote aggregation worker

`vote-aggregation` handlers (`workers.mts` exports `voteAggregationHandlers`) run inside the shared `background` worker, which dispatches by the namespaced job name. Domain processors remain in `processors/`; business effects live in services. The domain adds baseline concurrency 10 to the shared worker.

See [the active worker reference](../../../docs/overview/architecture/queues/reference-active-workers.md).
