# Valkey Pub/Sub Data Store

`createChannelPubSub()` is Voucha's configuration and lifecycle facade over
[`valkyries/channel-pubsub`](https://github.com/jonathanong/valkyries/blob/main/docs/channel-pubsub.md),
with domain-specific SSE fanout facades. It injects the worker-queue connection, routes contained
codec and handler failures through `@modules/on-error`, and registers each owner for graceful
shutdown.

## Exports

- `createChannelPubSub` - `channel-pubsub.mts`: configures a dedicated publisher and pattern
  subscriber for a channel namespace. `closeSubscriber()` only closes an idle client; the owner
  `close()` is shutdown-only and safely tears down active subscriptions and the publisher.
- Domain facades: `imageStatePubSub`, `dataRequestPubSub`, `articleSyncPubSub`,
  `publishChatToken` / `subscribeChatTokens` / `closeChatTokenSubscriber`,
  and `publishImportProgress` / `subscribeImportProgress` — one per
  `channel-pubsub.mts` consumer.

## Related

- Pub/Sub lifecycle, subscriber cleanup, and reconnect semantics:
  [../valkey/README.md § Pub/Sub Lifecycle](../valkey/README.md#pubsub-lifecycle)
- Backend context: [../../CLAUDE.md](../../CLAUDE.md)
