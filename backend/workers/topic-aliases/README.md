# Topic Aliases Worker

Worker package for topic alias update jobs.

It also drains the serialized, bounded durable reconciliation for RSS category mappings after a
hashtag alias transition when the prompt cleanup job was rejected or terminally failed. A full
successful 25-row page immediately chains one continuation on the same ordering key.

`processInvalidatePostsForTopicAliases` applies the same bounded continuation pattern to affected
post caches and notification-recipient reconciliation, processing 100 IDs at a time.

## Exports

- `topicAliases` - worker instance for the `topic-aliases` queue.

## Related

- Queue surface: [../../queues/topic-aliases/README.md](../../queues/topic-aliases/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
