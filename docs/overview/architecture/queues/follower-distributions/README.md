# Follower Distributions Queue

Source entrypoint: [backend/queues/follower-distributions/README.md](../../../../../backend/queues/follower-distributions/README.md)

Processes manual follower share/send distribution intents in bounded chunks.

## Queue

- Queue name: `follower-distributions`

## Jobs

- `processFollowerDistribution`
  - Processes one recipient chunk for a persisted `follower_distributions` row.
  - Inserts idempotent notification or feed-share rows using stable delivery ids.
  - Continues inside the same job while more recipients may remain: after a chunk that is not
    complete, the processor calls `moveToDelayed(Date.now())` through `processRetainedSweep`, and
    the job runs the next chunk once the worker promotes it. The recipient cursor lives in
    PostgreSQL, the job keeps its single `process_follower_distribution__<id>` debounce id, and the
    move does not spend a retry attempt. A continuation enqueue would be skipped, because GlideMQ
    skips an add under an id whose job is waiting or active and the running chunk job holds it.
    `moveToDelayed` throws a delay error that the processor must let propagate.
  - A chunk is complete when it returns fewer recipients than `recipient_chunk_size`, so a
    distribution whose recipient count is a multiple of the chunk size runs one extra empty chunk
    that marks it completed.
- `backfillFollowerDistributions`
  - Streams incomplete distribution ids from PostgreSQL and bulk-enqueues processing jobs.

## Related

- Service: [../../services/follower-distributions](../../../../../backend/services/follower-distributions)
- Worker: [../../workers/follower-distributions](../../../../../backend/workers/follower-distributions)
