# Valkey Requests — image-uploads

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                 | Client             | Operation | Calls / job                       |
| ---------------------------------------------------------- | ------------------ | --------- | --------------------------------- |
| `processExtractImageMetadata` → `imageStatePubSub.publish` | pubsub (dedicated) | PUBLISH   | 1 complete or failed upload state |

**Total per job:** 0 on shared singletons; 1 dedicated pub/sub PUBLISH for metadata extraction jobs

## Notes

- Metadata extraction publishes upload state through `imageStatePubSub`, which uses a dedicated
  `createChannelPubSub` client outside the shared singleton pool. Image moderation publishes the
  final ready/blocked state from the `openai-moderation` worker.
