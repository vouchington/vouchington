import {
  beginTransaction,
  createTestPost,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  insertTestCommunity,
  insertTestPostStory,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { claimPostPublicationDirtyWork, recordPostPublicationChange } from './public.mts'
import { recordStoryTopicPublicationChanges } from './capture-story-topics.mts'
import {
  reconcileTestPublicationUntilSnapshotsComplete as reconcilePostPublicationDirtyWork,
  testPublicationWorkAtPost,
} from '@voucha/test-helpers/post-publication-fixtures'

describe('post publication broad scopes', () => {
  it('expands retained roots and broad author and community scopes to descendants', async () => {
    const author = await createTestUser()
    if (!author) throw new Error('Expected author fixture')
    const replyAuthor = await createTestUser()
    if (!replyAuthor) throw new Error('Expected reply author fixture')
    const community = await insertTestCommunity({ createdById: author.id })
    const root = await createTestPost({ user: author, community_id: community.id })
    const reply = await createTestPost({
      user: replyAuthor,
      parent_post_id: root.id,
      post_type: 'comment',
    })
    const nestedReply = await createTestPost({
      user: author,
      parent_post_id: reply.id,
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
    const authorReply = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(claimedAuthorWork, reply.id),
      1,
    )
    const authorNested = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(claimedAuthorWork, nestedReply.id),
      1,
    )
    expect(authorReply.posts.map(post => post.id)).toEqual([reply.id])
    expect(authorNested.posts.map(post => post.id)).toEqual([nestedReply.id])
    await using communityChangeQuery = await beginTransaction()
    const communityWork = await recordPostPublicationChange(communityChangeQuery, {
      scope: { type: 'community', communityId: community.id },
      reason: 'community_publication_changed',
      impactedPostIds: [root.id],
    })
    await communityChangeQuery.commit()
    const claimedCommunityWork = await claimPostPublicationDirtyWork(communityWork, 60)
    if (!claimedCommunityWork) throw new Error('Expected community publication work lease')
    for (const postId of [root.id, reply.id, nestedReply.id]) {
      const page = await reconcilePostPublicationDirtyWork(
        testPublicationWorkAtPost(claimedCommunityWork, postId),
        1,
      )
      expect(page.posts.map(post => post.id)).toEqual([postId])
    }
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
    const reply = await createTestPost({ user, parent_post_id: root.id, post_type: 'comment' })
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
    const result = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(claimed, root.id),
      1,
    )
    const replyPage = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(claimed, reply.id),
      1,
    )
    expect(result.posts.map(post => post.id)).toEqual([root.id])
    expect(replyPage.posts.map(post => post.id)).toEqual([reply.id])
    expect(result.sitemapTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ postType: root.post_type, day: expect.any(String) }),
      ]),
    )
  })

  it('uses retained story impacts for root and nested descendants without admitting unrelated posts', async () => {
    const user = await createTestUser()
    const story = await insertTestStory()
    const root = await createTestPost({ user })
    const reply = await createTestPost({ user, parent_post_id: root.id, post_type: 'comment' })
    const nestedReply = await createTestPost({
      user,
      parent_post_id: reply.id,
      post_type: 'comment',
    })
    const unrelated = await createTestPost({ user })
    await using query = await beginTransaction()
    const [work] = await recordStoryTopicPublicationChanges(query, [
      {
        storyId: story.id,
        impactedPostIds: [root.id],
        impactedTopicIds: [],
      },
    ])
    await query.commit()
    if (!work) throw new Error('Expected story publication work')
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected story publication work lease')
    for (const postId of [root.id, reply.id, nestedReply.id]) {
      const page = await reconcilePostPublicationDirtyWork(
        testPublicationWorkAtPost(claimed, postId),
        1,
      )
      expect(page.posts.map(post => post.id)).toEqual([postId])
    }
    const excluded = await reconcilePostPublicationDirtyWork(
      testPublicationWorkAtPost(claimed, unrelated.id),
      1,
    )
    expect(excluded.posts).toEqual([])
  })
})
