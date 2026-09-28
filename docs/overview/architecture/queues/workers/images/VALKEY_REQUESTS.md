# Valkey Requests — images

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                 | Client             | Operation | Calls / job                       |
| ---------------------------------------------------------- | ------------------ | --------- | --------------------------------- |
| `processExtractImageMetadata` → `imageStatePubSub.publish` | pubsub (dedicated) | PUBLISH   | 1 complete or failed upload state |
| `cleanup-abandoned-uploads`                                | —                  | —         | 0                                 |

**Total per job:** 0 on shared singletons; 1 dedicated pub/sub PUBLISH for metadata extraction jobs

## Notes

- Metadata extraction publishes upload state through `imageStatePubSub`, which uses a dedicated
  `createChannelPubSub` client outside the shared singleton pool. Image moderation publishes the
  final ready/blocked state from the `openai-moderation` worker.
- Cleanup jobs have no application-level Valkey calls. They are S3-based cleanup work with PSQL
  state tracking.
