import { runAndCapture, seedTopicId } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { searchTopHostnames } from '../../../services/urls-hostnames/search-top.mts'
import {
  searchBlockedHostnames,
  searchUrlHostnames,
} from '../../../services/urls-hostnames/search.mts'

export async function runViewDrivenHostnameScenarios(): Promise<void> {
  registerScenarioContract('search-top-hostnames', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_url_hostnames__top_sort'] },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 100 },
    ],
  })
  registerScenarioContract('search-top-hostnames-by-topic', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_url_hostnames__top_sort_by_topic'] },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 100 },
    ],
  })
  await runAndCapture('search-top-hostnames', () => searchTopHostnames({ limit: 25 }))
  await runAndCapture('search-top-hostnames-by-topic', () =>
    searchTopHostnames({ topic_id: seedTopicId, limit: 25 }),
  )
  registerScenarioContract('search-blocked-hostnames', {
    expectations: [
      { kind: 'queryBinds', token: 'candidate_hostnames' },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 100 },
    ],
  })
  await runAndCapture('search-blocked-hostnames', () => searchBlockedHostnames({ limit: 25 }))
  registerScenarioContract('url-hostname-search-text', {
    expectations: [
      { kind: 'queryBinds', token: 'candidate_hostnames' },
      { kind: 'usesIndexes', indexes: ['idx_url_hostnames__hostname_trgm'] },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 2432 },
    ],
  })
  let textCursor: string | undefined
  await runAndCapture('url-hostname-search-text', async () => {
    const page = await searchUrlHostnames({ query: 'seed-host-', limit: 25 })
    textCursor = page.page_info.end_cursor ?? undefined
  })
  if (!textCursor) throw new Error('Seeded hostname text search has no continuation cursor')
  registerScenarioContract('url-hostname-search-text-cursor', {
    expectations: [
      { kind: 'queryBinds', token: 'candidate_hostnames' },
      { kind: 'usesIndexes', indexes: ['idx_url_hostnames__hostname_trgm'] },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 2432 },
    ],
  })
  await runAndCapture('url-hostname-search-text-cursor', () =>
    searchUrlHostnames({ query: 'seed-host-', limit: 25, after: textCursor }),
  )
}
