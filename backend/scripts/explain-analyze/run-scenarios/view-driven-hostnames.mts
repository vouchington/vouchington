import { runAndCapture, seedTopicId } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { searchTopHostnames } from '@services/urls-hostnames/search-top'
import { searchBlockedHostnames, searchUrlHostnames } from '@services/urls-hostnames/search'

// This seeded substring matches 111 of the 1,000 hostnames, leaving enough rows for a second page.
const hostnameTextQuery = 'host-2'
const hostnameTextPageLimit = 25

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
    const page = await searchUrlHostnames({
      query: hostnameTextQuery,
      limit: hostnameTextPageLimit,
    })
    if (
      page.results.length !== hostnameTextPageLimit ||
      !page.page_info.has_next_page ||
      !page.page_info.end_cursor
    ) {
      throw new Error('Seeded hostname text search has no full first page and continuation cursor')
    }
    textCursor = page.page_info.end_cursor
  })
  if (!textCursor) throw new Error('Seeded hostname text search has no continuation cursor')
  registerScenarioContract('url-hostname-search-text-cursor', {
    expectations: [
      { kind: 'queryBinds', token: 'candidate_hostnames' },
      { kind: 'usesIndexes', indexes: ['idx_url_hostnames__hostname_trgm'] },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 2432 },
    ],
  })
  await runAndCapture('url-hostname-search-text-cursor', async () => {
    const page = await searchUrlHostnames({
      query: hostnameTextQuery,
      limit: hostnameTextPageLimit,
      after: textCursor,
    })
    if (
      page.results.length !== hostnameTextPageLimit ||
      !page.page_info.has_next_page ||
      !page.page_info.end_cursor
    ) {
      throw new Error('Seeded hostname text search cursor has no full continuation page')
    }
  })
}
