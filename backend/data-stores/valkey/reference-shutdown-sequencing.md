# Shutdown Sequencing

[Back to Valkey Data Store](README.md#shutdown-sequencing)

[`valkey-core/shutdown.mts`](../valkey-core/shutdown.mts) owns the Voucha-specific Valkey shutdown order. It self-registers on import; `@data-stores/valkey-pubsub`, `@data-stores/valkey-glide-mq`, and `@data-stores/valkey-rate-limiter` side-effect-import it, so any process touching a valkey concern registers shutdown without relying on this barrel:

1. Close every local `DynamicConfig` wrapper so subscription handlers stop receiving updates.
2. Drain registered GlideMQ `Queue`, `Worker`, and `FlowProducer` instances while `valkyries` closes shared primitive clients.
3. Close the shared GlideMQ command client through the registry after the GlideMQ drain resolves.

The shared GlideMQ command client is intentionally lazy. Importing the queue facade must not create a real Valkey client, and shutdown must not close that shared command client before workers and producers have finished draining. Dedicated pub/sub clients are exceptions to singleton ownership and are closed by their owning primitive.
