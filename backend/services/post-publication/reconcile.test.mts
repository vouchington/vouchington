import {
  beginTransaction,
  countTestPostPublicationAdvisoryLockConnections,
  createTestPost,
  createTestTopic,
  createTestUser,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  expireTestPostPublicationDirtyWorkLease,
  insertTestPostReview,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  acknowledgePostPublicationDirtyWork,
  acknowledgePostPublicationProjectionReceipts,
  claimPostPublicationDirtyWork,
  recordPostPublicationChange,
  updatePostPublicationDirtyWorkCursors,
  withPostPublicationReconciliationLocks,
} from './public.mts'
import {
  reconcileTestPublicationUntilSnapshotsComplete as reconcilePostPublicationDirtyWork,
  reconcileTestPublicationThroughPostSweep,
  testPublicationWorkAtPost,
} from '@voucha/test-helpers/post-publication-fixtures'
describe('post publication reconciliation', () => {
  it('expands an intermediate post scope through every nested reply', async () => {
    const root = await createTestPost()
    const post = await createTestPost({ parent_post_id: root.id, post_type: 'comment' })
    const nestedReply = await createTestPost({ parent_post_id: post.id, post_type: 'comment' })
    const linkedDiscussion = await createTestPost({
      parent_post_id: post.id,
      post_type: 'discussion',
    })
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_created',
    })
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected publication work lease')
    const postPage = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(claimed, post.id),
      1,
    )
    const nestedPage = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(claimed, nestedReply.id),
      1,
    )
    const excludedPage = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(claimed, linkedDiscussion.id),
      1,
    )
    expect(postPage.posts.map(candidate => candidate.id)).toEqual([post.id])
    expect(nestedPage.posts.map(candidate => candidate.id)).toEqual([nestedReply.id])
    expect(excludedPage.posts.map(candidate => candidate.id)).toEqual([])
  })

  it('bounds the union of retained and current topic ratings', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected review author')
    const [currentTopic, retainedTopic] = await Promise.all([
      createTestTopic({ user }),
      createTestTopic({ user }),
    ])
    const post = await createTestPost({ user, post_type: 'review' })
    await insertTestPostReview(post.id, currentTopic.id)
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_ratings_changed',
      impactedTopicIds: [retainedTopic.id],
    })
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected topic publication work lease')
    const { posts, final: result } = await reconcileTestPublicationThroughPostSweep(
      claimed,
      2,
      post.id,
    )

    expect(posts.map(candidate => candidate.id)).toContain(post.id)
    expect(result.topicIds).toEqual(expect.arrayContaining([currentTopic.id, retainedTopic.id]))
  })

  it('retains a current topic-alias owner for ordinary post work', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected topic-alias post author')
    const owner = await createTestTopic({ user })
    const post = await createTestPost({ user })
    const aliasId = await createTopHashtagAliasForTest(owner.id, `alias-${crypto.randomUUID()}`)
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: aliasId,
      userId: user.id,
      authoredToken: '#ordinary-post-work',
    })
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_updated',
    })
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected ordinary post publication work lease')

    const { posts, final: result } = await reconcileTestPublicationThroughPostSweep(
      claimed,
      2,
      post.id,
    )

    expect(posts.map(candidate => candidate.id)).toContain(post.id)
    expect(result.topicIds).toEqual(expect.arrayContaining([owner.id]))
  })

  it('drains retained topics after post pages without losing their generation-fenced cursor', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected topic-page author')
    const post = await createTestPost({ user })
    // The first page must stop before a later raw post so topic draining is
    // checked on the following post-EOF page, independent of global fixtures.
    const laterRawPost = await createTestPost()
    expect(BigInt(`0x${laterRawPost.id.replaceAll('-', '')}`)).toBeGreaterThan(
      BigInt(`0x${post.id.replaceAll('-', '')}`),
    )
    const topics = await Promise.all(Array.from({ length: 3 }, () => createTestTopic({ user })))
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_topics_changed',
      impactedTopicIds: topics.map(topic => topic.id),
    })
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected topic-page work lease')

    const postPage = await reconcilePostPublicationDirtyWork(claimed, 1)
    expect(postPage).toMatchObject({ hasMorePosts: true, topicIds: [] })
    const fence = {
      id: claimed.id,
      generation: claimed.generation,
      leaseToken: claimed.lease_token,
    }
    await expect(updatePostPublicationDirtyWorkCursors(fence, { postId: post.id })).resolves.toBe(
      true,
    )
    const afterPosts = { ...claimed, cursor_post_id: post.id }

    const firstTopicPage = await reconcilePostPublicationDirtyWork(afterPosts, 1)
    expect(firstTopicPage).toMatchObject({ hasMorePosts: false, hasMoreTopics: true })
    expect(firstTopicPage.topicIds).toHaveLength(1)
    await expect(
      updatePostPublicationDirtyWorkCursors(fence, { topicId: firstTopicPage.topicIds[0]! }),
    ).resolves.toBe(true)
    const secondTopicPage = await reconcilePostPublicationDirtyWork(
      { ...afterPosts, cursor_topic_id: firstTopicPage.topicIds[0]! },
      1,
    )
    expect(secondTopicPage.topicIds).toHaveLength(1)
    expect(secondTopicPage.topicIds[0]).not.toBe(firstTopicPage.topicIds[0])
    await using replacementTopicChangeQuery = await beginTransaction()
    const replacement = await recordPostPublicationChange(replacementTopicChangeQuery, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_topics_changed',
      impactedTopicIds: topics.map(topic => topic.id),
    })
    await replacementTopicChangeQuery.commit()
    const replacementClaim = await claimPostPublicationDirtyWork(replacement, 60)
    if (!replacementClaim) throw new Error('Expected replacement topic-page work lease')
    const replacementAfterPosts = { ...replacementClaim, cursor_post_id: post.id }
    const restartedTopicPage = await reconcilePostPublicationDirtyWork(replacementAfterPosts, 1)
    expect(restartedTopicPage.topicIds).toEqual(firstTopicPage.topicIds)
  })

  it('acquires more post locks than the pool size through one sorted advisory-lock session', async () => {
    const postIds = Array.from(
      { length: 32 },
      (_, index) => `00000000-0000-7000-8000-${String(index).padStart(12, '0')}`,
    )
    await expect(
      countTestPostPublicationAdvisoryLockConnections(() =>
        withPostPublicationReconciliationLocks([...postIds].toReversed(), async () => {}),
      ),
    ).resolves.toBe(1)
  })

  it('does not acknowledge stale leases or receipts from a replaced generation', async () => {
    const post = await createTestPost()
    await using staleWorkQuery = await beginTransaction()
    const work = await recordPostPublicationChange(staleWorkQuery, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_updated',
    })
    await staleWorkQuery.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected stale-work lease')
    await expireTestPostPublicationDirtyWorkLease(work.id)

    const stalePost = {
      id: post.id,
      parent_post_id: post.parent_post_id ?? null,
      root_post_id: post.root_post_id,
      created_by_id: post.created_by_id,
      community_id: post.community_id,
      post_type: post.post_type,
      sitemap_day: new Date().toISOString().slice(0, 10),
      is_public: true,
      eligibility_fingerprint: 'stale-receipt',
    }
    await expect(acknowledgePostPublicationProjectionReceipts(claimed, [stalePost])).resolves.toBe(
      false,
    )
    await expect(
      acknowledgePostPublicationDirtyWork({
        id: claimed.id,
        generation: claimed.generation,
        leaseToken: claimed.lease_token,
      }),
    ).resolves.toBe(false)
    await using replacementWorkQuery = await beginTransaction()
    const replacement = await recordPostPublicationChange(replacementWorkQuery, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_updated',
    })
    await replacementWorkQuery.commit()
    expect(Number(replacement.generation)).toBeGreaterThan(Number(claimed.generation))
    await expect(
      acknowledgePostPublicationDirtyWork({
        id: claimed.id,
        generation: claimed.generation,
        leaseToken: claimed.lease_token,
      }),
    ).resolves.toBe(false)
  })
})
