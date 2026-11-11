import { registerScenarioContract } from './plan-expectations.mts'
import { partitionIndexLeaves, postIdOrderLeaves } from './partition-index-leaves.mts'
import { POST_DISCOVERY_FIXTURE_SEEDED_ROWS } from './post-discovery-seeded-rows.mts'

export type PostDiscoveryScope = 'community' | 'recommendation'
export type PostDiscoverySort = 'new' | 'best' | 'hot' | 'trending'

const POST_CAP = 1200
const SIDE_CAP = 720

const INDEX_BY_SCOPE: Record<PostDiscoveryScope, Record<PostDiscoverySort, string>> = {
  community: {
    new: 'idx_posts__community_id',
    best: 'idx_posts__community_id__votes_score_sort__id',
    hot: 'idx_posts__community_id__stable_hot_rank__id',
    trending: 'idx_posts__community_id__stable_hot_rank__id',
  },
  recommendation: {
    new: 'idx_posts__post_type__id',
    best: 'idx_posts__post_type__votes_score_sort__id',
    hot: 'idx_posts__post_type__stable_hot_rank__id',
    trending: 'idx_posts__post_type__stable_hot_rank__id',
  },
}

export async function registerPostDiscoveryGate(
  id: string,
  scope: PostDiscoveryScope,
  sort: PostDiscoverySort,
  allowEmpty = false,
): Promise<void> {
  const leaves = await partitionIndexLeaves(INDEX_BY_SCOPE[scope][sort])
  registerScenarioContract(id, {
    seededRows: POST_DISCOVERY_FIXTURE_SEEDED_ROWS,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: POST_CAP },
      {
        kind: 'usesIndexes',
        indexes: leaves,
        anyOf: true,
      },
      ...(scope === 'community'
        ? [{ kind: 'maxProcessedRows' as const, relation: 'community_post_reviews', max: SIDE_CAP }]
        : [
            {
              kind: 'maxProcessedRows' as const,
              relation: 'post_topic_recommendations',
              max: SIDE_CAP,
            },
          ]),
    ],
    allowEmptyResult: allowEmpty,
    crossPartition: {
      posts: `${scope} ${sort} discovery walks the sort key across retained post history.`,
    },
  })
}

export function registerNamedPostIndexExpectations(
  id: string,
  leaves: readonly string[],
  options: { allowEmpty?: boolean; follows?: boolean; rowCap?: number | null } = {},
): void {
  const rowCap = options.rowCap === undefined ? POST_CAP : options.rowCap
  registerScenarioContract(id, {
    seededRows: POST_DISCOVERY_FIXTURE_SEEDED_ROWS,
    expectations: [
      ...(rowCap === null
        ? []
        : [{ kind: 'maxProcessedRows' as const, relation: 'posts', max: rowCap }]),
      ...(leaves.length > 0
        ? [{ kind: 'usesIndexes' as const, indexes: leaves, anyOf: true }]
        : []),
      ...(options.follows
        ? [
            {
              kind: 'maxProcessedRows' as const,
              relation: 'relation__user__follow__user',
              max: POST_CAP,
            },
          ]
        : []),
    ],
    allowEmptyResult: options.allowEmpty === true,
    crossPartition: {
      posts: 'Unscoped post search walks the sort key across retained post history.',
    },
  })
}

export async function registerNamedPostIndexGate(
  id: string,
  indexName: string,
  options: { allowEmpty?: boolean; follows?: boolean; rowCap?: number | null } = {},
): Promise<void> {
  const leaves =
    indexName === ''
      ? []
      : indexName === 'posts_pkey'
        ? await postIdOrderLeaves()
        : await partitionIndexLeaves(indexName)
  registerNamedPostIndexExpectations(id, leaves, options)
}
