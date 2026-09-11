import { it, expect, describe } from 'vitest'
import { getPostFeedIds } from '../get-ids.mts'
import {
  followUser,
  muteUser,
  muteTopic,
  blockUser,
  hidePost,
  createTestUser,
  createTestPost,
  createTestTopic,
  createTopHashtagPostSourceForTest,
  createTopHashtagAliasForTest,
  insertScoredPostTopicCategoryRelation,
} from '@voucha/test-helpers'
import { createUnlinkedTopicAlias, linkTopicAlias } from '../../../topics/aliases.mts'

describe('getPostFeedIds (filtering)', () => {
  it('excludes hidden posts', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()

    await followUser(user, followedUser)

    const visiblePost = await createTestPost({ user: followedUser })
    const hiddenPost = await createTestPost({ user: followedUser })
    await hidePost(user, hiddenPost)

    const result = await getPostFeedIds(user, { feed_type: 'follow_users', limit: 100 })

    const foundVisible = result.results.find(r => r.id === visiblePost.id)
    const foundHidden = result.results.find(r => r.id === hiddenPost.id)
    expect(foundVisible).toBeDefined()
    expect(foundHidden).toBeUndefined()
  })

  it('keeps root-post privacy behavior for comments in follow_users feeds', async () => {
    const viewer = await createTestUser()
    const rootAuthor = await createTestUser()
    const commenter = await createTestUser()

    await followUser(viewer, commenter)

    const rootPost = await createTestPost({
      user: rootAuthor,
      broadcast: 'followers',
      privacy: 'private',
    })
    const comment = await createTestPost({
      user: commenter,
      post_type: 'comment',
      parent_id: rootPost.id,
      root_id: rootPost.id,
    })

    // Use explicit post_types to include comments (excluded from default feed)
    const hiddenCommentResult = await getPostFeedIds(viewer, {
      feed_type: 'follow_users',
      post_types: ['comment'],
      limit: 100,
    })

    expect(hiddenCommentResult.results.some(r => r.entity_id === comment.id)).toBe(false)

    await followUser(viewer, rootAuthor)

    const visibleCommentResult = await getPostFeedIds(viewer, {
      feed_type: 'follow_users',
      post_types: ['comment'],
      limit: 100,
    })

    expect(visibleCommentResult.results.some(r => r.entity_id === comment.id)).toBe(true)
  })

  it('excludes posts from muted users', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    const mutedUser = await createTestUser()

    await followUser(user, followedUser)
    await followUser(user, mutedUser)
    await muteUser(user, mutedUser)

    const allowedPost = await createTestPost({ user: followedUser })
    await createTestPost({ user: mutedUser })

    const result = await getPostFeedIds(user, { feed_type: 'follow_users', limit: 100 })

    const foundAllowed = result.results.find(r => r.id === allowedPost.id)
    expect(foundAllowed).toBeDefined()
    // Muted user's posts should not appear (we don't verify this directly but the count should be correct)
    expect(result.results.filter(r => r.id !== allowedPost.id)).toHaveLength(0)
  })

  it('excludes posts from blocked users', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    const blockedUser = await createTestUser()

    await followUser(user, followedUser)
    await followUser(user, blockedUser)
    await blockUser(user, blockedUser)

    const allowedPost = await createTestPost({ user: followedUser })
    await createTestPost({ user: blockedUser })

    const result = await getPostFeedIds(user, { feed_type: 'follow_users', limit: 100 })

    const foundAllowed = result.results.find(r => r.id === allowedPost.id)
    expect(foundAllowed).toBeDefined()
  })

  it('excludes posts with muted related topics', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    const mutedTopic = await createTestTopic({ user: followedUser })

    await followUser(user, followedUser)
    await muteTopic(user, mutedTopic)

    const allowedPost = await createTestPost({ user: followedUser })
    const mutedTopicPost = await createTestPost({ user: followedUser })
    await insertScoredPostTopicCategoryRelation(mutedTopicPost.id, mutedTopic.id, followedUser.id)

    const result = await getPostFeedIds(user, { feed_type: 'follow_users', limit: 100 })

    const foundAllowed = result.results.find(r => r.id === allowedPost.id)
    const foundMuted = result.results.find(r => r.id === mutedTopicPost.id)
    expect(foundAllowed).toBeDefined()
    expect(foundMuted).toBeUndefined()
  })

  it('excludes alias-only posts linked to muted topics', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    const mutedTopic = await createTestTopic({ user: followedUser })
    const alias = await createUnlinkedTopicAlias(`muted-alias-${mutedTopic.id}`)
    await linkTopicAlias(mutedTopic.id, alias.id)
    await followUser(user, followedUser)
    await muteTopic(user, mutedTopic)

    const aliasPost = await createTestPost({ user: followedUser })
    await createTopHashtagPostSourceForTest({
      postId: aliasPost.id,
      topicAliasId: alias.id,
      userId: followedUser.id,
      authoredToken: `#${alias.alias}`,
    })

    const result = await getPostFeedIds(user, { feed_type: 'follow_users', limit: 100 })

    expect(result.results.some(item => item.id === aliasPost.id)).toBe(false)
  })

  it('filters by post_types', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    const topic = await createTestTopic({ user: followedUser, topic_type: 'card' })

    await followUser(user, followedUser)

    const discussion = await createTestPost({ user: followedUser, post_type: 'discussion' })
    await createTestPost({
      user: followedUser,
      post_type: 'data_point',
      data_point_vertical: 'credit_card',
      structured_data: {
        vertical: 'credit_card',
        schema_version: 1,
        currency: 'usd',
        topic_ids: [topic.id],
        result: 'approved',
        credit_score_range: '670-739',
      },
    })

    const result = await getPostFeedIds(user, {
      feed_type: 'follow_users',
      post_types: ['discussion'],
      limit: 100,
    })

    const foundDiscussion = result.results.find(r => r.id === discussion.id)
    expect(foundDiscussion).toBeDefined()
    expect(result.results.every(r => r.post_type === 'discussion')).toBe(true)
  })

  it('filters by all provided universal topics', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    const firstTopic = await createTestTopic({ user: followedUser })
    const secondTopic = await createTestTopic({ user: followedUser })

    await followUser(user, followedUser)

    const matchingPost = await createTestPost({ user: followedUser })
    await insertScoredPostTopicCategoryRelation(matchingPost.id, firstTopic.id, followedUser.id)
    await insertScoredPostTopicCategoryRelation(matchingPost.id, secondTopic.id, followedUser.id)

    const firstOnlyPost = await createTestPost({ user: followedUser })
    await insertScoredPostTopicCategoryRelation(firstOnlyPost.id, firstTopic.id, followedUser.id)

    const result = await getPostFeedIds(user, {
      feed_type: 'follow_users',
      universal_topic_ids: [firstTopic.id, secondTopic.id],
      limit: 100,
    })

    expect(result.results.some(r => r.id === matchingPost.id)).toBe(true)
    expect(result.results.some(r => r.id === firstOnlyPost.id)).toBe(false)
  })

  it('filters by universal topics through hashtag-only post relations', async () => {
    const user = await createTestUser()
    const followedUser = await createTestUser()
    const topic = await createTestTopic({ user: followedUser })
    const post = await createTestPost({ user: followedUser })
    const aliasId = await createTopHashtagAliasForTest(topic.id, `feed-tag-${post.id}`)

    await followUser(user, followedUser)
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: aliasId,
      userId: followedUser.id,
      authoredToken: `#feed-tag-${post.id}`,
    })

    const result = await getPostFeedIds(user, {
      feed_type: 'follow_users',
      universal_topic_ids: [topic.id],
      limit: 100,
    })

    expect(result.results.map(row => row.id)).toContain(post.id)
  })
})
