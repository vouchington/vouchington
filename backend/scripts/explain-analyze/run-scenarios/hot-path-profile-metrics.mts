import assert from 'node:assert/strict'
import { read, write } from '@data-stores/psql'
import { getUserPostTypeFacets } from '@services/posts/search/get-facets'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { getPrivateUserByAny, getUserProfileMetricsByAny } from '../run-services.mts'
import {
  PROFILE_POST_COUNTS_AUTHOR_ID,
  PROFILE_POST_COUNT_PER_TYPE,
  cleanupProfilePostCounts,
  seedProfilePostCounts,
} from '../seed-data/profile-post-counts.mts'

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
  await runProfilePostTypeCountsScenario()
}

async function runProfilePostTypeCountsScenario(): Promise<void> {
  try {
    await seedProfilePostCounts()
    // Refresh every relation in the publication eligibility predicate, including dormant branches.
    await write(`/* analyzeProfilePostCounts */ ANALYZE
      posts, user_suspensions, communities, community_post_reviews, community_members,
      relation__user__follow__user, story_posts, stories, rss_feed_items,
      rss_feed_item_sources, rss_feeds`)
    const author = await getPrivateUserByAny(PROFILE_POST_COUNTS_AUTHOR_ID)
    assert(author, 'The scale profile author must exist')
    const indexLeaves = await profilePostTypeIndexLeaves()
    registerScenarioContract('profile-post-type-counts', {
      expectations: [
        // Each type visits 2,000 candidates and their keyed thread roots, not all 6,000 posts.
        { kind: 'maxProcessedRows', relation: 'posts', max: 5_000 },
        { kind: 'maxBitmapIndexRows', max: 2_500 },
        ...(['review', 'discussion', 'comment'] as const).map((postType, index) => ({
          kind: 'usesIndexes' as const,
          indexes: indexLeaves[postType],
          anyOf: true,
          queryContains: PROFILE_POST_COUNT_QUERIES[index],
        })),
      ],
      forbidSequentialScans: ['posts'],
      crossPartition: {
        posts: "The scale profile counts this author's exact totals across all post id ranges.",
      },
    })
    await runAndCapture('profile-post-type-counts', async () => {
      const counts = await getUserPostTypeFacets(author.id, author)
      assert.deepEqual(counts, {
        review: PROFILE_POST_COUNT_PER_TYPE,
        discussion: PROFILE_POST_COUNT_PER_TYPE,
        comment: PROFILE_POST_COUNT_PER_TYPE,
      })
    })
  } finally {
    await cleanupProfilePostCounts()
  }
}
