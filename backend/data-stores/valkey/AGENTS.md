# Valkey

- Valkey docs: [Valkey index](../../../docs/development/valkey/README.md).
- Generic cache, Bloom, conditional operations, dynamic config, idempotency, rate limiting, events,
  scripts, and clients belong in `valkyries`; local packages remain Voucha facades/application glue.
- Keep `sessionValkeyClient`, GlideMQ wiring, analytics forwarding, and `onError` glue local unless
  `valkyries` explicitly adopts them.
- Preserve the isolated `bloomValkeyClient` so rebuilds cannot exhaust cache capacity.
