# Valkey Rate Limiter Data Store

Vouchington adapter over [Valkyries](https://github.com/jonathanong/valkyries), built on
[`@data-stores/valkey-core`](../valkey-core). Consumers that apply rate limits (API routes,
services) declare this package instead of reaching into the `@data-stores/valkey` barrel or
Valkyries directly.

## Exports

- `RateLimiter`, `RateLimiterWindow`, `RateLimiterAddAndCheckWindowsOptions` - public primitives from
  Valkyries.
- `retryRateLimiterSaturation` - retries custom rate-limiter commands on inflight saturation using
  the shared `VALKEY_INFLIGHT_RETRY_ATTEMPTS` and `VALKEY_INFLIGHT_RETRY_DELAY_MS` configuration.
- `loadScript`, `registerScript`, `rateLimiterValkeyClient` - raw Valkyries integration retained for
  Vouchington-owned custom Lua commands.

Importing this adapter keeps Vouchington Valkey application integration and graceful-shutdown
registration active. The separate cache retry adapter under `../valkey/retry-saturation.mts` remains
owned by the cache concern.

## Related

- Rate Limiter client group and checklist for limiter changes:
  [../valkey/README.md § Rate Limiter Checklist](../valkey/README.md#rate-limiter-checklist)
- Backend context: [../../CLAUDE.md](../../CLAUDE.md)
