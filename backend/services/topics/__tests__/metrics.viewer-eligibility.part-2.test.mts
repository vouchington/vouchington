import { it, expect, describe } from 'vitest'
import { getTopicViewerCounts } from '../metrics.mts'
import {
  createTestUser,
  createTestPost,
  createTestTopic,
  insertScoredPostTopicCategoryRelation,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  suspendTestUser,
  setPostModerationComplete,
  insertTestCommunity,
  insertTestReview,
  insertTestDataPoint,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

// Regression coverage for #11080, mirroring metrics-batch.test.mts's #11028 fixture: the
// count__discussions candidate-bind rewrite reads posts through a topic-side
// relation__post__category__topic UNION ALL relation__post__category__topic_alias subselect
// instead of a correlated EXISTS, so a post attached via BOTH branches must still dedupe to one
// row via the outer COUNT(DISTINCT candidate_post.id). Broadcast/privacy visibility, creator-sees-
// own, archived exclusion, zero-score relations, and alias-only attachment (in isolation) are
// already covered in metrics.part-2.test.mts and metrics.viewer-alias.part-2.test.mts and are not
// repeated here. The alias-only fixture IS repeated below alongside the dual-attached one, because
// (unlike the old correlated EXISTS) the rewritten UNION ALL only proves it isn't silently dropping
// the alias arm when something else in the same result set forces a dedupe.
describe('getTopicViewerCounts — eligibility and dedup', () => {
  it('dedupes dual-attached posts, counts alias-only posts, and excludes ineligible ones', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const author = (await createTestUser()) as PrivateUser
    const suspendedAuthor = (await createTestUser()) as PrivateUser
    const viewer = (await createTestUser()) as PrivateUser
    const topic = await createTestTopic({
      user: author,
      name: `Viewer Discussions Correctness ${random}`,
      topic_type: 'topic',
    })

    // Eligible, attached via BOTH the direct relation and an alias relation -- must count once.
    const dualAttachedPost = await createTestPost({ user: author, post_type: 'discussion' })
    await insertScoredPostTopicCategoryRelation(dualAttachedPost.id, topic.id, author.id)
    const aliasId = await createTopHashtagAliasForTest(topic.id, `viewer-dual-alias-${random}`)
    await createTopHashtagPostSourceForTest({
      postId: dualAttachedPost.id,
      topicAliasId: aliasId,
      userId: author.id,
      authoredToken: `#viewer-dual-alias-${random}`,
    })

    // Eligible, attached via the direct relation only.
    const directOnlyPost = await createTestPost({ user: author, post_type: 'discussion' })
    await insertScoredPostTopicCategoryRelation(directOnlyPost.id, topic.id, author.id)

    // Eligible, attached via the alias relation only -- proves the alias arm of the UNION ALL
    // contributes on its own rather than only ever appearing as a duplicate of the direct arm.
    const aliasOnlyPost = await createTestPost({ user: author, post_type: 'discussion' })
    const aliasOnlyAliasId = await createTopHashtagAliasForTest(
      topic.id,
      `viewer-alias-only-${random}`,
    )
    await createTopHashtagPostSourceForTest({
      postId: aliasOnlyPost.id,
      topicAliasId: aliasOnlyAliasId,
      userId: author.id,
      authoredToken: `#viewer-alias-only-${random}`,
    })

    // Excluded: author has an un-lifted suspension.
    const suspendedAuthorPost = await createTestPost({
      user: suspendedAuthor,
      post_type: 'discussion',
    })
    await insertScoredPostTopicCategoryRelation(suspendedAuthorPost.id, topic.id, author.id)
    await suspendTestUser(suspendedAuthor.id)

    // Excluded: community post with no approved community_post_reviews row.
    const community = await insertTestCommunity({ createdById: author.id })
    const unapprovedCommunityPost = await createTestPost({
      user: author,
      post_type: 'discussion',
      community_id: community.id,
    })
    await insertScoredPostTopicCategoryRelation(unapprovedCommunityPost.id, topic.id, author.id)

    const counts = await getTopicViewerCounts(viewer, topic.id)

    expect(counts.discussions).toBe(3)
  })

  it('counts posts that have completed moderation and remain approved', async () => {
    const author = (await createTestUser()) as PrivateUser
    const viewer = (await createTestUser()) as PrivateUser
    const topic = await createTestTopic({
      user: author,
      name: `Viewer Flagged Post Parity ${Math.random().toString(36).slice(2, 8)}`,
      topic_type: 'topic',
    })

    const flaggedPost = await createTestPost({ user: author, post_type: 'discussion' })
    await insertScoredPostTopicCategoryRelation(flaggedPost.id, topic.id, author.id)
    await setPostModerationComplete(flaggedPost.id, true)

    const counts = await getTopicViewerCounts(viewer, topic.id)

    expect(counts.discussions).toBe(1)
  })

  // count__reviews and count__data_points never touch the topic relation this issue rewrites --
  // this guards their existing behavior, which previously had zero non-zero-count coverage.
  it('counts reviews and data points attached to the topic', async () => {
    const author = (await createTestUser()) as PrivateUser
    const viewer = (await createTestUser()) as PrivateUser
    const topic = await createTestTopic({
      user: author,
      name: `Viewer Reviews And Data Points ${Math.random().toString(36).slice(2, 8)}`,
      topic_type: 'topic',
    })

    await insertTestReview({
      userId: author.id,
      topicRatings: [{ topicId: topic.id, rating: 5 }],
    })
    await insertTestDataPoint({
      title: `Data Point ${Date.now()}`,
      slug: `viewer-data-point-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdById: author.id,
      topicId: topic.id,
    })

    const counts = await getTopicViewerCounts(viewer, topic.id)

    expect(counts.reviews).toBe(1)
    expect(counts['data-points']).toBe(1)
  })
})
