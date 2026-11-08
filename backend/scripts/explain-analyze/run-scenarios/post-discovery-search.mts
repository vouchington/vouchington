import {
  cleanupPostDiscoverySearchFixture,
  seedPostDiscoverySearchFixture,
} from '../seed-data/post-discovery-search.mts'
import {
  registerPostDiscoveryGate,
  type PostDiscoveryScope,
  type PostDiscoverySort,
} from '../post-discovery-gates.mts'
import { getPostIds } from '../run-services.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runPostDiscoveryUnscopedScenarios } from './post-discovery-unscoped.mts'
import { seedUuid } from '../seed-data/common.mts'
import type { PostSearchOptions } from '@voucha/types/entities/post-search'

const PAGE_SIZE = 25
const COMMUNITY_IDS = [seedUuid(100, '14'), seedUuid(101, '14')] as const
const POST_SEARCH_QUERY = 'buildPostSearchQuery'
// A full candidate page touches the raw cap+1 prefix, keyed candidate rows and root-eligibility
// rows (1,001 + 1,000 + 1,000); its 25 rows plus one page sentinel (PAGE_SIZE + 1 = 26) fit within it.
const EXPECTED_POST_WORK = 3010

function optionsFor(scope: PostDiscoveryScope, sort: PostDiscoverySort): PostSearchOptions {
  return {
    sort,
    time_range: 'all',
    limit: PAGE_SIZE,
    ...(scope === 'community'
      ? { community_id: COMMUNITY_IDS[0] }
      : { post_types: ['topic_recommendation'], topic_recommendation_status: 'pending' }),
  }
}

async function getPage(options: PostSearchOptions) {
  return getPostIds(seedUser, options)
}

async function runCaptured(id: string, options: PostSearchOptions): Promise<void> {
  await runAndCapture(id, () => getPage(options), undefined, POST_SEARCH_QUERY)
}

async function captureScopeSort(scope: PostDiscoveryScope, sort: PostDiscoverySort): Promise<void> {
  const prefix = `post-discovery-${scope}-${sort}`
  const firstOptions = optionsFor(scope, sort)
  const first = await getPage(firstOptions)
  const cursor = first.page_info.end_cursor
  if (!cursor || !first.page_info.has_next_page)
    throw new Error(`${prefix} must produce a continuation cursor`)

  const firstId = `${prefix}-first`
  registerPostDiscoveryGate(firstId, scope, sort)
  await runCaptured(firstId, firstOptions)

  const continuationId = `${prefix}-continuation`
  const continuation = await getPage({ ...firstOptions, after: cursor })
  if (continuation.results.length === 0)
    throw new Error(`${prefix} continuation page must contain a post`)
  registerPostDiscoveryGate(continuationId, scope, sort)
  await runCaptured(continuationId, { ...firstOptions, after: cursor })

  const sparseId = `${prefix}-sparse`
  const sparseOptions: PostSearchOptions =
    scope === 'community'
      ? { ...firstOptions, community_id: COMMUNITY_IDS[1] }
      : { ...firstOptions, topic_recommendation_q: 'post-discovery-fixture-19999' }
  const sparse = await getPage(sparseOptions)
  if (sparse.results.length === 0 || sparse.results.length >= PAGE_SIZE)
    throw new Error(`${prefix} sparse page must contain fewer than one page of posts`)
  registerPostDiscoveryGate(sparseId, scope, sort, true)
  await runCaptured(sparseId, sparseOptions)

  const emptyId = `${prefix}-empty`
  const emptyOptions: PostSearchOptions =
    scope === 'community'
      ? { ...firstOptions, post_types: ['link'] }
      : {
          ...firstOptions,
          topic_recommendation_status: 'approved',
          topic_recommendation_q: 'no-matching-post-discovery-cohort',
        }
  const empty = await getPage(emptyOptions)
  if (empty.results.length !== 0 || !empty.page_info.has_next_page)
    throw new Error(`${prefix} empty page must expose a bounded candidate continuation`)
  registerPostDiscoveryGate(emptyId, scope, sort, true)
  await runCaptured(emptyId, emptyOptions)
}

export async function runPostDiscoverySearchScenarios(): Promise<void> {
  await runPostDiscoveryUnscopedScenarios()

  await captureScopeSort('community', 'new')
  await captureScopeSort('community', 'best')
  await captureScopeSort('community', 'hot')
  await captureScopeSort('community', 'trending')
  await captureScopeSort('recommendation', 'new')
  await captureScopeSort('recommendation', 'best')
  await captureScopeSort('recommendation', 'hot')
  await captureScopeSort('recommendation', 'trending')

  const globalHot = { sort: 'hot', time_range: 'all', limit: PAGE_SIZE } as const
  const globalHotFirst = await getPage(globalHot)
  const globalHotCursor = globalHotFirst.page_info.end_cursor
  if (!globalHotCursor || !globalHotFirst.page_info.has_next_page)
    throw new Error('Global hot fixture must produce a continuation cursor')
  const globalScenarios: readonly [string, PostSearchOptions, string | null][] = [
    ['post-discovery-global-hot-first', globalHot, 'posts__default_case_id_idx'],
    [
      'post-discovery-global-hot-continuation',
      { ...globalHot, after: globalHotCursor },
      'posts__default_case_id_idx',
    ],
    [
      'post-discovery-type-hot-first',
      { ...globalHot, post_types: ['discussion'] },
      'posts__default_post_type_case_id_idx',
    ],
    [
      'post-discovery-mixed-recommendation-new',
      {
        sort: 'new',
        time_range: 'all',
        limit: PAGE_SIZE,
        post_types: ['discussion', 'topic_recommendation'],
      },
      null,
    ],
    [
      'post-discovery-mixed-recommendation-best',
      {
        sort: 'best',
        time_range: 'all',
        limit: PAGE_SIZE,
        post_types: ['discussion', 'topic_recommendation'],
      },
      null,
    ],
  ]
  for (const [id, options, index] of globalScenarios) {
    registerScenarioContract(id, {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'posts', max: EXPECTED_POST_WORK },
        { kind: 'maxBitmapIndexRows', max: 1050 },
        ...(index ? [{ kind: 'usesIndexes' as const, indexes: [index] }] : []),
      ],
      crossPartition: {
        posts:
          'Global post discovery traverses the retained post history through a bounded candidate window.',
      },
    })
    // no-mistakes-disable-next-line query-reached-per-item: each fixed global/type case needs its own production query plan.
    await runCaptured(id, options)
  }
}

export async function runPostDiscoveryFixtureScenarios(): Promise<void> {
  await cleanupPostDiscoverySearchFixture()
  try {
    await seedPostDiscoverySearchFixture()
    await runPostDiscoverySearchScenarios()
  } finally {
    await cleanupPostDiscoverySearchFixture()
  }
}
