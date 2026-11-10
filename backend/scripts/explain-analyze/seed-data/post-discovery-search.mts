import { beginTransaction } from '@data-stores/psql'
import { seedPosts } from './posts.mts'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

const START_INDEX = 100_000
const COMMUNITY_POSTS_PER_COMMUNITY = 10_000
// Sparse community approval is a residual review lookup, so the cohort stays under both caps.
const SPARSE_COMMUNITY_POSTS = 400
const RECOMMENDATION_COUNT = 600
const COMMUNITY_COUNT = 2
const CLEANUP_BATCH_SIZE = 500

// Tombstone one quarter of each cohort, but keep every 200th ordinal as a status witness.

function fixturePostId(index: number): string {
  return seedUuidAtTimestamp(postSeedTimestampMs(0) + 1000, index)
}

export async function seedPostDiscoverySearchFixture(): Promise<void> {
  console.log('Seeding the post-discovery search cohort...')
  await seedPosts(
    COMMUNITY_POSTS_PER_COMMUNITY * COMMUNITY_COUNT + RECOMMENDATION_COUNT,
    START_INDEX,
    index =>
      index < START_INDEX + COMMUNITY_POSTS_PER_COMMUNITY * COMMUNITY_COUNT
        ? 'discussion'
        : 'topic_recommendation',
    fixturePostId,
  )

  const communityIds = Array.from({ length: COMMUNITY_COUNT }, (_, index) =>
    seedUuid(100 + index, '14'),
  )
  const communityPostIds = Array.from(
    { length: COMMUNITY_POSTS_PER_COMMUNITY * COMMUNITY_COUNT },
    (_, index) => fixturePostId(START_INDEX + index),
  )
  const recommendationPostIds = Array.from({ length: RECOMMENDATION_COUNT }, (_, index) =>
    fixturePostId(START_INDEX + COMMUNITY_POSTS_PER_COMMUNITY * COMMUNITY_COUNT + index),
  )

  await using transaction = await beginTransaction()
  await transaction(
    `/* seedPostDiscoverySearchFixture:communities */
     INSERT INTO communities (id, name, slug, created_by_id, created_via)
     SELECT id, 'Post Discovery Fixture ' || ordinal, 'post-discovery-fixture-' || ordinal,
       $1::uuid, 'system'
     FROM UNNEST($2::uuid[]) WITH ORDINALITY AS fixture(id, ordinal)
     ON CONFLICT DO NOTHING`,
    [seedUuid(0, '01'), communityIds],
  )
  await transaction(
    `/* seedPostDiscoverySearchFixture:community-posts */
     UPDATE posts post SET community_id = CASE
         WHEN fixture.ordinal <= $4::int THEN $2::uuid
         WHEN fixture.ordinal <= $5::int THEN $3::uuid
         ELSE NULL
       END,
       votes_score_up = CASE WHEN fixture.ordinal <= $4::int OR fixture.ordinal % 2_000 = 0
         THEN 100 ELSE 1 + (fixture.ordinal % 100) END,
       deleted_at = CASE
         WHEN fixture.ordinal % 4 = 1 AND fixture.ordinal % 200 <> 0
           THEN COALESCE(post.deleted_at, CURRENT_TIMESTAMP)
         ELSE post.deleted_at
       END,
       deleted_by_id = CASE
         WHEN fixture.ordinal % 4 = 1 AND fixture.ordinal % 200 <> 0
           THEN COALESCE(post.deleted_by_id, $6::uuid)
         ELSE post.deleted_by_id
       END
     FROM UNNEST($1::uuid[]) WITH ORDINALITY AS fixture(post_id, ordinal)
     WHERE post.id = fixture.post_id`,
    [
      communityPostIds,
      communityIds[0],
      communityIds[1],
      COMMUNITY_POSTS_PER_COMMUNITY,
      COMMUNITY_POSTS_PER_COMMUNITY + SPARSE_COMMUNITY_POSTS,
      seedUuid(0, '01'),
    ],
  )
  await transaction(
    `/* seedPostDiscoverySearchFixture:community-reviews */
     INSERT INTO community_post_reviews
       (community_id, post_id, submitted_by_id, reviewed_at, reviewed_by_id, approved_at)
     SELECT fixture.community_id, fixture.post_id, $3::uuid,
       CASE WHEN fixture.ordinal <= $4::int OR fixture.ordinal % 80 = 0 THEN CURRENT_TIMESTAMP END,
       CASE WHEN fixture.ordinal <= $4::int OR fixture.ordinal % 80 = 0 THEN $3::uuid END,
       CASE WHEN fixture.ordinal <= $4::int OR fixture.ordinal % 80 = 0 THEN CURRENT_TIMESTAMP END
     FROM UNNEST($1::uuid[], $2::uuid[]) WITH ORDINALITY AS fixture(post_id, community_id, ordinal)
     ON CONFLICT (post_id) DO NOTHING`,
    [
      communityPostIds.slice(0, COMMUNITY_POSTS_PER_COMMUNITY + SPARSE_COMMUNITY_POSTS),
      communityPostIds
        .slice(0, COMMUNITY_POSTS_PER_COMMUNITY + SPARSE_COMMUNITY_POSTS)
        .map((_, index) => communityIds[index < COMMUNITY_POSTS_PER_COMMUNITY ? 0 : 1]),
      seedUuid(0, '01'),
      COMMUNITY_POSTS_PER_COMMUNITY,
    ],
  )
  await transaction(
    `/* seedPostDiscoverySearchFixture:recommendations */
     UPDATE posts SET votes_score_up = 1 + (fixture.ordinal % 100),
       deleted_at = CASE
         WHEN fixture.ordinal % 4 = 1 AND fixture.ordinal % 200 <> 0
           THEN COALESCE(posts.deleted_at, CURRENT_TIMESTAMP)
         ELSE posts.deleted_at
       END,
       deleted_by_id = CASE
         WHEN fixture.ordinal % 4 = 1 AND fixture.ordinal % 200 <> 0
           THEN COALESCE(posts.deleted_by_id, $2::uuid)
         ELSE posts.deleted_by_id
       END
     FROM UNNEST($1::uuid[]) WITH ORDINALITY AS fixture(post_id, ordinal)
     WHERE posts.id = fixture.post_id`,
    [recommendationPostIds, seedUuid(0, '01')],
  )
  await transaction(
    `/* seedPostDiscoverySearchFixture:recommendation-rows */
     INSERT INTO post_topic_recommendations
       (post_id, topic_title, topic_slug, reviewed_at, reviewed_by_id, rejection_reason)
     SELECT fixture.post_id, 'Post Discovery Fixture', 'post-discovery-fixture-' || fixture.ordinal,
       CASE WHEN fixture.ordinal % 200 = 0 THEN CURRENT_TIMESTAMP END,
       CASE WHEN fixture.ordinal % 200 = 0 THEN $2::uuid END,
       CASE WHEN fixture.ordinal % 200 = 0 THEN 'Fixture rejection' END
     FROM UNNEST($1::uuid[]) WITH ORDINALITY AS fixture(post_id, ordinal)
     ON CONFLICT (post_id) DO NOTHING`,
    [recommendationPostIds, seedUuid(0, '01')],
  )
  await transaction(
    '/* seedPostDiscoverySearchFixture:analyze */ ANALYZE posts, community_post_reviews, post_topic_recommendations, communities',
  )
  await transaction.commit()
}

