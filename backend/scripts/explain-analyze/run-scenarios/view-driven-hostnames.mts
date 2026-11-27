import { encodeCursor } from '@modules/pagination'
import { runAndCapture, seedParentTopicId, seedTopicId } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import { searchBlockedHostnames, searchUrlHostnames } from '@services/urls-hostnames/search'

// This seeded substring matches 111 of the 1,000 hostnames, leaving enough rows for a second page.
const hostnameTextQuery = 'host-2'
const hostnameLowSelectivityQuery = 'com'
const hostnameTextPageLimit = 25

export async function runViewDrivenHostnameScenarios(): Promise<void> {
  registerScenarioContract('search-hostnames-trust', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_url_hostnames__listed_votes_score_sort__id'] },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 100 },
    ],
  })
  registerScenarioContract('search-hostnames-trust-by-topic', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_url_hostnames__topic_id__votes_score_sort__id'] },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 100 },
    ],
  })
  await runAndCapture('search-hostnames-trust', () =>
    searchUrlHostnames({ sort: 'trust', is_blocked: false, limit: 25 }),
  )
  await runAndCapture('search-hostnames-trust-by-topic', () =>
    searchUrlHostnames({ sort: 'trust', is_blocked: false, topic_id: seedTopicId, limit: 25 }),
  )
  registerScenarioContract('search-hostnames-topic-match-all', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_url_hostnames__topic_id__votes_score_sort__id'] },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 100 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 3 },
      { kind: 'maxProcessedRows', relation: 'relation__topic__parent__topic', max: 2 },
    ],
  })
  await runAndCapture('search-hostnames-topic-match-all', async () => {
    const page = await searchUrlHostnames({
      sort: 'trust',
      topic_ids: [seedTopicId, seedParentTopicId],
      topic_match: 'all',
      include_descendants: true,
      limit: 25,
    })
    if (!page.results.some(hostname => hostname.id === seedUuid(0, '02')))
      throw new Error('All-of hostname descendant search omitted the seeded child hostname')
  })
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
  registerScenarioContract('url-hostname-search-text-low-selectivity', {
    expectations: [
      { kind: 'queryBinds', token: 'candidate_hostnames' },
      {
        kind: 'usesIndexes',
        indexes: ['idx_url_hostnames__hostname_trgm', 'url_hostnames_hostname_key'],
        anyOf: true,
      },
      { kind: 'noSeqScan', relation: 'url_hostnames' },
    ],
  })
  await runAndCapture('url-hostname-search-text-low-selectivity', async () => {
    const page = await searchUrlHostnames({
      query: hostnameLowSelectivityQuery,
      limit: hostnameTextPageLimit,
    })
    if (
      page.results.length !== hostnameTextPageLimit ||
      !page.page_info.has_next_page ||
      !page.page_info.end_cursor
    ) {
      throw new Error('Seeded low-selectivity hostname search has no full first page')
    }
  })
  // seed-host-100.example.com sits >2,000 rows deep in the .com match set (after all 2,006
  // seed-crawl-sweep-* and 11 seed-flags-* rows) with >800 .com rows still following it.
  const lowSelectivityDeepCursor = encodeCursor({
    name: 'seed-host-100.example.com',
    id: seedUuid(100, '02'),
  })
  registerScenarioContract('url-hostname-search-text-low-selectivity-deep-cursor', {
    expectations: [
      { kind: 'queryBinds', token: 'candidate_hostnames' },
      {
        kind: 'usesIndexes',
        indexes: ['idx_url_hostnames__hostname_trgm', 'url_hostnames_hostname_key'],
        anyOf: true,
      },
      { kind: 'noSeqScan', relation: 'url_hostnames' },
      // Custom uses BitmapAnd(hostname_key, hostname_trgm) (~1,040 rows); generic uses hostname_trgm (~3,082 rows, vs 6,064 before).
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 3_700 },
    ],
  })
  await runAndCapture('url-hostname-search-text-low-selectivity-deep-cursor', async () => {
    const page = await searchUrlHostnames({
      query: hostnameLowSelectivityQuery,
      limit: hostnameTextPageLimit,
      after: lowSelectivityDeepCursor,
    })
    if (
      page.results.length !== hostnameTextPageLimit ||
      !page.page_info.has_next_page ||
      !page.page_info.end_cursor
    ) {
      throw new Error('Seeded low-selectivity hostname deep cursor has no full continuation page')
    }
  })
}
