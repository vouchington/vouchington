import { read } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { getUserProfileMetricsByAny } from '../run-services.mts'

const PROFILE_POST_COUNT_INDEXES = [
  ['idx_posts__created_by_id__is_anonymous__review', 'getUserPostTypeFacetsReview'],
  ['idx_posts__created_by_id__is_anonymous__discussion', 'getUserPostTypeFacetsDiscussion'],
  ['idx_posts__created_by_id__is_anonymous__comment', 'getUserPostTypeFacetsComment'],
] as const

async function profilePostTypeIndexLeaves(indexName: string): Promise<string[]> {
  const { rows } = await read<{ index_name: string }>(
    `/* profilePostTypeIndexLeaves */
     SELECT index_class.relname AS index_name
     FROM pg_partition_tree($1::regclass) tree
     JOIN pg_class index_class ON index_class.oid = tree.relid
     WHERE tree.isleaf`,
    [indexName],
  )
  if (rows.length === 0) throw new Error(`Profile counts need ${indexName}`)
  return rows.map(row => row.index_name)
}

/** Each profile post type is counted on its own author index across id ranges. */
export async function runUserProfileMetricsScenario(): Promise<void> {
  const [reviewIndexes, discussionIndexes, commentIndexes] = await Promise.all(
    PROFILE_POST_COUNT_INDEXES.map(([indexName]) => profilePostTypeIndexLeaves(indexName)),
  )
  registerScenarioContract('user-profile-metrics', {
    expectations: [
      // Saved-post private counts still look up about 5,000 posts.
      { kind: 'maxProcessedRows', relation: 'posts', max: 6_000 },
      {
        kind: 'usesIndexes',
        indexes: reviewIndexes,
        anyOf: true,
        queryContains: PROFILE_POST_COUNT_INDEXES[0][1],
      },
      {
        kind: 'usesIndexes',
        indexes: discussionIndexes,
        anyOf: true,
        queryContains: PROFILE_POST_COUNT_INDEXES[1][1],
      },
      {
        kind: 'usesIndexes',
        indexes: commentIndexes,
        anyOf: true,
        queryContains: PROFILE_POST_COUNT_INDEXES[2][1],
      },
    ],
    crossPartition: {
      posts: "Profile totals count this author's posts of each type across id ranges.",
    },
  })
  await runAndCapture('user-profile-metrics', () =>
    getUserProfileMetricsByAny(seedUser.id, { currentUser: seedUser }),
  )
}