/** Remove only the rows owned by this late-running EXPLAIN cohort. */
export async function cleanupPostDiscoverySearchFixture(): Promise<void> {
  const communityPostIds = Array.from(
    { length: COMMUNITY_POSTS_PER_COMMUNITY * COMMUNITY_COUNT },
    (_, index) => fixturePostId(START_INDEX + index),
  )
  const recommendationPostIds = Array.from({ length: RECOMMENDATION_COUNT }, (_, index) =>
    fixturePostId(START_INDEX + COMMUNITY_POSTS_PER_COMMUNITY * COMMUNITY_COUNT + index),
  )
  const allPostIds = [...communityPostIds, ...recommendationPostIds]
  const communityIds = Array.from({ length: COMMUNITY_COUNT }, (_, index) =>
    seedUuid(100 + index, '14'),
  )

  // Each deleted post runs foreign-key checks, including the self-referential root check.
  // Commit bounded batches so cleanup remains resumable and each statement has finite work.
  for (let offset = 0; offset < allPostIds.length; offset += CLEANUP_BATCH_SIZE) {
    const batch = allPostIds.slice(offset, offset + CLEANUP_BATCH_SIZE)
    await using transaction = await beginTransaction()
    // no-mistakes-disable-next-line query-reached-per-item: each owned 500-post transaction deletes review children before their posts.
    await transaction(
      '/* cleanupPostDiscoverySearchFixture:community-reviews */ DELETE FROM community_post_reviews WHERE post_id = ANY($1::uuid[])',
      [batch],
    )
    // no-mistakes-disable-next-line query-reached-per-item: the same bounded transaction deletes recommendation children before their posts.
    await transaction(
      '/* cleanupPostDiscoverySearchFixture:recommendations */ DELETE FROM post_topic_recommendations WHERE post_id = ANY($1::uuid[])',
      [batch],
    )
    // no-mistakes-disable-next-line query-reached-per-item: deleting at most 500 owned posts per commit bounds FK checks and lock lifetime.
    await transaction(
      '/* cleanupPostDiscoverySearchFixture:posts */ DELETE FROM posts WHERE id = ANY($1::uuid[])',
      [batch],
    )
    await transaction.commit()
  }
  await using transaction = await beginTransaction()
  await transaction(
    '/* cleanupPostDiscoverySearchFixture:communities */ DELETE FROM communities WHERE id = ANY($1::uuid[])',
    [communityIds],
  )
  await transaction.commit()
}
