# Follower Distributions Queue

Source entrypoint: [backend/queues/follower-distributions/README.md](../../../../../backend/queues/follower-distributions/README.md)

Processes manual follower share/send distribution intents in bounded chunks.

## Queue

- Queue name: `follower-distributions`

## Jobs

- `processFollowerDistribution`
  - Processes one recipient chunk for a persisted `follower_distributions` row.
  - Inserts idempotent notification or feed-share rows using stable delivery ids.
  - Enqueues a continuation job when more recipients may remain. The active chunk job still holds
    its own dedup id (`process_follower_distribution__<id>`, or the continuation id below), and
    GlideMQ skips an add under an id whose job is waiting or active. The continuation is
    therefore keyed by the cursor the chunk just advanced to,
    `process_follower_distribution__<id>__after__<cursorRecipientId>`, with `simple` dedup. Jobs
    that advance to the same cursor collapse onto one continuation, and a `null` add means that
    continuation is already queued or running. Each continuation id is one more entry in the
    queue's dedup hash, which GlideMQ never trims.
- `backfillFollowerDistributions`
  - Streams incomplete distribution ids from PostgreSQL and bulk-enqueues processing jobs.

## Related

- Service: [../../services/follower-distributions](../../../../../backend/services/follower-distributions)
- Worker: [../../workers/follower-distributions](../../../../../backend/workers/follower-distributions)
