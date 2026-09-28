# Follower Distributions Queue

Source entrypoint: [backend/queues/follower-distributions/README.md](../../../../../backend/queues/follower-distributions/README.md)

Processes manual follower share/send distribution intents in bounded chunks.

## Queue

- Queue name: `follower-distributions`

## Jobs

- `processFollowerDistribution`
  - Processes one recipient chunk for a persisted `follower_distributions` row.
  - Inserts idempotent notification or feed-share rows using stable delivery ids.
  - Enqueues a continuation job when more recipients may remain.
- `backfillFollowerDistributions`
  - Streams incomplete distribution ids from PostgreSQL and bulk-enqueues processing jobs.

## Related

- Service: [../../services/follower-distributions](../../../../../backend/services/follower-distributions)
- Worker: [../../workers/follower-distributions](../../../../../backend/workers/follower-distributions)
