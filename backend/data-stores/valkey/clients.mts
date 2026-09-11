import '@data-stores/valkey-core/app-integration'

import {
  cacheValkeyClient,
  closeDynamicConfigValkeySubscriptionClient,
  dynamicConfigValkeyClient,
  rateLimiterValkeyClient,
  upsertValkeyClientByUrl,
} from 'valkyries'
import { config } from '@data-stores/valkey-core/config'

export {
  cacheValkeyClient,
  closeDynamicConfigValkeySubscriptionClient,
  dynamicConfigValkeyClient,
  rateLimiterValkeyClient,
  upsertValkeyClientByUrl,
}

export const sessionValkeyClient = await upsertValkeyClientByUrl(config.session_url, {
  readFrom: 'primary',
})

// DynamicConfig normally prefers replicas because its feature-flag reads are not on a consistency
// boundary. Accounting uncertainty is fail-closed spend-control state, so it requires an isolated
// primary-only client even when it shares the dynamic-config Valkey endpoint.
export const DYNAMIC_CONFIG_PRIMARY_READ_FROM = 'primary'

export const dynamicConfigPrimaryValkeyClient = await upsertValkeyClientByUrl(
  config.dynamic_config_url,
  {
    name: 'dynamic-config-primary',
    readFrom: DYNAMIC_CONFIG_PRIMARY_READ_FROM,
  },
)

// Dedicated GlideClient for all ValkeyBloomFilter operations.
// Routes bloom-filter traffic (BF.MADD, BF.MEXISTS, atomic RENAME, ready-marker set/unlink)
// off cacheValkeyClient so bloom rebuilds — which can issue O(rows/5k) commands per job — do
// not exhaust cacheValkeyClient's 1000-inflight budget and starve other cache reads/writes.
//
// Client isolation: name: 'bloom' forces a distinct GlideClient even when bloom_url === cache_url
// (the common single-Valkey case). upsertValkeyClientByUrl includes the name in its dedup key,
// so the two clients never collapse regardless of matching URL/readFrom/inflight values.
// Bloom reads stay on primary because the ready marker and live filter require read-after-write consistency.
// Set VALKEY_BLOOM_URL to a different URL in environments that run a separate Valkey for bloom ops.
const bloomInflight = (() => {
  const parsed = parseInt(process.env.VALKEY_BLOOM_INFLIGHT_REQUESTS_LIMIT ?? '', 10)
  return parsed > 0 ? parsed : undefined
})()

export const BLOOM_VALKEY_READ_FROM = 'primary'

export const bloomValkeyClient = await upsertValkeyClientByUrl(config.bloom_url, {
  name: 'bloom',
  readFrom: BLOOM_VALKEY_READ_FROM,
  inflightRequestsLimit: bloomInflight,
})
