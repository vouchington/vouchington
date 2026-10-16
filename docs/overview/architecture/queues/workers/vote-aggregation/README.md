# Vote aggregation worker

Source entrypoint: [backend/workers/vote-aggregation/README.md](../../../../../../backend/workers/vote-aggregation/README.md)

`@workers/vote-aggregation` no longer owns a Worker. It exports `voteAggregationHandlers`, one `backgroundHandler` per job of the `vote-aggregation` domain, and the shared [background worker](../background/README.md) runs them by namespaced job name (`vote-aggregation.<name>`). Domain processors call the same services as the former worker; the shared worker's pause check, rate-limit conversion, and dedicated command client apply.
