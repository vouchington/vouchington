import { getPostIds } from '../run-services.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { encodeCursor } from '@modules/pagination'
import { seedUuid } from '../seed-data/common.mts'
import type { PostSearchOptions } from '@voucha/types/entities/post-search'

const PAGE_SIZE = 25
const COMMUNITY_IDS = [seedUuid(100, '14'), seedUuid(101, '14')] as const
const POST_SEARCH_QUERY = 'buildPostSearchQuery'
// A full candidate page touches the raw cap+1 prefix, keyed candidate rows and root-eligibility
// rows (1,001 + 1,000 + 1,000); its 25 rows plus one page sentinel (PAGE_SIZE + 1 = 26) fit within it.
const EXPECTED_POST_WORK = 3010

type Scope = 'community' | 'recommendation'
type Sort = 'new' | 'best' | 'hot' | 'trending'

function optionsFor(scope: Scope, sort: Sort): PostSearchOptions {
  return {
    sort,
    time_range: 'all',
    limit: PAGE_SIZE,
    ...(scope === 'community'
      ? { community_id: COMMUNITY_IDS[0] }
      : { post_types: ['topic_recommendation'], topic_recommendation_status: 'pending' }),
  }
}

function registerPostDiscoveryGate(id: string, scope: Scope, sort: Sort, allowEmpty = false): void {
  const indexes =
    scope === 'community'
      ? {
          new: 'posts__default_community_id_id_idx1',
          best: 'posts__default_community_id_votes_score_sort_id_idx',
          hot: 'posts__default_community_id_case_id_idx',
          trending: 'posts__default_community_id_case_id_idx',
        }
      : {
          new: 'posts__default_id_idx7',
          best: 'posts__default_votes_score_sort_id_idx3',
          hot: 'posts__default_post_type_case_id_idx',
          trending: 'posts__default_post_type_case_id_idx',
        }
  registerScenarioContract(id, {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: EXPECTED_POST_WORK },
      { kind: 'maxBitmapIndexRows', max: 1050 },
      { kind: 'usesIndexes', indexes: [indexes[sort]] },
      ...(scope === 'community'
        ? [{ kind: 'maxProcessedRows' as const, relation: 'community_post_reviews', max: 2010 }]
        : [
            {
              kind: 'maxProcessedRows' as const,
              relation: 'post_topic_recommendations',
              max: 2010,
            },
          ]),
    ],
    allowEmptyResult: allowEmpty,
    crossPartition: {
      posts: `${scope} ${sort} discovery traverses the retained post history through a bounded candidate window.`,
    },
  })
}

async function getPage(options: PostSearchOptions) {
  return getPostIds(seedUser, options)
}

async function runCaptured(id: string, options: PostSearchOptions): Promise<void> {
  await runAndCapture(id, () => getPage(options), undefined, POST_SEARCH_QUERY)
}

async function captureScopeSort(scope: Scope, sort: Sort): Promise<void> {
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
      : { ...firstOptions, topic_recommendation_status: 'approved' }
  const empty = await getPage(emptyOptions)
  if (empty.results.length !== 0 || !empty.page_info.has_next_page)
    throw new Error(`${prefix} empty page must expose a bounded candidate continuation`)
  registerPostDiscoveryGate(emptyId, scope, sort, true)
  await runCaptured(emptyId, emptyOptions)
}

export async function runPostDiscoverySearchScenarios(): Promise<void> {
  for (const scope of ['community', 'recommendation'] as const)
    for (const sort of ['new', 'best', 'hot', 'trending'] as const) {
      // no-mistakes-disable-next-line query-reached-per-item: each fixed scope/sort pair needs separate custom and generic plans.
      await captureScopeSort(scope, sort)
    }

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

  const missingCommunityId = 'post-discovery-community-new-missing-parent'
  const missingCommunity = {
    ...optionsFor('community', 'new'),
    community_id: seedUuid(999_999, '14'),
  }
  registerPostDiscoveryGate(missingCommunityId, 'community', 'new', true)
  await runCaptured(missingCommunityId, missingCommunity)

  const exhaustedRecommendationId = 'post-discovery-recommendation-new-exhausted'
  const exhaustedRecommendation: PostSearchOptions = {
    ...optionsFor('recommendation', 'new'),
    after: encodeCursor({ id: seedUuid(45_000, '05') }),
  }
  const exhaustedPage = await getPage(exhaustedRecommendation)
  if (exhaustedPage.results.length !== 0)
    throw new Error('Exhausted recommendation cursor must return no fixture rows')
  registerPostDiscoveryGate(exhaustedRecommendationId, 'recommendation', 'new', true)
  await runCaptured(exhaustedRecommendationId, exhaustedRecommendation)
}
