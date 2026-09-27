# Follower Distributions Service

Source entrypoint: [backend/services/follower-distributions/README.md](../../../../../backend/services/follower-distributions/README.md)

Persists and processes manual follower share/send distribution intents for posts and RSS feed items.

## Responsibilities

- Validate post/RSS targets and selected-follower recipients before accepting an intent.
- Enforce once-per-day share/send dedupe per sender and target.
- Store small distribution records, with bounded selected-follower ids.
- Process recipient chunks idempotently through `follower_distribution_deliveries`.
- Create feed-share rows or manual-send notification rows using stable per-recipient delivery ids.
- Stream incomplete distribution ids for queue backfill.

Delivery, share, and manual-send inserts acquire recipient conflicts in canonical key order, so
overlapping processor batches remain idempotent without serializing the queue. See the
[PostgreSQL ordering guard](../../../../development/quality/static-code-analysis/README.md#postgresql-conflict-ordering).

## Related

- Queue: [../../queues/follower-distributions](../../../../../backend/queues/follower-distributions)
- Worker: [../../workers/follower-distributions](../../../../../backend/workers/follower-distributions)
- API docs: [../../api/v1/posts/README.md](../../../../../backend/api/v1/posts/README.md), [../../api/v1/rss-feed-items/README.md](../../../../requirements/api/v1/rss-feed-items/README.md)
