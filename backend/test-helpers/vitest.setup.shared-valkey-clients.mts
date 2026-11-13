import {
  bloomValkeyClient,
  dynamicConfigPrimaryValkeyClient,
  primaryCacheValkeyClient,
  sessionValkeyClient,
} from '@data-stores/valkey/clients'

// These package-managed clients live for the fork, but connect on their first command. Open
// them before the leak detector's baseline so later Bloom, auth, moderation and membership
// tests do not look like accumulating test-owned connections. Shutdown still owns the clients.
await Promise.all(
  [
    bloomValkeyClient,
    dynamicConfigPrimaryValkeyClient,
    primaryCacheValkeyClient,
    sessionValkeyClient,
  ].map(client => client.ping()),
)
