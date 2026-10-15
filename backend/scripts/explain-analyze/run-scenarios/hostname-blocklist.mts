import { urlBlocklistBatchesFromDb } from '@services/urls-domains-blacklist/bloom-filter-batches'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { BLOOM_REPAIR_SEED_ROW_COUNT } from '../seed-data/bloom-reconciliation.mts'
import {
  HOSTNAME_FLAG_SEED_ROW_COUNT,
  seedHostnameCacheInvalidationWork,
} from '../seed-data/hostname-flags.mts'
import { drainHostnameCacheInvalidationWork } from '@services/entity-cache/hostname-invalidation-drain'

export async function runHostnameBlocklistScenario(): Promise<void> {
  await runAndCapture(
    'url-blocklist-hostnames',
    async () => {
      const found: string[] = []
      for await (const batch of urlBlocklistBatchesFromDb())
        found.push(...batch.filter(hostname => /^seed-flags-\d+\.example\.com$/.test(hostname)))
      if (found.length !== 11 || new Set(found).size !== 11)
        throw new Error('Blocklist fixture must emit each flagged hostname exactly once')
    },
    undefined,
    'urlBlocklistBatchesFromDb:hostnames',
  )
  await runAndCapture(
    'hostname-cache-invalidation-claim',
    async () => {
      // Capture the production claim over 20k work rows without doing real cache work.
      const claimed = await drainHostnameCacheInvalidationWork({ evict: async () => {} })
      if (claimed !== 500)
        throw new Error(`Expected one full cache-invalidation page; got ${claimed}`)
    },
    undefined,
    'drainHostnameCacheInvalidationWork:claim',
    { afterCapture: seedHostnameCacheInvalidationWork },
  )
}

registerScenarioContract('url-blocklist-hostnames', {
  expectations: [
    {
      kind: 'usesIndexes',
      indexes: ['idx_url_hostname_blocks__active_nonfeed'],
    },
    // URL-source domains are already streamed from blocklisted_domains. The hostname branch
    // visits independent block history and non-crawlable hosts, not the projected URL-feed rows.
    {
      kind: 'maxProcessedRows',
      relation: 'url_hostnames',
      max: BLOOM_REPAIR_SEED_ROW_COUNT + HOSTNAME_FLAG_SEED_ROW_COUNT + 1,
    },
    {
      kind: 'maxProcessedRows',
      relation: 'url_hostname_blocks',
      max: BLOOM_REPAIR_SEED_ROW_COUNT + HOSTNAME_FLAG_SEED_ROW_COUNT + 1,
    },
  ],
})

registerScenarioContract('hostname-cache-invalidation-claim', {
  expectations: [
    { kind: 'usesIndexes', indexes: ['idx_url_hostname_cache_invalidation_work_items__available'] },
    { kind: 'usesIndexes', indexes: ['url_hostname_cache_invalidation_work_items_pkey'] },
    { kind: 'maxProcessedRows', relation: 'url_hostname_cache_invalidation_work_items', max: 1000 },
    { kind: 'queryBinds', token: 'LIMIT' },
  ],
  seededRows: { url_hostname_cache_invalidation_work_items: 20_000 },
})
