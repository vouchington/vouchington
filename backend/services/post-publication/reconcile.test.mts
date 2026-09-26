import {
  beginTransaction,
  countTestPostPublicationAdvisoryLockConnections,
  createTestPost,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  expireTestPostPublicationDirtyWorkLease,
  insertTestCommunity,
  insertTestPostReview,
  insertTestPostStory,
  insertTestStory,
  setTestItemStoryId,
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
import { reconcileTestPublicationUntilSnapshotsComplete as reconcilePostPublicationDirtyWork } from './test-fixtures.mts'
describe('post publication reconciliation', () => {
  it('expands an intermediate post scope through every nested reply', async () => {
    const root = await createTestPost()
    const post = await createTestPost({ parent_id: root.id, post_type: 'comment' })
    const nestedReply = await createTestPost({ parent_id: post.id, post_type: 'comment' })
    const linkedDiscussion = await createTestPost({ parent_id: post.id, post_type: 'discussion' })
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_created',
    })
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected publication work lease')
    const result = await reconcilePostPublicationDirtyWork(claimed)

    expect(result.processed).toBe(2)
    expect(result.cursorPostId).toBe(nestedReply.id)
    expect(result.posts.map(candidate => candidate.id)).toEqual(
      expect.arrayContaining([post.id, nestedReply.id]),
    )
    expect(result.posts.map(candidate => candidate.id)).not.toContain(linkedDiscussion.id)
  })

  it('expands retained roots and broad author and community scopes to descendants', async () => {
    const author = await createTestUser()
    if (!author) throw new Error('Expected author fixture')
    const replyAuthor = await createTestUser()
    if (!replyAuthor) throw new Error('Expected reply author fixture')
    const community = await insertTestCommunity({ createdById: author.id })
    const root = await createTestPost({ user: author, community_id: community.id })
    const reply = await createTestPost({
      user: replyAuthor,
      parent_id: root.id,
      post_type: 'comment',
    })
    const nestedReply = await createTestPost({
      user: author,
      parent_id: reply.id,
      post_type: 'comment',
    })
    await using authorChangeQuery = await beginTransaction()
    const authorWork = await recordPostPublicationChange(authorChangeQuery, {
      scope: { type: 'author', authorUserId: replyAuthor.id },
      reason: 'author_suspension_changed',
    })
    await authorChangeQuery.commit()
    const claimedAuthorWork = await claimPostPublicationDirtyWork(authorWork, 60)
    if (!claimedAuthorWork) throw new Error('Expected author publication work lease')
    const authorResult = await reconcilePostPublicationDirtyWork(claimedAuthorWork)
    expect(authorResult.posts.map(post => post.id)).toEqual(
      expect.arrayContaining([reply.id, nestedReply.id]),
    )
    await using communityChangeQuery = await beginTransaction()
    const communityWork = await recordPostPublicationChange(communityChangeQuery, {
      scope: { type: 'community', communityId: community.id },
      reason: 'community_publication_changed',
      impactedPostIds: [root.id],
    })
    await communityChangeQuery.commit()
    const claimedCommunityWork = await claimPostPublicationDirtyWork(communityWork, 60)
    if (!claimedCommunityWork) throw new Error('Expected community publication work lease')
    const communityResult = await reconcilePostPublicationDirtyWork(claimedCommunityWork)
    expect(communityResult.posts.map(post => post.id)).toEqual(
      expect.arrayContaining([root.id, reply.id, nestedReply.id]),
    )
  })

  it('expands an RSS scope through its retained story root and retains exact sitemap targets', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected RSS post author')
    const topic = await createTestTopic({ user })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const story = await insertTestStory()
    await setTestItemStoryId(item.id, story.id)
    const root = await createTestPost({ user })
    const reply = await createTestPost({ user, parent_id: root.id, post_type: 'comment' })
    await insertTestPostStory(root.id, story.id, user.id)
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'rss_feed', rssFeedId: feedId },
      reason: 'rss_feed_enablement_changed',
      impactedPostIds: [root.id],
    })
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected RSS publication work lease')
    const result = await reconcilePostPublicationDirtyWork(claimed)

    expect(result.posts.map(post => post.id)).toEqual(expect.arrayContaining([root.id, reply.id]))
    expect(result.sitemapTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ postType: root.post_type, day: expect.any(String) }),
      ]),
    )
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

    const result = await reconcilePostPublicationDirtyWork(claimed, 2)

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

    const result = await reconcilePostPublicationDirtyWork(claimed)

    expect(result.topicIds).toEqual(expect.arrayContaining([owner.id]))
  })

  it('drains retained topics after post pages without losing their generation-fenced cursor', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected topic-page author')
    const post = await createTestPost({ user })
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
        withPostPublicationReconciliationLocks([...postIds].reverse(), async () => {}),
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
      parent_id: post.parent_id,
      root_id: post.root_id,
      created_by_id: post.created_by_id,
      community_id: post.community_id,
      post_type: post.post_type,
      sitemap_day: new Date().toISOString().slice(0, 10),
      is_public: true,
      eligibility_fingerprint: 'stale-receipt',
      projection_identity: { topicIds: [], identityKeys: [], sitemapTargets: [] },
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
