import assert from 'node:assert/strict'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { searchWeb } from '../run-services.mts'

const PAGE_LIMIT = 25

/** `seed` appears in every seeded chunk, so the ranked chunk input is the whole seeded corpus. */
export async function runWebSearchScenarios(): Promise<void> {
  registerScenarioContract('web-search-common-term', {
    expectations: [{ kind: 'queryBinds', token: 'LIMIT' }],
    crossPartition: {
      crawl_chunks: 'A common term matches chunks across every crawl in the recency window.',
      crawls: 'The recency window spans many crawl id ranges.',
    },
  })
  await runAndCapture('web-search-common-term', async () => {
    const page = await searchWeb({ query: 'seed', limit: PAGE_LIMIT })
    assert.equal(page.results.length, PAGE_LIMIT)
  })
}
