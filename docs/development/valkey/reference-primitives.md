# Primitives

[Back to Valkey Data Store](README.md#primitives)

For cache, Bloom filter, conditional operation, dynamic config, idempotency-key, rate limiter,
events, scripts, and client API details, use the upstream docs:

- [`valkyries` README](https://github.com/jonathanong/valkyries#readme)
- [`valkyries` API reference](https://github.com/jonathanong/valkyries/blob/main/docs/api.md)
- [`valkyries` migration guide](https://github.com/jonathanong/valkyries/blob/main/docs/migration.md)

Voucha-specific behavior:

- `valkey-core/app-integration.mts` installs `setValkeyErrorHandler(onError)`.
- `valkey-core/app-integration.mts` forwards `cache:call` events to the existing `valkey_cache_calls` analytics event.
- `valkey-core/shutdown.mts` closes GlideMQ instances and then delegates Valkey primitive shutdown to `valkyries`.
- `valkey-glide-mq/glide-mq-retry.mts` retries only client-side inflight saturation for enqueue operations.
- `getBoundedPositiveIntegerField(config, field, { defaultValue, maxValue })` in
  `dynamic-config-fields.mts` reads a positive-integer `DynamicConfig` tunable and returns the default
  for a missing, non-integer, non-positive, or above-maximum value. Use it for every batch size, page
  size, and per-run cap so a bad stored value cannot widen a bound.
