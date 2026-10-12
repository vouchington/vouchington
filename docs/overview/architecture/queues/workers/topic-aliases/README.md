# Topic Aliases Worker

Source entrypoint: [backend/workers/rss-feed-maintenance/README.md](../../../../../../backend/workers/rss-feed-maintenance/README.md)

Worker package for topic alias update jobs.

It also drains the serialized, bounded durable reconciliation for RSS category mappings after a
hashtag alias transition when the prompt cleanup job was rejected or terminally failed. A full
successful 25-row page immediately chains one continuation on the same ordering key.

`processInvalidatePostsForTopicAliases` applies the same bounded continuation pattern to affected
post caches and notification-recipient reconciliation, processing 100 IDs at a time.

## Exports

- `rssFeedMaintenance` - shared worker instance for the `rss-feed-maintenance` queue.

## Related

- Queue surface: [../../queues/topic-aliases/README.md](../../topic-aliases/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
