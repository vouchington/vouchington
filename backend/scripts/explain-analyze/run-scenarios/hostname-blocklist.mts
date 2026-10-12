import { urlBlocklistBatchesFromDb } from '@services/urls-domains-blacklist/bloom-filter-batches'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { BLOOM_REPAIR_SEED_ROW_COUNT } from '../seed-data/bloom-reconciliation.mts'
import { HOSTNAME_FLAG_SEED_ROW_COUNT } from '../seed-data/hostname-flags.mts'

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
}

registerScenarioContract('url-blocklist-hostnames', {
  expectations: [
    {
      kind: 'usesIndexes',
      indexes: ['idx_url_hostnames__blocked', 'idx_url_hostnames__not_crawlable'],
    },
    // The URL policy projects each Bloom-repair source hostname into is_blocked. The index scans
    // must process only those source hosts and the eleven flag hosts, plus one overlap filtered by
    // the not-crawlable branch, never the thousands of otherwise unblocked seeded hostnames.
    {
      kind: 'maxProcessedRows',
      relation: 'url_hostnames',
      max: BLOOM_REPAIR_SEED_ROW_COUNT + HOSTNAME_FLAG_SEED_ROW_COUNT + 1,
    },
  ],
})
