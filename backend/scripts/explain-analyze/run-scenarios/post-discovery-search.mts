import { encodeCursor } from '@modules/pagination'
import { postSearchCursorScope } from '@services/posts/search/get-ids-cursor'
import { partitionIndexLeaves } from '../partition-index-leaves.mts'
import {
  registerNamedPostIndexExpectations,
  registerPostDiscoveryGate,
  type PostDiscoveryScope,
  type PostDiscoverySort,
} from '../post-discovery-gates.mts'
import { getPostIds } from '../run-services.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { runPostDiscoveryUnscopedScenarios } from './post-discovery-unscoped.mts'
import { seedUuid } from '../seed-data/common.mts'
import type { PostSearchOptions } from '@voucha/types/entities/post-search'

const PAGE_SIZE = 25
const COMMUNITY_IDS = [seedUuid(100, '14'), seedUuid(101, '14')] as const
const POST_SEARCH_QUERY = 'buildPostSearchQuery'
const EMPTY_CURSOR_ID = '00000000-0000-0000-0000-000000000000'
// Ordinal 599 of the 600-row recommendation cohort is pending and not deleted.
const SPARSE_RECOMMENDATION_QUERY = 'post-discovery-fixture-599'

function exhaustedCommunityCursor(sort: PostDiscoverySort): string {
  const scope = postSearchCursorScope(sort, 'all')
  if (sort === 'new') return encodeCursor({ id: EMPTY_CURSOR_ID, scope })
  return encodeCursor({ id: EMPTY_CURSOR_ID, score: -1e300, scope })
}

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
  await registerPostDiscoveryGate(firstId, scope, sort)
  await runCaptured(firstId, firstOptions)

  const continuationId = `${prefix}-continuation`
  const continuation = await getPage({ ...firstOptions, after: cursor })
  if (continuation.results.length === 0)
    throw new Error(`${prefix} continuation page must contain a post`)
  await registerPostDiscoveryGate(continuationId, scope, sort)
  await runCaptured(continuationId, { ...firstOptions, after: cursor })

  const sparseId = `${prefix}-sparse`
  const sparseOptions: PostSearchOptions =
    scope === 'community'
      ? { ...firstOptions, community_id: COMMUNITY_IDS[1] }
      : { ...firstOptions, topic_recommendation_q: SPARSE_RECOMMENDATION_QUERY }
  const sparse = await getPage(sparseOptions)
  if (sparse.results.length === 0 || sparse.results.length >= PAGE_SIZE)
    throw new Error(`${prefix} sparse page must contain fewer than one page of posts`)
  await registerPostDiscoveryGate(sparseId, scope, sort, true)
  await runCaptured(sparseId, sparseOptions)

  const emptyId = `${prefix}-empty`
  const emptyOptions: PostSearchOptions =
    scope === 'community'
      ? { ...firstOptions, after: exhaustedCommunityCursor(sort) }
      : {
          ...firstOptions,
          topic_recommendation_status: 'approved',
          topic_recommendation_q: 'no-matching-post-discovery-cohort',
        }
  const empty = await getPage(emptyOptions)
  if (empty.results.length !== 0 || empty.page_info.has_next_page || empty.page_info.end_cursor)
    throw new Error(`${prefix} empty page must be exhausted`)
  await registerPostDiscoveryGate(emptyId, scope, sort, true)
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
  const globalScenarios: readonly [string, PostSearchOptions, string][] = [
    ['post-discovery-global-hot-first', globalHot, 'idx_posts__stable_hot_rank__id'],
    [
      'post-discovery-global-hot-continuation',
      { ...globalHot, after: globalHotCursor },
      'idx_posts__stable_hot_rank__id',
    ],
    [
      'post-discovery-type-hot-first',
      { ...globalHot, post_types: ['discussion'] },
      'idx_posts__post_type__stable_hot_rank__id',
    ],
    [
      'post-discovery-mixed-recommendation-new',
      {
        sort: 'new',
        time_range: 'all',
        limit: PAGE_SIZE,
        post_types: ['discussion', 'topic_recommendation'],
      },
      'idx_posts__post_type__id',
    ],
    [
      'post-discovery-mixed-recommendation-best',
      {
        sort: 'best',
        time_range: 'all',
        limit: PAGE_SIZE,
        post_types: ['discussion', 'topic_recommendation'],
      },
      'idx_posts__post_type__votes_score_sort__id',
    ],
  ]
  const [globalHotLeaves, typeHotLeaves, typeNewLeaves, typeBestLeaves] = await Promise.all([
    partitionIndexLeaves('idx_posts__stable_hot_rank__id'),
    partitionIndexLeaves('idx_posts__post_type__stable_hot_rank__id'),
    partitionIndexLeaves('idx_posts__post_type__id'),
    partitionIndexLeaves('idx_posts__post_type__votes_score_sort__id'),
  ])
  const leavesByIndex = new Map<string, readonly string[]>([
    ['idx_posts__stable_hot_rank__id', globalHotLeaves],
    ['idx_posts__post_type__stable_hot_rank__id', typeHotLeaves],
    ['idx_posts__post_type__id', typeNewLeaves],
    ['idx_posts__post_type__votes_score_sort__id', typeBestLeaves],
  ])
  for (const [id, options, indexName] of globalScenarios) {
    const leaves = leavesByIndex.get(indexName)
    if (!leaves) throw new Error(`${indexName} was not loaded before discovery registration`)
    registerNamedPostIndexExpectations(id, leaves)
    // no-mistakes-disable-next-line query-reached-per-item: each fixed global/type case needs its own production query plan.
    await runCaptured(id, options)
  }
}
