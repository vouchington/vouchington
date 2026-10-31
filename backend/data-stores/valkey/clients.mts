import '@data-stores/valkey-core/app-integration'

import {
  cacheValkeyClient,
  dynamicConfigValkeyClient,
  getValkeyClientByUrl,
  rateLimiterValkeyClient,
} from 'valkyries'
import { config } from '@data-stores/valkey-core/config'

export { cacheValkeyClient, dynamicConfigValkeyClient, rateLimiterValkeyClient }

export const sessionValkeyClient = getValkeyClientByUrl(config.session_url, {
  readFrom: 'primary',
})

// DynamicConfig normally prefers replicas for feature-flag reads. Moderation configuration reads
// use this isolated primary client for current values even when the endpoint is shared.
export const DYNAMIC_CONFIG_PRIMARY_READ_FROM = 'primary'

export const dynamicConfigPrimaryValkeyClient = getValkeyClientByUrl(config.dynamic_config_url, {
  name: 'dynamic-config-primary',
  readFrom: DYNAMIC_CONFIG_PRIMARY_READ_FROM,
})

// Creation leases share the noeviction worker-queue server, but not a queue command connection.
// The registered client is closed by the Valkey shutdown owner after workers drain.
export const embeddingCreationLeaseValkeyClient = getValkeyClientByUrl(config.worker_queue_url, {
  name: 'embedding-creation-lease',
  readFrom: 'primary',
})

// Dedicated GlideClient for all ValkeyBloomFilter operations.
// Routes bloom-filter traffic (BF.MADD, BF.MEXISTS, atomic RENAME, ready-marker set/unlink)
// off cacheValkeyClient so bloom rebuilds — which can issue O(rows/5k) commands per job — do
// not exhaust cacheValkeyClient's 1000-inflight budget and starve other cache reads/writes.
//
// Client isolation: name: 'bloom' forces a distinct GlideClient even when bloom_url === cache_url
// (the common single-Valkey case). getValkeyClientByUrl includes the name in its dedup key,
// so the two clients never collapse regardless of matching URL/readFrom/inflight values.
// Bloom reads stay on primary because the ready marker and live filter require read-after-write consistency.
// Set VALKEY_BLOOM_URL to a different URL in environments that run a separate Valkey for bloom ops.
const bloomInflight = (() => {
  const parsed = parseInt(process.env.VALKEY_BLOOM_INFLIGHT_REQUESTS_LIMIT ?? '', 10)
  return parsed > 0 ? parsed : undefined
})()

export const BLOOM_VALKEY_READ_FROM = 'primary'

export const bloomValkeyClient = getValkeyClientByUrl(config.bloom_url, {
  name: 'bloom',
  readFrom: BLOOM_VALKEY_READ_FROM,
  inflightRequestsLimit: bloomInflight,
})
