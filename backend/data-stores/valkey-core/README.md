# Valkey Core Data Store

Shared leaf package for the Valkey split: config, the app-integration bootstrap (error handler +
analytics bridge), the GlideMQ connection primitive, the GlideMQ instance registry, and graceful
shutdown. Every other valkey concern package (`valkey-pubsub`, `valkey-rate-limiter`,
`valkey-glide-mq`) and the shrunk `@data-stores/valkey` barrel depend only on this package — no
concern package depends on another, so the workspace graph stays cycle-free.

## Exports

- `glide-mq-client` - `workerQueueConnection`, `buildWorkerQueueSettings`, `workerQueuePrefix`: the
  shared GlideMQ connection primitive.
- `glide-mq-registry` - registry that `valkey-glide-mq` pushes queue/worker/flow-producer instances
  into and that `shutdown` drains.
- `shutdown` - self-registers with `@data-stores/graceful-shutdown` on import; any process that
  loads `@data-stores/valkey-pubsub`, `@data-stores/valkey-rate-limiter`, or
  `@data-stores/valkey-glide-mq` registers Valkey shutdown without relying on the
  `@data-stores/valkey` barrel.
- `app-integration` (side-effect import) - installs the Valkey error handler and forwards
  `cache:call` events to analytics.

## Related

- Valkey layering, shutdown sequencing, and package map: [../valkey/README.md](../valkey/README.md)
- Agent conventions: [../valkey/CLAUDE.md](../valkey/CLAUDE.md)
- Backend context: [../../CLAUDE.md](../../CLAUDE.md)
