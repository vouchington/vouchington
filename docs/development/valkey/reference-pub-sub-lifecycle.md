# Pub/Sub Lifecycle

[Back to Valkey Data Store](README.md#pubsub-lifecycle)

`createChannelPubSub()` creates dedicated publish and subscriber `GlideClient` instances for
application SSE fanout. These clients are separate from the shared cache, rate limiter, session, and
GlideMQ command clients, so request-accounting docs should list them as dedicated pub/sub calls
instead of shared-singleton Valkey calls.

Subscriber owners must close both subscription handles and long-lived subscriber clients:

- SSE routes should call `subscription.close()` in `finally` or equivalent disconnect cleanup.
- Test files that open a shared subscriber should call the domain `close*Subscriber()` helper in
  `afterAll` so Vitest exits without dropped-client stderr noise.
- Pub/sub publishes and queue `signal()` calls that are intentionally fire-and-forget must attach
  `.catch(onError)` or a narrowly justified benign catch, such as disconnect-time abort signaling.

`closeSubscriber()` is intentionally restricted to an idle owner and rejects while a subscription
is active. This keeps a direct cleanup call from silently dropping SSE delivery. Process shutdown
uses the owner `close()` registered by `@data-stores/valkey-pubsub`; it safely closes active or idle
subscriber and publisher clients exactly once, and makes that owner terminal.

Pub/sub is a best-effort live notification layer. Durable state remains in Postgres; reconnect paths
must recover from the source of truth rather than assuming every pub/sub message was delivered.
