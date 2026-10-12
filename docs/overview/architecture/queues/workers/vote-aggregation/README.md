# Vote aggregation worker

Source entrypoint: [backend/workers/vote-aggregation/README.md](../../../../../../backend/workers/vote-aggregation/README.md)

The `voteAggregation` worker dispatches the `vote-aggregation` queue by job name. It rejects unknown names and retains the elections payload-ordering-key check. Domain processors call the same services as the former workers, with a shared baseline concurrency of 10 and a dedicated command client.
