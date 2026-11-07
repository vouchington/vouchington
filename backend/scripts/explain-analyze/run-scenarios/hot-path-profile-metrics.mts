import { read } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { getUserProfileMetricsByAny } from '../run-services.mts'

const PROFILE_POST_COUNT_QUERIES = [
  'getUserPostTypeFacetsReview',
  'getUserPostTypeFacetsDiscussion',
  'getUserPostTypeFacetsComment',
] as const

async function profilePostTypeIndexLeaves(): Promise<
  Record<'review' | 'discussion' | 'comment', string[]>
> {
  const { rows } = await read<{
    post_type: 'review' | 'discussion' | 'comment'
    index_name: string
  }>(
    `/* profilePostTypeIndexLeaves */
     SELECT 'review' AS post_type, index_class.relname AS index_name
     FROM pg_partition_tree('idx_posts__created_by_id__is_anonymous__review'::regclass) tree
     JOIN pg_class index_class ON index_class.oid = tree.relid
     WHERE tree.isleaf
     UNION ALL
     SELECT 'discussion', index_class.relname
     FROM pg_partition_tree('idx_posts__created_by_id__is_anonymous__discussion'::regclass) tree
     JOIN pg_class index_class ON index_class.oid = tree.relid
     WHERE tree.isleaf
     UNION ALL
     SELECT 'comment', index_class.relname
     FROM pg_partition_tree('idx_posts__created_by_id__is_anonymous__comment'::regclass) tree
     JOIN pg_class index_class ON index_class.oid = tree.relid
     WHERE tree.isleaf`,
  )
  const leaves = {
    review: rows.filter(row => row.post_type === 'review').map(row => row.index_name),
    discussion: rows.filter(row => row.post_type === 'discussion').map(row => row.index_name),
    comment: rows.filter(row => row.post_type === 'comment').map(row => row.index_name),
  }
  for (const postType of ['review', 'discussion', 'comment'] as const) {
    if (leaves[postType].length === 0) {
      throw new Error(`Profile counts need the ${postType} index leaves`)
    }
  }
  return leaves
}

/** Each profile post type is counted on its own author index across id ranges. */
export async function runUserProfileMetricsScenario(): Promise<void> {
  const indexLeaves = await profilePostTypeIndexLeaves()
  registerScenarioContract('user-profile-metrics', {
    expectations: [
      // Saved-post private counts still look up about 5,000 posts.
      { kind: 'maxProcessedRows', relation: 'posts', max: 6_000 },
      {
        kind: 'usesIndexes',
        indexes: indexLeaves.review,
        anyOf: true,
        queryContains: PROFILE_POST_COUNT_QUERIES[0],
      },
      {
        kind: 'usesIndexes',
        indexes: indexLeaves.discussion,
        anyOf: true,
        queryContains: PROFILE_POST_COUNT_QUERIES[1],
      },
      {
        kind: 'usesIndexes',
        indexes: indexLeaves.comment,
        anyOf: true,
        queryContains: PROFILE_POST_COUNT_QUERIES[2],
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
