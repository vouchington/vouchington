import { urlBlocklistBatchesFromDb } from '@services/urls-domains-blacklist/bloom-filter-batches'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

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
    // Eleven results plus the one overlapping row scanned and filtered by the second branch.
    { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 15 },
  ],
})
