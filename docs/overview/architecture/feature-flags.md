# Feature Flags

Runtime feature toggles backed by Valkey's `DynamicConfig` system. Flags can be changed without redeployment and propagate to all instances in real time.

## How It Works

Feature flags use the `DynamicConfig` class from `@data-stores/valkey`, which stores fields in a Valkey hash and broadcasts changes via pub/sub.

1. **Storage**: Flags are stored in a Valkey hash at key `dynamic-config:feature-flags`
2. **Propagation**: When a flag changes, a Lua script atomically writes (HSET) and publishes (PUBLISH) the change. All subscribed instances receive the update immediately.
3. **Fallback refresh**: A periodic timer re-reads the full hash from Valkey (default: every 60 seconds) as a safety net if pub/sub messages are missed.
4. **Persistence**: The Dynamic Config Valkey instance uses `appendonly yes` with `appendfsync everysec`, so flags survive restarts with at most 1 second of data loss.

## Current Flags

| Flag                      | Type    | Default | Description                                                |
| ------------------------- | ------- | ------- | ---------------------------------------------------------- |
| `memberships`             | boolean | `false` | Enable membership features                                 |
| `membershipStripeBilling` | boolean | `false` | Enable Stripe purchase calls when `memberships` is also on |
| `chat`                    | boolean | `false` | Enable chat entry points                                   |
| `combinedSearch`          | boolean | `false` | Use the combined command-search backend endpoint           |
| `support`                 | boolean | `false` | Enable support chat entry points                           |
| `fediverse`               | boolean | `false` | Enable Fediverse navigation and search UI                  |

## Adding a New Flag

1. Edit `backend/services/feature-flags/config.mts`
2. Add the field name and type to `fieldTypes`
3. Add the default value to `defaultFields`
4. On next startup, the default is written to Valkey if the field does not already exist

```typescript
export const featureFlagsConfig = new DynamicConfig({
  key: 'feature-flags',
  fieldTypes: {
    myNewFlag: 'boolean',
  },
  defaultFields: {
    myNewFlag: false,
  },
})
```

## Reading Flags

- **Server-side**: `getFeatureFlags()` returns all current flag values from in-memory state (no I/O).
- **Cookie overrides**: backend and web wrappers share the `@ts-shared/feature-flags` compatibility
  facade for the base64-encoded `ff` cookie. Dependency-free codec, Boolean filtering, encoded-size,
  and safe cookie-part mechanics come from `@vouchington/utils/feature-flags`; Voucha retains the
  cookie name, runtime codecs/configuration, and known-flag authorization. Only boolean override
  values are accepted, and only known flags can override backend results.
  `FEATURE_FLAG_COOKIE_MAX_LENGTH` (backend) and the web runtime-public cookie limit currently named
  `NEXT_PUBLIC_FEATURE_FLAG_COOKIE_MAX_LENGTH` limit the accepted encoded cookie value length before
  decode/parse and default to `4096`; oversized cookies parse as no overrides and are not forwarded
  by safe cookie helpers. Keep this value runtime-configured rather than baked into Docker images.
- **API**: `GET /api/v1/feature-flags` (public, unauthenticated) returns flags with any cookie overrides applied.
- **Global server read**: Server rendering calls the same endpoint with an empty Cookie and a
  scoped `global-feature-flags` request kind. The backend accepts this device bootstrap only after
  origin-secret authentication; the edge removes any public caller's copy of that kind. The empty
  Cookie ensures the response contains global values without a user's `ff` override.
- **Endpoint policy**: feature flags gate frontend visibility. Backend APIs stay mounted so clients
  can maintain stable contracts.

## Updating Flags

- **API**: `PATCH /api/v1/dynamic-config/namespaces/feature-flags` with
  `{ config: { flagName: true } }`.
- **UI**: `/admin/dynamic-config`, namespace `feature-flags`.

## Authorization

Users with the `administrator` or `developer` role can update the `feature-flags` namespace.
Moderators, customer-support staff, and investors can inspect Dynamic Config but cannot update this
namespace. The API response's `can_update` field is authoritative for every client.

Browser-local overrides use the `ff` cookie. Native clients persist device-local overrides and
merge them over the latest server response after a successful fetch. Local overrides do not change
the global Valkey value. The native override surface loads only `GET /api/v1/feature-flags`, so a
Dynamic Config list, detail, history, or write failure cannot block device overrides. Only
administrators and developers see these controls. Effective flag changes update native consumers
and feature-gated navigation immediately. Each native client exposes overrides as a standalone
Engineering entry with no web href; Dynamic Config remains a separate workflow.

The .NET state owner tickets public reads before network I/O. A successful Dynamic Config write
advances an authoritative revision, so an older in-flight public response cannot replace the written
namespace value. Public reads started after that write remain eligible to refresh the state.

## Related Services

- [backend/services/feature-flags/README.md](../../../backend/services/feature-flags/README.md) -- flag reading, cookie parsing, update logic
- [ts-shared/feature-flags](../../../ts-shared/feature-flags/index.mts) -- Voucha cookie-name and
  compatibility facade over the environment-agnostic platform primitives
- [@vouchington/utils feature flags](https://github.com/vouchington/vouchington-platform/tree/main/packages/utils) -- dependency-free cookie codec mechanics
- `backend/data-stores/valkey/dynamic-config.mts` -- `DynamicConfig` class
- [backend/api/v1/feature-flags/README.md](../../../backend/api/v1/feature-flags/README.md) -- read endpoint
- [backend/api/v1/dynamic-config/README.md](../../../backend/api/v1/dynamic-config/README.md) -- admin write endpoint and history
- [Web rules](../../../web/CLAUDE.md) -- UI conventions for feature flags
